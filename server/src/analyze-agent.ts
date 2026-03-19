import { query } from "@anthropic-ai/claude-agent-sdk";
import * as path from "path";
import { fileURLToPath } from "url";
import type { RepoData } from "./types/github.js";
import type { RepoAnalysis, DimensionAnalysis, DimensionMetric, Evidence } from "./types/analysis.js";

// Strip CLAUDECODE env var so the Agent SDK can spawn subprocesses
const cleanEnv = { ...process.env };
delete cleanEnv.CLAUDECODE;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.join(__dirname, "..", "..", "repos");

const DIMENSIONS = [
  "Adoption",
  "Maintenance",
  "Leanness",
  "Code Quality",
  "Documentation",
  "Architecture",
  "Security",
  "Performance",
  "Robustness",
];

export interface RepoInput {
  name: string;       // owner/repo
  data: RepoData;
  repoPath: string;   // absolute path to cloned repo
}

// Build a schema that outputs all repos keyed by name
function buildComparativeSchema(repoNames: string[]) {
  const dimensionSchema = {
    type: "object" as const,
    properties: {
      score: { type: "number" as const, description: "1-10 score" },
      summary: { type: "string" as const, description: "One sentence, max 12 words" },
      metrics: {
        type: "array" as const,
        description: "3-6 comparable metrics as label/value pairs. USE THE SAME LABELS across all repos for each dimension so they can be compared side-by-side.",
        items: {
          type: "object" as const,
          properties: {
            label: { type: "string" as const, description: "Short metric name, 1-3 words. MUST be identical across repos." },
            value: { type: "string" as const, description: "Concise value, 1-4 words" },
            sentiment: { type: "string" as const, enum: ["positive", "negative", "neutral"] },
          },
          required: ["label", "value", "sentiment"],
        },
      },
      evidence: {
        type: "array" as const,
        description: "1-3 key code citations",
        items: {
          type: "object" as const,
          properties: {
            filePath: { type: "string" as const },
            lines: { type: "string" as const },
            snippet: { type: "string" as const, description: "Max 3 lines of code" },
            observation: { type: "string" as const, description: "Max 10 words" },
            sentiment: { type: "string" as const, enum: ["positive", "negative", "neutral"] },
          },
          required: ["filePath", "snippet", "observation", "sentiment"],
        },
      },
    },
    required: ["score", "summary", "metrics", "evidence"],
  };

  return {
    type: "object" as const,
    properties: {
      repos: {
        type: "object" as const,
        properties: Object.fromEntries(
          repoNames.map((name) => [
            name,
            {
              type: "object" as const,
              properties: {
                description: { type: "string" as const, description: "One sentence repo description" },
                dimensions: {
                  type: "object" as const,
                  properties: Object.fromEntries(
                    DIMENSIONS.map((dim) => [dim, dimensionSchema])
                  ),
                  required: DIMENSIONS,
                },
                pipelines: {
                  type: "array" as const,
                  description: "3-6 pipeline diagrams: one per major feature/function, plus one overall architecture diagram as the last entry. Each uses Mermaid flowchart syntax.",
                  items: {
                    type: "object" as const,
                    properties: {
                      title: { type: "string" as const, description: "Pipeline name, e.g. 'Training Pipeline', 'Request Handling', 'Overall Architecture'" },
                      description: { type: "string" as const, description: "One sentence explaining what this pipeline does" },
                      mermaid: { type: "string" as const, description: "Valid Mermaid flowchart definition (graph TD or graph LR). Use descriptive node labels. Keep to 5-15 nodes. No special characters in node IDs." },
                      explanation: { type: "string" as const, description: "Detailed explanation (3-5 sentences) of how this pipeline works. Reference specific files, modules, and classes. Explain what each stage does and how data flows between them." },
                    },
                    required: ["title", "description", "mermaid", "explanation"],
                  },
                },
              },
              required: ["description", "dimensions", "pipelines"],
            },
          ])
        ),
        required: repoNames,
      },
      comparison: {
        type: "object" as const,
        properties: {
          summary: { type: "string" as const, description: "1-2 sentence comparison verdict" },
          winner: { type: "string" as const, description: "owner/repo of the winner, or 'tie'" },
        },
        required: ["summary", "winner"],
      },
    },
    required: ["repos", "comparison"],
  };
}

