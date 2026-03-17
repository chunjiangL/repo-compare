"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { RepoAnalysis, DimensionAnalysis } from "@/types/analysis";
import { RepoMetadataCard } from "./RepoMetadataCard";
import { ScoreRadar } from "./ScoreRadar";
import { PipelineSection } from "./PipelineSection";

interface ComparisonViewProps {
  repos: RepoAnalysis[];           // Phase 1 heuristic
  deepRepos?: RepoAnalysis[];      // Phase 2 LLM deep analysis
  deepening: Record<string, boolean>;
  comparison?: { summary: string; winner: string | null } | null;
}

function scoreColor(score: number): string {
  if (score >= 8) return "bg-green-500";
  if (score >= 6) return "bg-blue-500";
  if (score >= 4) return "bg-amber-500";
  return "bg-red-500";
}

function metricColor(sentiment?: "positive" | "negative" | "neutral"): string {
  if (sentiment === "positive") return "text-green-700 bg-green-50";
  if (sentiment === "negative") return "text-red-700 bg-red-50";
  return "text-zinc-600 bg-zinc-100";
}

function sentimentBorder(sentiment: "positive" | "negative" | "neutral"): string {
  if (sentiment === "positive") return "border-l-green-500";
  if (sentiment === "negative") return "border-l-red-500";
  return "border-l-zinc-400";
}

function DimensionCell({ dimension }: { dimension?: DimensionAnalysis }) {
  if (!dimension) {
    return (
      <div className="flex-1 min-w-0 rounded-lg border border-dashed border-zinc-200 p-3">
        <p className="text-xs text-zinc-400 italic">Pending deep analysis...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
          <div
            className={`h-full rounded-full ${scoreColor(dimension.score)} transition-all`}
            style={{ width: `${dimension.score * 10}%` }}
          />
        </div>
        <span className="text-sm font-semibold tabular-nums shrink-0">
          {dimension.score}/10
        </span>
      </div>
      {dimension.metrics && dimension.metrics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {dimension.metrics.map((m, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${metricColor(m.sentiment)}`}
            >
              <span className="font-medium">{m.label}:</span>
              <span>{m.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DimensionRow({
  name,
  repos,
}: {
  name: string;
  repos: RepoAnalysis[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSomeEvidence = repos.some(
    (r) => r.dimensions[name]?.evidence && r.dimensions[name].evidence.length > 0
  );

  return (
    <div className="rounded-lg border border-zinc-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
      >
        {hasSomeEvidence ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 mt-0.5" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 mt-0.5" />
          )
        ) : (
          <div className="h-4 w-4 shrink-0" />
        )}

        <span className="text-sm font-medium w-24 shrink-0 pt-0.5">{name}</span>

        <div className="flex flex-1 gap-6 min-w-0">
          {repos.map((repo) => (
            <DimensionCell
              key={repo.name}
              dimension={repo.dimensions[name]}
            />
          ))}
        </div>
      </button>

      {expanded && hasSomeEvidence && (
        <div className="border-t border-zinc-200 px-4 py-3">
          <div className="flex gap-6 pl-10">
            {repos.map((repo) => {
              const dim = repo.dimensions[name];
              if (!dim || dim.evidence.length === 0) {
                return <div key={repo.name} className="flex-1 min-w-0" />;
              }
              return (
                <div key={repo.name} className="flex-1 min-w-0 space-y-2">
                  <p className="text-xs font-medium text-zinc-500">
                    {repo.name.split("/").pop()}
                  </p>
                  {dim.summary && (
                    <p className="text-xs text-zinc-600">{dim.summary}</p>
                  )}
                  {dim.evidence.map((ev, i) => (
                    <div
                      key={i}
                      className={`rounded-md border border-l-4 border-zinc-200 ${sentimentBorder(ev.sentiment)} bg-zinc-50 p-2`}
                    >
                      <code className="text-xs font-medium text-zinc-700">
                        {ev.filePath}
                        {ev.lines && (
                          <span className="text-zinc-400">:{ev.lines}</span>
                        )}
                      </code>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {ev.observation}
                      </p>
                      {ev.snippet && (
                        <pre className="mt-1 overflow-x-auto rounded bg-zinc-900 p-1.5 text-xs text-zinc-100">
                          <code>{ev.snippet}</code>
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ComparisonView({ repos, deepRepos, deepening, comparison }: ComparisonViewProps) {
  // Phase 1 heuristic dimensions
  const heuristicDimSet = new Set<string>();
  repos.forEach((r) =>
    Object.keys(r.dimensions).forEach((d) => heuristicDimSet.add(d))
  );
  const heuristicDims = Array.from(heuristicDimSet);

  // Phase 2 deep dimensions
  const deepDimSet = new Set<string>();
  deepRepos?.forEach((r) =>
    Object.keys(r.dimensions).forEach((d) => deepDimSet.add(d))
  );
  const deepDims = Array.from(deepDimSet);

  // Use deep analyses for radar if available
  const radarRepos = deepRepos && deepRepos.length > 0 ? deepRepos : repos;

  const isDeepening = Object.values(deepening).some(Boolean);

  return (
    <div className="space-y-6">
      {/* Repo headers */}
      <div className="grid grid-cols-2 gap-6">
        {repos.map((repo) => (
          <div key={repo.name} className="flex items-center justify-between">
            <h2 className="text-lg font-semibold truncate">{repo.name}</h2>
            {deepening[repo.name] && (
              <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 shrink-0 ml-2">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                Deepening...
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Metadata cards — equal height */}
      <div className="grid grid-cols-2 gap-6 items-stretch">
        {repos.map((repo) => (
          <RepoMetadataCard key={repo.name} metadata={repo.metadata} />
        ))}
      </div>

      {/* Radar chart */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <ScoreRadar repos={radarRepos} />
      </div>

      {/* Phase 1: Quick Metrics */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Quick Metrics
        </h3>
        <div className="space-y-2">
          {heuristicDims.map((dim) => (
            <DimensionRow key={dim} name={dim} repos={repos} />
          ))}
        </div>
      </div>

      {/* Phase 2: Deep Analysis */}
      {deepRepos && deepRepos.length > 0 ? (
        <>
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Deep Analysis
            </h3>
            <div className="space-y-2">
              {deepDims.map((dim) => (
                <DimensionRow key={`deep-${dim}`} name={dim} repos={deepRepos} />
              ))}
            </div>
          </div>

          {/* Pipeline diagrams */}
          {deepRepos.some((r) => r.pipelines && r.pipelines.length > 0) && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Pipelines
              </h3>
              <div className="grid grid-cols-2 gap-6">
                {deepRepos.map((repo) => (
                  <div key={repo.name} className="min-w-0">
                    {repo.pipelines && repo.pipelines.length > 0 ? (
                      <PipelineSection pipelines={repo.pipelines} repoName={repo.name} />
                    ) : (
                      <div className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-400">
                        No pipelines generated
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : isDeepening ? (
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
  );
}
