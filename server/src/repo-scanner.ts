import { Octokit } from "@octokit/rest";
import { getRepoMetadata, getRepoTree, getFileContent, selectFilesToFetch, checkLockFiles } from "./github.js";
import { cloneRepo, scanLocalTree } from "./clone.js";
import type { RepoData, RepoMetadata } from "./types/github.js";

export async function scanRepoFast(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<RepoData> {
  const metadata = await getRepoMetadata(octokit, owner, repo);
  const tree = await getRepoTree(octokit, owner, repo, metadata.defaultBranch);

  const filesToFetch = selectFilesToFetch(tree);
  const lockFiles = checkLockFiles(tree);

  const fileContents = await Promise.all(
    filesToFetch.map((p) => getFileContent(octokit, owner, repo, p))
  );

  const files = fileContents.filter((f): f is NonNullable<typeof f> => f !== null);

  // Add lock file existence markers (no content)
  for (const lf of lockFiles) {
    files.push({ path: lf, content: "[lock file — existence confirmed]", size: 0 });
  }

  return { metadata, tree, files, phase: "fetch" };
}

export interface ScanCallbacks {
  onMetadata: (metadata: RepoMetadata) => void | Promise<void>;
  onPhase1: (data: RepoData) => void | Promise<void>;
  onPhase2: (data: RepoData, repoPath: string) => void | Promise<void>;
  onError: (error: string) => void | Promise<void>;
}

export async function scanRepo(
  url: string,
  token: string | undefined,
  callbacks: ScanCallbacks
): Promise<void> {
  // Parse owner/repo from URL
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    await callbacks.onError(`Invalid GitHub URL: ${url}`);
    return;
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");

  const octokit = new Octokit({ auth: token });

  try {
    // Phase 1: Fast fetch via GitHub API
    const phase1Data = await scanRepoFast(octokit, owner, repo);
    await callbacks.onMetadata(phase1Data.metadata);
    await callbacks.onPhase1(phase1Data);

    // Phase 2: Clone (or reuse existing), walk tree, let agent read files on demand
    try {
      const clone = await cloneRepo(url, token);
      const tree = await scanLocalTree(clone.path);
      const phase2Data: RepoData = {
        metadata: phase1Data.metadata,
        tree,
        files: [], // agent reads files lazily from disk
        phase: "clone",
      };
      await callbacks.onPhase2(phase2Data, clone.path);
    } catch (err) {
      await callbacks.onError(
        `Clone failed for ${owner}/${repo}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } catch (err) {
    await callbacks.onError(
      `Failed to analyze ${owner}/${repo}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