function buildComparativePrompt(repos: RepoInput[]): string {
  const repoSections = repos.map((r) => {
    const readme = r.data.files.find((f) => f.path.toLowerCase().startsWith("readme"));
    const dirName = path.basename(r.repoPath);
    const fileCount = r.data.tree.filter((e) => e.type === "file").length;
    const treePreview = r.data.tree
      .filter((e) => e.type === "file")
      .slice(0, 80)
      .map((e) => `${e.path}${e.size ? ` (${e.size}b)` : ""}`)
      .join("\n");

    return `### ${r.name}
**Directory:** \`${dirName}/\` (use this prefix when reading files with Read tool)
- Stars: ${r.data.metadata.stars} | Forks: ${r.data.metadata.forks} | Open Issues: ${r.data.metadata.openIssues}
- Language: ${r.data.metadata.language ?? "Unknown"} | License: ${r.data.metadata.license ?? "None"}
- Contributors: ${r.data.metadata.contributorsCount} | Size: ${r.data.metadata.size}KB
- Created: ${r.data.metadata.createdAt} | Last pushed: ${r.data.metadata.pushedAt}
${readme ? `\n**README (excerpt):**\n${readme.content.slice(0, 3000)}` : "No README found."}

**File Tree (${fileCount} files, showing first 80):**
${treePreview}`;
  }).join("\n\n---\n\n");

  return `You are doing a **comparative analysis** of ${repos.length} repositories.

## STEP 1: Understand what each repo IS and DOES
Before reading any code, study the README and metadata for each repo. Answer for yourself:
- What problem does this repo solve? What is its core value proposition?
- Who is the target user? (developers, end-users, researchers, etc.)
- What are the key claimed features?
- What domain does it operate in? (ML inference, web framework, CLI tool, etc.)

## STEP 2: Read code with domain awareness
When reading source files, evaluate them in context of the repo's PURPOSE:
- Does the code actually implement what the README claims?
- Are the core features well-implemented or superficial?
- For an ML repo: is the model pipeline sound? training/inference code quality?
- For a web framework: is routing/middleware well-designed? extensibility?
- For a library: is the API well-designed? edge cases handled?
- Think like a practitioner in that domain evaluating whether to adopt this tool.

## STEP 3: Produce comparative metrics
For EACH dimension, use the **exact same metric labels** across all repos so they can be compared side-by-side.

Good example (same labels, domain-aware values):
- Repo A Code Quality: [Core Pipeline: "Clean TTS pipeline with proper audio processing", Test Coverage: "Unit tests for all codecs", Type Safety: "Fully typed with mypy strict"]
- Repo B Code Quality: [Core Pipeline: "Training loop missing validation step", Test Coverage: "No tests found", Type Safety: "No type hints"]

Bad example (generic, no insight):
- Repo A: [Has linter: "Yes", Has CI: "Yes"]
- Repo B: [Has linter: "No", Has CI: "Yes"]

## Dimension Definitions
- **Code Quality**: Does the core logic do what it claims? Are the important code paths well-written? Testing, typing, linting matter but secondary to whether the actual functionality works well.
- **Documentation**: Can a new user actually get this running? Are the claimed features documented with real examples? API reference quality. Gap between what README promises and what docs actually explain.
- **Architecture**: Is the codebase organized for its purpose? Modularity, separation of concerns, extensibility. Does the structure make sense for the domain?
- **Security**: Input validation, auth, secrets handling, dependency hygiene. Evaluated relative to what the repo does — a public ML inference server has different security needs than a CLI tool.
- **Performance**: Is the code efficient for its use case? An ML repo should care about inference speed, batching, GPU utilization. A web server should care about concurrency, caching, connection pooling. Evaluate what matters for THIS repo.
- **Robustness**: Error handling, retries, graceful degradation, edge cases. Does the code handle real-world failure modes that users of THIS type of tool would encounter?
- **Adoption**: Community trust — stars, forks, contributor count, ecosystem presence.
- **Maintenance**: Activity — push recency, issue response, release cadence.
- **Leanness**: Right-sized for its purpose — file count, dependency count, language spread. Higher = leaner.

## Repositories

${repoSections}

## Instructions
1. Read the README thoroughly first. Understand what each repo claims to do.
2. Use Read tool on 8-15 key source files **per repo** — focus on CORE functionality, not just configs.
3. For each dimension, pick 3-6 metric labels that reflect domain-relevant comparison points. Use the SAME labels across all repos.
4. Metric values should show INSIGHT: not "Yes/No" for generic checks, but specific findings like "Streaming inference with chunked audio output" or "No batch processing — single request only".
5. Be critical — most repos are 4-7. A repo can have 20K stars and still have mediocre code quality.
6. Evidence file paths should be relative to the repo directory (e.g. \`src/index.ts\`).

## Pipeline Diagrams
For EACH repo, generate 3-6 pipeline diagrams that show how the repo works:
- One diagram per major feature/function (e.g. "Training Pipeline", "Inference Pipeline", "Request Handling", "Build Process", "Data Processing")
- The LAST diagram must be "Overall Architecture" showing how all components connect
- Adapt the pipelines to what the repo actually does — an ML repo gets training/inference pipelines, a web server gets request/response pipelines, a CLI tool gets command execution pipelines, a video generator gets rendering pipelines, etc.
- ALWAYS use \`graph TD\` (top-down layout) — never graph LR
- Keep each diagram to 5-12 nodes with short labels (2-4 words)
- Node IDs MUST be simple alphanumeric: A, B, C or step1, step2 — NO spaces, NO special chars in IDs
- Labels go inside square brackets ONLY: \`A[My Label]\` — NEVER use parentheses \`()\` or curly braces \`{}\` for node shapes
- NO semicolons, NO quotes inside labels, NO nested brackets
- Edges use \`-->\` only — no labels on edges
- Do NOT wrap in markdown code fences
- Show actual component/module names from source code

Example mermaid value:
graph TD
  A[Audio Input] --> B[Preprocessor]
  B --> C[Feature Extractor]
  C --> D[Transformer Model]
  D --> E[Decoder]
  E --> F[Text Output]`;

}

