"use client";

import { Star, GitFork, Eye, AlertCircle, Scale, Calendar, Users } from "lucide-react";
import type { RepoMetadata } from "@/types/github";

interface RepoMetadataCardProps {
 metadata: RepoMetadata;
}

export function RepoMetadataCard({ metadata }: RepoMetadataCardProps) {
 const stats = [
 { icon: Star, label: "Stars", value: metadata.stars.toLocaleString() },
 { icon: GitFork, label: "Forks", value: metadata.forks.toLocaleString() },
 { icon: Eye, label: "Watchers", value: metadata.watchers.toLocaleString() },
 { icon: AlertCircle, label: "Issues", value: metadata.openIssues.toLocaleString() },
 { icon: Users, label: "Contributors", value: metadata.contributorsCount.toLocaleString() },
 ];

 const topLanguages = Object.entries(metadata.languages)
 .sort(([, a], [, b]) => b - a)
 .slice(0, 5);
 const totalBytes = topLanguages.reduce((sum, [, bytes]) => sum + bytes, 0);

 return (
 <div className="h-full rounded-lg border border-zinc-200 bg-zinc-50 p-4">
 <div className="mb-3 flex items-start justify-between">
 <div>
 <h3 className="text-sm font-semibold">{metadata.fullName}</h3>
 {metadata.description && (
 <p className="mt-1 text-xs text-zinc-600">
 {metadata.description}
 </p>
 )}
 </div>
 {metadata.archived && (
 <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
 Archived
 </span>
 )}
 </div>

 <div className="mb-3 flex flex-wrap gap-3">
 {stats.map(({ icon: Icon, label, value }) => (
 <div key={label} className="flex items-center gap-1 text-xs text-zinc-600">
 <Icon className="h-3.5 w-3.5" />
 <span>{value}</span>
 </div>
 ))}
 </div>

 {topLanguages.length > 0 && (
 <div className="space-y-1.5">
 <div className="flex h-2 overflow-hidden rounded-full bg-zinc-200">
 {topLanguages.map(([lang, bytes]) => (
 <div
 key={lang}
 className="h-full"
 style={{
 width: `${(bytes / totalBytes) * 100}%`,
 backgroundColor: getLanguageColor(lang),
 }}
 />
 ))}
 </div>
 <div className="flex flex-wrap gap-x-3 gap-y-1">
 {topLanguages.map(([lang, bytes]) => (
 <span key={lang} className="flex items-center gap-1 text-xs text-zinc-600">
 <span
 className="inline-block h-2 w-2 rounded-full"
 style={{ backgroundColor: getLanguageColor(lang) }}
 />
 {lang} {((bytes / totalBytes) * 100).toFixed(1)}%
 </span>
 ))}
 </div>
 </div>
 )}

 <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
 {metadata.license && (
 <span className="flex items-center gap-1">
 <Scale className="h-3 w-3" /> {metadata.license}
 </span>
 )}
 <span className="flex items-center gap-1">
 <Calendar className="h-3 w-3" /> Updated {new Date(metadata.pushedAt).toLocaleDateString()}
 </span>
 </div>

 {metadata.topics.length > 0 && (
 <div className="mt-2 flex flex-wrap gap-1">
 {metadata.topics.slice(0, 8).map((topic) => (
 <span
 key={topic}
 className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
 >
 {topic}
 </span>
 ))}
 </div>
 )}
 </div>
 );
}

const LANGUAGE_COLORS: Record<string, string> = {
 TypeScript: "#3178c6",
 JavaScript: "#f1e05a",
 Python: "#3572A5",
 Rust: "#dea584",
 Go: "#00ADD8",
 Java: "#b07219",
 Ruby: "#701516",
 PHP: "#4F5D95",
 C: "#555555",
 "C++": "#f34b7d",
 "C#": "#178600",
 Swift: "#F05138",
 Kotlin: "#A97BFF",
 Shell: "#89e051",
 HTML: "#e34c26",
 CSS: "#563d7c",
 SCSS: "#c6538c",
 Dockerfile: "#384d54",
};

function getLanguageColor(lang: string): string {
 return LANGUAGE_COLORS[lang] ?? "#8b8b8b";
}
