"use client";

import type { RepoAnalysis } from "@/types/analysis";

interface ComparisonTableProps {
 repos: RepoAnalysis[];
}

function scoreColor(score: number): string {
 if (score >= 8) return "text-green-600";
 if (score >= 6) return "text-blue-600";
 if (score >= 4) return "text-amber-600";
 return "text-red-600";
}

export function ComparisonTable({ repos }: ComparisonTableProps) {
 if (repos.length < 2) return null;

 // Union of all dimensions across repos (Phase 2 may add Security/Performance/Robustness)
 const dimensionSet = new Set<string>();
 repos.forEach((r) => Object.keys(r.dimensions).forEach((d) => dimensionSet.add(d)));
 const dimensions = Array.from(dimensionSet);

 return (
 <div className="overflow-x-auto rounded-lg border border-zinc-200">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-zinc-200 bg-zinc-50">
 <th className="px-4 py-2 text-left font-medium text-zinc-600">
 Dimension
 </th>
 {repos.map((repo) => (
 <th
 key={repo.name}
 className="px-4 py-2 text-center font-medium text-zinc-600"
 >
 {repo.name.split("/")[1]}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {dimensions.map((dim) => {
 const scores = repos.map((r) => r.dimensions[dim]?.score ?? 0);
 const maxScore = Math.max(...scores);

 return (
 <tr
 key={dim}
 className="border-b border-zinc-100 last:border-b-0"
 >
 <td className="px-4 py-2 font-medium">{dim}</td>
 {repos.map((repo, i) => {
 const score = repo.dimensions[dim]?.score ?? 0;
 const isHighest = score === maxScore && repos.length > 1;
 return (
 <td key={repo.name} className="px-4 py-2 text-center">
 <span
 className={`tabular-nums font-semibold ${scoreColor(score)} ${
 isHighest ? "underline decoration-2" : ""
 }`}
 >
 {score}/10
 </span>
 </td>
 );
 })}
 </tr>
 );
 })}
 <tr className="bg-zinc-50">
 <td className="px-4 py-2 font-semibold">Average</td>
 {repos.map((repo) => {
 const dims = Object.values(repo.dimensions);
 const avg = dims.reduce((sum, d) => sum + d.score, 0) / dims.length;
 return (
 <td key={repo.name} className="px-4 py-2 text-center font-semibold">
 {avg.toFixed(1)}
 </td>
 );
 })}
 </tr>
 </tbody>
 </table>
 </div>
 );
}
