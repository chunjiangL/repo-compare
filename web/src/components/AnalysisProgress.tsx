"use client";

import { Loader2 } from "lucide-react";

interface AnalysisProgressProps {
 repos: string[];
 phases: Record<string, "pending" | "metadata" | "phase1" | "phase2" | "done" | "error">;
 errors: Record<string, string>;
}

export function AnalysisProgress({ repos, phases, errors }: AnalysisProgressProps) {
 return (
 <div className="w-full max-w-2xl space-y-3">
 {repos.map((repo) => {
 const phase = phases[repo] ?? "pending";
 const error = errors[repo];

 return (
 <div
 key={repo}
 className="flex items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3"
 >
 {phase === "error" ? (
 <div className="h-2 w-2 rounded-full bg-red-500" />
 ) : phase === "done" ? (
 <div className="h-2 w-2 rounded-full bg-green-500" />
 ) : (
 <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
 )}
 <div className="flex-1">
 <div className="text-sm font-medium">{repo}</div>
 <div className="text-xs text-zinc-500">
 {error
 ? error
 : phase === "pending"
 ? "Waiting..."
 : phase === "metadata"
 ? "Fetched metadata"
 : phase === "phase1"
 ? "Quick analysis complete. Deepening analysis..."
 : phase === "phase2"
 ? "Deep analysis complete"
 : "Complete"}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 );
}
