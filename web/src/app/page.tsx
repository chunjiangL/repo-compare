import { RepoInput } from "@/components/RepoInput";
import { HistoryList } from "@/components/HistoryList";

export default function Home() {
 return (
 <main className="flex min-h-[calc(100vh-57px)] flex-col items-center px-4 pt-24 pb-12">
 <div className="mb-10 w-full max-w-2xl text-center">
 <h1 className="mb-3 text-5xl font-bold tracking-tight">
 Compare GitHub Repositories
 </h1>
 <p className="text-lg text-zinc-500">
 Deep analysis across adoption, maintenance, leanness, code quality, documentation, architecture, security, performance, and robustness.
 </p>
 </div>
 <RepoInput />
 <HistoryList />
 </main>
 );
}