function parseRepoFromOutput(
  repoOutput: Record<string, unknown>,
  repoInput: RepoInput,
): RepoAnalysis {
  const dims = repoOutput.dimensions as Record<string, Record<string, unknown>>;
  const dimensions: Record<string, DimensionAnalysis> = {};

  for (const dim of DIMENSIONS) {
    const d = dims?.[dim];
    if (d) {
      const metrics: DimensionMetric[] = ((d.metrics as Record<string, unknown>[]) ?? []).map((m) => ({
        label: String(m.label ?? ""),
        value: String(m.value ?? ""),
        sentiment: (["positive", "negative", "neutral"].includes(String(m.sentiment))
          ? String(m.sentiment)
          : "neutral") as DimensionMetric["sentiment"],
      }));

      dimensions[dim] = {
        score: Math.max(1, Math.min(10, Math.round(d.score as number))),
        summary: (d.summary as string) ?? `${dim} analysis`,
        details: "",
        evidence: ((d.evidence as Record<string, unknown>[]) ?? []).map((e) => ({
          filePath: String(e.filePath ?? ""),
          lines: e.lines ? String(e.lines) : undefined,
          snippet: String(e.snippet ?? ""),
          observation: String(e.observation ?? ""),
          sentiment: (["positive", "negative", "neutral"].includes(String(e.sentiment))
            ? String(e.sentiment)
            : "neutral") as Evidence["sentiment"],
        })),
        metrics,
      };
    } else {
      dimensions[dim] = {
        score: 5,
        summary: `${dim} could not be fully assessed`,
        details: "",
        evidence: [],
      };
    }
  }

  // Parse pipeline diagrams
  const rawPipelines = repoOutput.pipelines as Record<string, unknown>[] | undefined;
  const pipelines = rawPipelines?.map((p) => ({
    title: String(p.title ?? ""),
    description: String(p.description ?? ""),
    mermaid: String(p.mermaid ?? ""),
    explanation: String(p.explanation ?? ""),
  })).filter((p) => p.mermaid.length > 0);

  return {
    url: `https://github.com/${repoInput.name}`,
    name: repoInput.name,
    description: (repoOutput.description as string) ?? repoInput.data.metadata.description ?? "No description",
    metadata: repoInput.data.metadata,
    dimensions,
    pipelines: pipelines && pipelines.length > 0 ? pipelines : undefined,
  };
}

