// Allow Agent SDK to spawn subprocesses
delete process.env.CLAUDECODE;

import express from "express";
import cors from "cors";
import { scanRepo } from "./repo-scanner.js";
import { analyzeComparative, type RepoInput } from "./analyze-agent.js";
import { generateMockAnalysis, generateAnalysisResult as generateMockResult } from "./mock-analysis.js";
import type { RepoData, RepoMetadata } from "./types/github.js";
import type { RepoAnalysis, SSEEvent } from "./types/analysis.js";
import * as historyDb from "./db.js";

const app = express();
const PORT = process.env.PORT ?? 3001;
const USE_MOCK = process.env.USE_MOCK === "true";

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

function sendSSE(res: express.Response, event: SSEEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

app.post("/analyze", async (req, res) => {
  const { urls, githubToken } = req.body as {
    urls: string[];
    githubToken?: string;
  };

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    res.status(400).json({ error: "urls array is required" });
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const repoAnalyses: Map<string, RepoAnalysis> = new Map();
  // Collect Phase 2 inputs from all repos
  const phase2Inputs: RepoInput[] = [];

  // Phase 1: scan all repos in parallel (instant heuristic scoring)
  await Promise.all(
    urls.map(async (url) => {
      const repoMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      const repoName = repoMatch ? `${repoMatch[1]}/${repoMatch[2].replace(/\.git$/, "")}` : url;

      await scanRepo(url, githubToken, {
        onMetadata: (metadata: RepoMetadata) => {
          sendSSE(res, { type: "metadata", repo: repoName, data: metadata });
        },
        onPhase1: async (data: RepoData) => {
          // Phase 1 is always instant heuristic scoring — no LLM
          const analysis = generateMockAnalysis(data);
          repoAnalyses.set(repoName, analysis);
          const result = generateMockResult([...repoAnalyses.values()]);
          sendSSE(res, { type: "phase1", repo: repoName, data: result });
        },
        onPhase2: async (data: RepoData, repoPath: string) => {
          // Collect data for comparative analysis — don't run agent yet
          phase2Inputs.push({ name: repoName, data, repoPath });
        },
        onError: (message: string) => {
          sendSSE(res, { type: "error", repo: repoName, message });
        },
      });
    })
  );

  // Phase 2: run ONE comparative agent with all repos
  if (phase2Inputs.length > 0 && !USE_MOCK) {
    try {
      const { analyses, comparison } = await analyzeComparative(phase2Inputs);
      // Send Phase 2 results for all repos
      for (const analysis of analyses) {
        repoAnalyses.set(analysis.name, analysis);
      }
      const result = {
        repos: analyses,
        comparison,
        overallSummary: `Comparative analysis of ${analyses.length} repositories.`,
      };
      // Send one phase2 event per repo so UI updates each card
      for (const analysis of analyses) {
        sendSSE(res, { type: "phase2", repo: analysis.name, data: result });
      }
    } catch (err) {
      console.error(`Phase 2 comparative error:`, err instanceof Error ? err.message : err, err instanceof Error ? err.stack : '');
      // Fallback: send heuristic results as phase2
      for (const input of phase2Inputs) {
        const analysis = generateMockAnalysis(input.data);
        repoAnalyses.set(input.name, analysis);
      }
      const result = generateMockResult([...repoAnalyses.values()]);
      for (const input of phase2Inputs) {
        sendSSE(res, { type: "phase2", repo: input.name, data: result });
      }
    }
  } else if (phase2Inputs.length > 0 && USE_MOCK) {
    // Mock mode: just send heuristic results as phase2
    for (const input of phase2Inputs) {
      const analysis = generateMockAnalysis(input.data);
      repoAnalyses.set(input.name, analysis);
    }
    const result = generateMockResult([...repoAnalyses.values()]);
    for (const input of phase2Inputs) {
      sendSSE(res, { type: "phase2", repo: input.name, data: result });
    }
  }

  sendSSE(res, { type: "done" });
  res.end();
});

// --- History API ---

app.get("/history", (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  res.json(historyDb.getHistory(userId));
});

app.get("/history/:id", (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const entry = historyDb.getEntry(req.params.id, userId);
  if (!entry) { res.status(404).json({ error: "not found" }); return; }
  res.json(entry);
});

app.post("/history", (req, res) => {
  const { userId, urls, repos, status, analyses, comparison } = req.body;
  if (!userId || !urls || !repos) {
    res.status(400).json({ error: "userId, urls, repos required" });
    return;
  }
  if (status === "completed") {
    res.json(historyDb.addCompleted(userId, urls, repos, analyses, comparison));
  } else {
    res.json(historyDb.addQueued(userId, urls, repos));
  }
});

app.delete("/history/:id", (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const ok = historyDb.deleteEntry(req.params.id, userId);
  res.json({ ok });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}${USE_MOCK ? " (MOCK MODE)" : ""}`);
});
