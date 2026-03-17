"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { GitCompareArrows, LogIn, LogOut } from "lucide-react";

export function Header() {
 const { data: session } = useSession();

 return (
 <header className="border-b border-zinc-200 bg-white">
 <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
 <a href="/" className="flex items-center gap-2 text-lg font-semibold">
 <GitCompareArrows className="h-5 w-5" />
 repo-compare
 </a>
 <div className="flex items-center gap-3">
 {session?.user ? (
 <>
 <span className="text-sm text-zinc-600">
 {session.user.name}
 </span>
 <button
 onClick={() => signOut()}
 className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-50"
 >
 <LogOut className="h-3.5 w-3.5" />
 Sign Out
 </button>
 </>
 ) : (
 <button
 onClick={() => signIn("github")}
 className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white transition-colors hover:bg-zinc-800"
 >
 <LogIn className="h-3.5 w-3.5" />
 Sign in with GitHub
 </button>
 )}
 </div>
 </div>
 </header>
 );
}
