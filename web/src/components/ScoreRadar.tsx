"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { RepoAnalysis } from "@/types/analysis";

interface ScoreRadarProps {
  repos: RepoAnalysis[];
}

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6"];

export function ScoreRadar({ repos }: ScoreRadarProps) {
  if (repos.length === 0) return null;

  // Union of all dimensions across repos
  const dimensionSet = new Set<string>();
  repos.forEach((r) => Object.keys(r.dimensions).forEach((d) => dimensionSet.add(d)));
  const dimensions = Array.from(dimensionSet);
  const data = dimensions.map((dim) => {
    const entry: Record<string, string | number> = { dimension: dim };
    repos.forEach((repo) => {
      entry[repo.name] = repo.dimensions[dim]?.score ?? 0;
    });
    return entry;
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="#71717a" strokeOpacity={0.3} />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 10]}
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
          />
          {repos.map((repo, i) => (
            <Radar
              key={repo.name}
              name={repo.name}
              dataKey={repo.name}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
          {repos.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
