import type { RepoMetadata } from "./github";

export interface Evidence {
  filePath: string;
  lines?: string;
  snippet: string;
  observation: string;
  sentiment: "positive" | "negative" | "neutral";
}

export interface DimensionMetric {
  label: string;
  value: string;
  sentiment?: "positive" | "negative" | "neutral";
}

export interface DimensionAnalysis {
  score: number;
  summary: string;
  details: string;
  evidence: Evidence[];
  metrics?: DimensionMetric[];
}

export interface PipelineDiagram {
  title: string;
  description: string;
  mermaid: string;
}

export interface RepoAnalysis {
  url: string;
  name: string;
  description: string;
  metadata: RepoMetadata;
  dimensions: Record<string, DimensionAnalysis>;
  pipelines?: PipelineDiagram[];
}

export interface AnalysisResult {
  repos: RepoAnalysis[];
  comparison?: {
    comparable: boolean;
    reason: string;
    summary: string;
    winner: string | null;
  };
  overallSummary: string;
}

export type SSEEvent =
  | { type: "metadata"; repo: string; data: RepoMetadata }
  | { type: "phase1"; repo: string; data: AnalysisResult }
  | { type: "phase2"; repo: string; data: AnalysisResult }
  | { type: "error"; repo: string; message: string }
  | { type: "done" };
