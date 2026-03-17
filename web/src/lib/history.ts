import type { RepoAnalysis, AnalysisResult } from "@/types/analysis";

export interface HistoryEntry {
 id: string;
 urls: string[];
 repos: string[];
 status: "completed" | "queued";
 analyses?: Record<string, RepoAnalysis>;
 comparison?: AnalysisResult["comparison"];
 created_at: string;
 updated_at: string;
}

function parseRow(row: Record<string, unknown>): HistoryEntry {
 return {
  id: row.id as string,
  urls: JSON.parse(row.urls as string),
  repos: JSON.parse(row.repos as string),
  status: row.status as "completed" | "queued",
  analyses: row.analyses ? JSON.parse(row.analyses as string) : undefined,
  comparison: row.comparison ? JSON.parse(row.comparison as string) : undefined,
  created_at: row.created_at as string,
  updated_at: row.updated_at as string,
 };
}

export async function getHistory(): Promise<HistoryEntry[]> {
 const res = await fetch("/api/history");
 if (!res.ok) return [];
 const rows = await res.json();
 return (rows as Record<string, unknown>[]).map(parseRow);
}

export async function addCompleted(
 urls: string[],
 repos: string[],
 analyses: Record<string, RepoAnalysis>,
 comparison?: AnalysisResult["comparison"],
): Promise<HistoryEntry> {
 const res = await fetch("/api/history", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ urls, repos, status: "completed", analyses, comparison }),
 });
 const row = await res.json();
 return parseRow(row);
}

export async function addQueued(
 urls: string[],
 repos: string[],
): Promise<HistoryEntry> {
 const res = await fetch("/api/history", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ urls, repos, status: "queued" }),
 });
 const row = await res.json();
 return parseRow(row);
}

export async function removeEntry(id: string): Promise<void> {
 await fetch(`/api/history/${id}`, { method: "DELETE" });
}

export async function getEntry(id: string): Promise<HistoryEntry | null> {
 const res = await fetch(`/api/history/${id}`);
 if (!res.ok) return null;
 return parseRow(await res.json());
}