export async function analyzeComparative(repos: RepoInput[]): Promise<{
  analyses: RepoAnalysis[];
  comparison: { comparable: boolean; reason: string; summary: string; winner: string | null };
  sessionId?: string;
}> {
  const repoNames = repos.map((r) => r.name);
  const prompt = buildComparativePrompt(repos);
  const schema = buildComparativeSchema(repoNames);

  console.log(`[Phase2] Starting comparative agent for ${repoNames.join(", ")}, cwd: ${REPOS_DIR}, prompt length: ${prompt.length}`);

  const q = query({
    prompt,
    options: {
      model: "sonnet",
      executable: "node",
      cwd: REPOS_DIR,
      allowedTools: ["Read", "Glob", "Grep"],
      disallowedTools: ["Bash", "Edit", "Write", "Agent"],
      maxTurns: 50,
      persistSession: true,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      env: cleanEnv,
      outputFormat: {
        type: "json_schema",
        schema,
      },
    },
  });

  let sessionId: string | undefined;

  for await (const msg of q) {
    // Capture session ID from init message
    if (msg.type === "system" && (msg as Record<string, unknown>).subtype === "init") {
      sessionId = (msg as Record<string, unknown>).session_id as string;
      console.log(`[Phase2] Session ID: ${sessionId}`);
    } else if (msg.type === "result") {
      if (msg.subtype === "success") {
        console.log(`[Phase2] Comparative result: success, has_structured=${!!msg.structured_output}, sessionId=${sessionId}`);
        let parsed: Record<string, unknown>;
        if (msg.structured_output) {
          parsed = msg.structured_output as Record<string, unknown>;
        } else {
          const jsonMatch = msg.result.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON found in agent response");
          parsed = JSON.parse(jsonMatch[0]);
        }

        const reposOutput = parsed.repos as Record<string, Record<string, unknown>>;
        const comparisonOutput = parsed.comparison as Record<string, unknown> | undefined;

        const analyses = repos.map((r) => {
          const repoOut = reposOutput?.[r.name];
          if (!repoOut) {
            return {
              url: `https://github.com/${r.name}`,
              name: r.name,
              description: r.data.metadata.description ?? "No description",
              metadata: r.data.metadata,
              dimensions: Object.fromEntries(
                DIMENSIONS.map((dim) => [dim, { score: 5, summary: "Not assessed", details: "", evidence: [] }])
              ),
            } as RepoAnalysis;
          }
          return parseRepoFromOutput(repoOut, r);
        });

        const comparison = {
          comparable: true,
          reason: "Comparative analysis across same dimensions",
          summary: (comparisonOutput?.summary as string) ?? "Analysis complete.",
          winner: (comparisonOutput?.winner as string) ?? null,
        };

        return { analyses, comparison, sessionId };
      }
      throw new Error(`Agent failed: ${msg.subtype}`);
    } else {
      console.log(`[Phase2] Message: type=${msg.type}`);
    }
  }

  throw new Error("Agent ended without result");
}
