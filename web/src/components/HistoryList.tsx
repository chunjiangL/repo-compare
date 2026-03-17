"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Clock, Bookmark, Trash2, Play, Eye } from "lucide-react";
import { getHistory, removeEntry, type HistoryEntry } from "@/lib/history";

export function HistoryList() {
 const router = useRouter();
 const { data: session } = useSession();
 const [entries, setEntries] = useState<HistoryEntry[]>([]);
 const [mounted, setMounted] = useState(false);

 const refresh = useCallback(async () => {
  if (!session?.user) return;
  const data = await getHistory();
  setEntries(data);
 }, [session?.user]);

 useEffect(() => {
  setMounted(true);
  refresh();
  const handler = () => refresh();
  window.addEventListener("history-updated", handler);
  return () => window.removeEventListener("history-updated", handler);
 }, [refresh]);

 if (!mounted || !session?.user || entries.length === 0) return null;

 const completed = entries.filter((e) => e.status === "completed");
 const queued = entries.filter((e) => e.status === "queued");

 async function handleDelete(id: string) {
  await removeEntry(id);
  setEntries((prev) => prev.filter((e) => e.id !== id));
 }

 function handleView(entry: HistoryEntry) {
  sessionStorage.setItem("analyze-urls", JSON.stringify(entry.urls));
  if (entry.analyses) {
   sessionStorage.setItem("analyze-state", JSON.stringify({
    phases: Object.fromEntries(entry.repos.map((r) => [r, "phase2"])),
    errors: {},
    analyses: entry.analyses,
    done: true,
    comparison: entry.comparison,
   }));
  }
  router.push("/analyze");
 }

 function handleRun(entry: HistoryEntry) {
  sessionStorage.setItem("analyze-urls", JSON.stringify(entry.urls));
  sessionStorage.removeItem("analyze-state");
  router.push("/analyze");
 }

 function formatDate(iso: string) {
  // SQLite datetime() returns "YYYY-MM-DD HH:MM:SS" in UTC without Z suffix
  const d = new Date(iso.includes("T") || iso.includes("Z") ? iso : iso.replace(" ", "T") + "Z");
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
 }

 return (
  <div className="w-full max-w-2xl mt-10">
   {queued.length > 0 && (
    <div className="mb-6">
     <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
      <Bookmark className="h-3.5 w-3.5" />
      Saved for later
     </h3>
     <div className="space-y-2">
      {queued.map((entry) => (
       <div
        key={entry.id}
        className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm"
       >
        <div className="min-w-0 flex-1">
         <p className="text-sm font-medium truncate">
          {entry.repos.join(" vs ")}
         </p>
         <p className="text-xs text-zinc-400">{formatDate(entry.created_at)}</p>
        </div>
        <div className="flex items-center gap-1 ml-3">
         <button
          onClick={() => handleRun(entry)}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          title="Run analysis"
         >
          <Play className="h-3 w-3" />
          Run
         </button>
         <button
          onClick={() => handleDelete(entry.id)}
          className="flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:text-red-500"
          title="Remove"
         >
          <Trash2 className="h-3.5 w-3.5" />
         </button>
        </div>
       </div>
      ))}
     </div>
    </div>
   )}

   {completed.length > 0 && (
    <div>
     <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
      <Clock className="h-3.5 w-3.5" />
      Recent analyses
     </h3>
     <div className="space-y-2">
      {completed.map((entry) => {
       const repoScores = entry.analyses
        ? Object.entries(entry.analyses).map(([name, a]) => {
           const dims = Object.values(a.dimensions);
           const avg = dims.reduce((s, d) => s + d.score, 0) / dims.length;
           const short = name.split("/").pop() ?? name;
           return { short, avg };
          })
        : [];
       return (
        <div
         key={entry.id}
         className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm"
        >
         <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
           {entry.repos.join(" vs ")}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
           <span className="text-xs text-zinc-400">{formatDate(entry.updated_at)}</span>
           {repoScores.length > 0 && (
            <span className="text-xs text-zinc-500">
             {repoScores.map((r) => `${r.short} ${r.avg.toFixed(1)}`).join(" · ")}
            </span>
           )}
          </div>
         </div>
         <div className="flex items-center gap-1 ml-3">
          <button
           onClick={() => handleView(entry)}
           className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
           title="View results"
          >
           <Eye className="h-3 w-3" />
           View
          </button>
          <button
           onClick={() => handleRun(entry)}
           className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
           title="Re-run analysis"
          >
           <Play className="h-3 w-3" />
           Rerun
          </button>
          <button
           onClick={() => handleDelete(entry.id)}
           className="flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:text-red-500"
           title="Remove"
          >
           <Trash2 className="h-3.5 w-3.5" />
          </button>
         </div>
        </div>
       );
      })}
     </div>
    </div>
   )}
  </div>
 );
}
