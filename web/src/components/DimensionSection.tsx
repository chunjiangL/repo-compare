"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { DimensionAnalysis } from "@/types/analysis";

interface DimensionSectionProps {
 name: string;
 dimension: DimensionAnalysis;
}

function scoreColor(score: number): string {
 if (score >= 8) return "bg-green-500";
 if (score >= 6) return "bg-blue-500";
 if (score >= 4) return "bg-amber-500";
 return "bg-red-500";
}

function sentimentBorder(sentiment: "positive" | "negative" | "neutral"): string {
 if (sentiment === "positive") return "border-l-green-500";
 if (sentiment === "negative") return "border-l-red-500";
 return "border-l-zinc-400";
}

function metricColor(sentiment?: "positive" | "negative" | "neutral"): string {
 if (sentiment === "positive") return "text-green-700 bg-green-50";
 if (sentiment === "negative") return "text-red-700 bg-red-50";
 return "text-zinc-600 bg-zinc-100";
}

export function DimensionSection({ name, dimension }: DimensionSectionProps) {
 const [expanded, setExpanded] = useState(false);

 return (
 <div className="rounded-lg border border-zinc-200">
 <button
 onClick={() => setExpanded(!expanded)}
 className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
 >
 {expanded ? (
 <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
 ) : (
 <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
 )}
 <div className="flex flex-1 flex-col gap-1.5">
 <div className="flex items-center gap-3">
 <span className="text-sm font-medium w-28 shrink-0">{name}</span>
 <div className="flex flex-1 items-center gap-2">
 <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
 <div
 className={`h-full rounded-full ${scoreColor(dimension.score)} transition-all`}
 style={{ width: `${dimension.score * 10}%` }}
 />
 </div>
 <span className="text-sm font-semibold tabular-nums">{dimension.score}/10</span>
 </div>
 </div>
 {dimension.metrics && dimension.metrics.length > 0 && (
 <div className="flex flex-wrap gap-1.5 pl-28">
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
 </button>

 {expanded && (
 <div className="border-t border-zinc-200 px-4 py-3">
 <p className="mb-2 text-sm text-zinc-600">{dimension.summary}</p>
 <p className="mb-4 text-sm text-zinc-500">{dimension.details}</p>

 {dimension.evidence.length > 0 && (
 <div className="space-y-3">
 <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Evidence</h4>
 {dimension.evidence.map((ev, i) => (
 <div
 key={i}
 className={`rounded-md border border-l-4 border-zinc-200 ${sentimentBorder(ev.sentiment)} bg-zinc-50 p-3`}
 >
 <div className="mb-1 flex items-center gap-2">
 <code className="text-xs font-medium text-zinc-700">
 {ev.filePath}
 {ev.lines && <span className="text-zinc-400">:{ev.lines}</span>}
 </code>
 </div>
 <p className="mb-2 text-xs text-zinc-600">{ev.observation}</p>
 <pre className="overflow-x-auto rounded bg-zinc-900 p-2 text-xs text-zinc-100">
 <code>{ev.snippet}</code>
 </pre>
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 );
}
