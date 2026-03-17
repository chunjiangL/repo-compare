"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, AlertCircle, Plus, X, Bookmark } from "lucide-react";
import { isValidGitHubUrl, extractRepoName } from "@/lib/utils";
import { addQueued } from "@/lib/history";

export function RepoInput() {
 const [urls, setUrls] = useState(["", ""]);
 const [error, setError] = useState<string | null>(null);
 const router = useRouter();
 const { data: session } = useSession();

 function updateUrl(index: number, value: string) {
 setUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
 }

 function addUrl() {
 if (urls.length >= 5) return;
 setUrls((prev) => [...prev, ""]);
 }

 function removeUrl(index: number) {
 if (urls.length <= 1) return;
 setUrls((prev) => prev.filter((_, i) => i !== index));
 }

 function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 setError(null);

 if (!session) {
 setError("Please sign in with GitHub first.");
 return;
 }

 const filled = urls.map((u) => u.trim()).filter((u) => u.length > 0);

 if (filled.length === 0) {
 setError("Please enter at least one GitHub repository URL.");
 return;
 }

 const invalid = filled.filter((u) => !isValidGitHubUrl(u));
 if (invalid.length > 0) {
 setError(`Invalid URL${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}`);
 return;
 }

 sessionStorage.setItem("analyze-urls", JSON.stringify(filled));
 sessionStorage.removeItem("analyze-state");
 router.push("/analyze");
 }

 return (
 <form onSubmit={handleSubmit} className="w-full max-w-2xl">
 <label className="mb-2 block text-sm font-medium text-zinc-700">
 GitHub Repository URLs
 </label>

 <div className="space-y-2">
 {urls.map((url, i) => (
 <div key={i} className="flex items-center gap-2">
 <div className="relative flex-1">
 <input
 type="text"
 value={url}
 onChange={(e) => updateUrl(i, e.target.value)}
 placeholder={`https://github.com/owner/repo${i > 0 ? `-${i + 1}` : ""}`}
 className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
 />
 </div>
 {urls.length > 1 && (
 <button
 type="button"
 onClick={() => removeUrl(i)}
 className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 transition-colors hover:border-red-300 hover:text-red-500"
 >
 <X className="h-4 w-4" />
 </button>
 )}
 </div>
 ))}
 </div>

 {urls.length < 5 && (
 <button
 type="button"
 onClick={addUrl}
 className="mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
 >
 <Plus className="h-3.5 w-3.5" />
 Add another repository
 </button>
 )}

 {error && (
 <div className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
 <AlertCircle className="h-4 w-4 shrink-0" />
 {error}
 </div>
 )}

 <div className="mt-3 flex gap-2">
 <button
 type="submit"
 className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
 >
 <Search className="h-4 w-4" />
 Analyze
 </button>
 <button
 type="button"
 onClick={async () => {
  const filled = urls.map((u) => u.trim()).filter((u) => u.length > 0);
  if (filled.length === 0 || filled.some((u) => !isValidGitHubUrl(u))) {
   setError("Enter valid GitHub URLs to save.");
   return;
  }
  await addQueued(filled, filled.map(extractRepoName));
  setUrls(["", ""]);
  setError(null);
  window.dispatchEvent(new Event("history-updated"));
 }}
 className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
 >
 <Bookmark className="h-4 w-4" />
 Save for later
 </button>
 </div>
 </form>
 );
}
