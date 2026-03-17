"use client";

import type { RepoAnalysis } from "@/types/analysis";
import { RepoMetadataCard } from "./RepoMetadataCard";
import { DimensionSection } from "./DimensionSection";
import { PipelineSection } from "./PipelineSection";

interface RepoCardProps {
 analysis: RepoAnalysis;
 isDeepening?: boolean;
}

export function RepoCard({ analysis, isDeepening }: RepoCardProps) {
 return (
 <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-semibold">{analysis.name}</h2>
 {isDeepening && (
 <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
 <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
 Deepening analysis...
 </span>
 )}
 </div>

 <RepoMetadataCard metadata={analysis.metadata} />

 <div className="space-y-2">
 {Object.entries(analysis.dimensions).map(([name, dim]) => (
 <DimensionSection key={name} name={name} dimension={dim} />
 ))}
 </div>

 {analysis.pipelines && analysis.pipelines.length > 0 && (
 <PipelineSection pipelines={analysis.pipelines} repoName={analysis.name} />
 )}
 </div>
 );
}
