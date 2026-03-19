import { query } from "@anthropic-ai/claude-agent-sdk";
import * as path from "path";
import { fileURLToPath } from "url";
import type { RepoAnalysis } from "./types/analysis.js";

const cleanEnv = { ...process.env };
delete cleanEnv.CLAUDECODE;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.join(__dirname, "..", "..", "repos");

interface ChatRepo {
  name: string;
  analysis: RepoAnalysis;
}

function summarizeAnalysis(repo: ChatRepo): string {
  const a = repo.analysis;
  const dirName = repo.name.replace("/", "--");
  const dimSummary = Object.entries(a.dimensions)
    .map(([name, d]) => {
      const metrics = d.metrics?.map((m) => `${m.label}: ${m.value}`).join(", ") ?? "";
      return `- ${name}: ${d.score}/10${d.summary ? ` — ${d.summary}` : ""}${metrics ? ` [${metrics}]` : ""}`;
    })
    .join("\n");

  return `### ${a.name}
**Directory:** \`${dirName}/\`
**Description:** ${a.description}

**Scores:**
${dimSummary}`;
}

function buildFreshPrompt(repos: ChatRepo[], message: string): string {
  const context = repos.map(summarizeAnalysis).join("\n\n---\n\n");

  return `You are a code analysis assistant. The user has analyzed these repositories and wants to ask follow-up questions.

## Analysis Context
${context}

## Tools
You have Read, Glob, and Grep tools to investigate the cloned repositories at \`${REPOS_DIR}/\`.
Use directory prefix like \`owner--repo/path/to/file\` when reading files.

## Guidelines
- Be concise and direct
- Show relevant code snippets (max 10 lines)
- Compare repos side-by-side when asked

## Question
${message}`;
}

export async function answerChat(
  sessionId: string | undefined,
  message: string,
  repos: ChatRepo[] | undefined,
  onChunk: (text: string) => void,
): Promise<string> {
  const isResume = !!sessionId;
  const prompt = isResume ? message : buildFreshPrompt(repos ?? [], message);

  console.log(`[Chat] ${isResume ? `Resuming session ${sessionId}` : "New session"}, question length: ${message.length}`);

  const options: Record<string, unknown> = {
    model: "sonnet",
    executable: "node",
    cwd: REPOS_DIR,
    allowedTools: ["Read", "Glob", "Grep"],
    disallowedTools: ["Bash", "Edit", "Write", "Agent"],
    maxTurns: 20,
    persistSession: true,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    env: cleanEnv,
  };

  if (isResume) {
    options.resume = sessionId;
  }

  const q = query({ prompt, options });

  let fullResponse = "";

  for await (const msg of q) {
    if (msg.type === "assistant") {
      const assistantMsg = msg as Record<string, unknown>;
      const msgContent = assistantMsg.message as { content: Array<{ type: string; text?: string }> } | undefined;
      if (msgContent?.content) {
        for (const block of msgContent.content) {
          if (block.type === "text" && block.text) {
            onChunk(block.text);
            fullResponse += block.text;
          }
        }
      }
    } else if (msg.type === "result") {
      if ((msg as Record<string, unknown>).subtype === "success") {
        const result = (msg as Record<string, unknown>).result as string;
        console.log(`[Chat] Complete, response length: ${result.length}`);
        return result;
      }
      throw new Error(`Chat agent failed: ${(msg as Record<string, unknown>).subtype}`);
    }
  }

  return fullResponse || "No response generated.";
}
