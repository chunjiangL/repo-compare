"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RepoCard } from "@/components/RepoCard";
import { ScoreRadar } from "@/components/ScoreRadar";
import { ComparisonView } from "@/components/ComparisonView";
import { DimensionSection } from "@/components/DimensionSection";
import { PipelineSection } from "@/components/PipelineSection";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import type { AnalysisResult, RepoAnalysis } from "@/types/analysis";
import { extractRepoName } from "@/lib/utils";
import { addCompleted } from "@/lib/history";

type Phase = "pending" | "metadata" | "phase1" | "phase2" | "done" | "error";

interface AnalyzeState {
 phases: Record<string, Phase>;
 errors: Record<string, string>;
 analyses: Record<string, RepoAnalysis>;
 deepAnalyses: Record<string, RepoAnalysis>;
 done: boolean;
 comparison?: AnalysisResult["comparison"];
}

const STORAGE_KEY = "analyze-state";

function loadState(): AnalyzeState | null {
 if (typeof window === "undefined") return null;
 const stored = sessionStorage.getItem(STORAGE_KEY);
 if (!stored) return null;
 try { return JSON.parse(stored); } catch { return null; }
}

function saveState(state: AnalyzeState) {
 sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function AnalyzeContent() {
 const router = useRouter();
 const [urls] = useState<string[]>(() => {
  if (typeof window === "undefined") return [];
  const stored = sessionStorage.getItem("analyze-urls");
  if (!stored) return [];
  try { return JSON.parse(stored); } catch { return []; }
 });

 const restored = useRef<AnalyzeState | null>(loadState());

 const [phases, setPhases] = useState<Record<string, Phase>>(restored.current?.phases ?? {});
 const [errors, setErrors] = useState<Record<string, string>>(restored.current?.errors ?? {});
 const [analyses, setAnalyses] = useState<Record<string, RepoAnalysis>>(restored.current?.analyses ?? {});
 const [deepAnalyses, setDeepAnalyses] = useState<Record<string, RepoAnalysis>>(restored.current?.deepAnalyses ?? {});
 const [done, setDone] = useState(restored.current?.done ?? false);
 const [comparison, setComparison] = useState<AnalysisResult["comparison"]>(restored.current?.comparison);
 const started = useRef(false);
 const savedToHistory = useRef(restored.current?.done ?? false);

 const repoNames = urls.map(extractRepoName);

 // Persist state to sessionStorage on every change
 useEffect(() => {
  saveState({ phases, errors, analyses, deepAnalyses, done, comparison });
 }, [phases, errors, analyses, deepAnalyses, done, comparison]);

 // Save to history when analysis completes
 useEffect(() => {
  if (done && !savedToHistory.current && Object.keys(analyses).length > 0) {
   savedToHistory.current = true;
   // Save deep analyses if available, otherwise heuristic
   const toSave = Object.keys(deepAnalyses).length > 0 ? deepAnalyses : analyses;
   addCompleted(urls, repoNames, toSave, comparison).catch(console.error);
  }
 }, [done, analyses, deepAnalyses, comparison]);

 useEffect(() => {
  if (urls.length === 0) router.replace("/");
 }, [urls.length, router]);

 const startAnalysis = useCallback(async () => {
 if (urls.length === 0) return;

 setPhases((prev) => {
  const next = { ...prev };
  repoNames.forEach((name) => {
   if (!next[name]) next[name] = "pending";
  });
  return next;
 });

 try {
 const res = await fetch("/api/analyze", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ urls }),
 });

 if (!res.ok || !res.body) {
 const err = await res.json().catch(() => ({ error: "Unknown error" }));
 repoNames.forEach((name) => {
 setErrors((prev) => ({ ...prev, [name]: err.error ?? "Analysis failed" }));
 setPhases((prev) => ({ ...prev, [name]: "error" }));
 });
 setDone(true);
 return;
 }

 const reader = res.body.getReader();
 const decoder = new TextDecoder();
 let buffer = "";

 while (true) {
 const { done: streamDone, value } = await reader.read();
 if (streamDone) break;

 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split("\n");
 buffer = lines.pop() ?? "";

 for (const line of lines) {
 if (!line.startsWith("data: ")) continue;
 const jsonStr = line.slice(6).trim();
 if (!jsonStr) continue;

 try {
 const event = JSON.parse(jsonStr);

 switch (event.type) {
 case "metadata":
 setPhases((prev) => ({ ...prev, [event.repo]: "metadata" }));
 break;

 case "phase1": {
 const result = event.data as AnalysisResult;
 setPhases((prev) => ({ ...prev, [event.repo]: "phase1" }));
 for (const repoAnalysis of result.repos) {
 setAnalyses((prev) => ({ ...prev, [repoAnalysis.name]: repoAnalysis }));
 }
 break;
 }

 case "phase2": {
 const result = event.data as AnalysisResult;
 setPhases((prev) => ({ ...prev, [event.repo]: "phase2" }));
 for (const repoAnalysis of result.repos) {
 setDeepAnalyses((prev) => ({ ...prev, [repoAnalysis.name]: repoAnalysis }));
 }
 if (result.comparison) {
 setComparison(result.comparison);
 }
 break;
 }

 case "error":
 setErrors((prev) => ({ ...prev, [event.repo]: event.message }));
 setPhases((prev) => ({ ...prev, [event.repo]: "error" }));
 break;

 case "done":
 setDone(true);
 break;
 }
 } catch {
 // Skip malformed events
 }
 }
 }

 setDone(true);
 } catch (err) {
 repoNames.forEach((name) => {
 setErrors((prev) => ({ ...prev, [name]: "Network error" }));
 setPhases((prev) => ({ ...prev, [name]: "error" }));
 });
 setDone(true);
 }
 }, [urls.join(",")]);

 useEffect(() => {
 if (started.current) return;
 started.current = true;

 const prev = restored.current;
 if (prev && prev.done) return;

 startAnalysis();
 }, [startAnalysis]);

 const repoAnalyses = Object.values(analyses);
 const deepRepoAnalyses = Object.values(deepAnalyses);
 const hasResults = repoAnalyses.length > 0;
 const allDone = done || Object.values(phases).every((p) => p === "phase2" || p === "done" || p === "error");

 return (
 <main className="mx-auto max-w-7xl px-4 py-8">
 <h1 className="mb-6 text-2xl font-bold">Analysis Results</h1>

 {!allDone && (
 <div className="mb-8">
 <AnalysisProgress repos={repoNames} phases={phases} errors={errors} />
 </div>
 )}

 {hasResults && repoAnalyses.length > 1 ? (
 <ComparisonView
 repos={repoAnalyses}
 deepRepos={deepRepoAnalyses.length > 0 ? deepRepoAnalyses : undefined}
 comparison={comparison}
 deepening={Object.fromEntries(
 repoAnalyses.map((a) => [a.name, phases[a.name] === "phase1"])
 )}
 />
 ) : hasResults ? (
 <div className="space-y-6">
 <div className="mx-auto max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
 <ScoreRadar repos={deepRepoAnalyses.length > 0 ? deepRepoAnalyses : repoAnalyses} />
 </div>
 {repoAnalyses.map((analysis) => (
 <RepoCard
 key={analysis.name}
 analysis={analysis}
 isDeepening={phases[analysis.name] === "phase1"}
 />
 ))}

 {/* Deep Analysis for single repo */}
 {deepRepoAnalyses.length > 0 ? (
 <div className="space-y-4">
 <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
 Deep Analysis
 </h3>
 {deepRepoAnalyses.map((analysis) => (
 <div key={analysis.name} className="space-y-2">
 {Object.entries(analysis.dimensions).map(([name, dim]) => (
 <DimensionSection key={name} name={name} dimension={dim} />
 ))}
 </div>
 ))}

 {deepRepoAnalyses.some((r) => r.pipelines && r.pipelines.length > 0) && (
 <div className="space-y-4">
 <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
 Pipelines
 </h3>
 {deepRepoAnalyses.map((repo) =>
 repo.pipelines && repo.pipelines.length > 0 ? (
 <PipelineSection key={repo.name} pipelines={repo.pipelines} repoName={repo.name} />
 ) : null
 )}
 </div>
 )}
 </div>
 ) : Object.values(phases).some((p) => p === "phase1") ? (
 <div>
 <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
 Deep Analysis
 </h3>
 <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center">
 <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
 <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
 Reading source code and analyzing domain-specific patterns...
 </div>
 </div>
 </div>
 ) : null}

 {/* Verdict */}
 {comparison && (
 <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
 <p className="text-sm font-medium">{comparison.summary}</p>
 </div>
 )}
 </div>
 ) : null}
 </main>
 );
}

export default function AnalyzePage() {
 return <AnalyzeContent />;
}
