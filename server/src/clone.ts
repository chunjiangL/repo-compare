import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import type { RepoFileEntry, RepoFileContent } from "./types/github.js";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLONE_DIR = path.join(__dirname, "..", "..", "repos");

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  "__pycache__",
  ".venv",
  "vendor",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".java", ".kt", ".rb", ".php",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".swift", ".m",
  ".json", ".yaml", ".yml", ".toml", ".xml", ".csv",
  ".md", ".txt", ".rst", ".html", ".css", ".scss", ".less",
  ".sql", ".sh", ".bash", ".zsh", ".fish",
  ".env", ".gitignore", ".dockerignore",
  ".lock", ".cfg", ".ini", ".conf",
  "Makefile", "Dockerfile", "Jenkinsfile", "Gemfile",
  "Rakefile", "Procfile",
]);

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  return TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(basename);
}

export interface CloneResult {
  path: string;
  changed: boolean;
}

export async function cloneRepo(url: string, token?: string): Promise<CloneResult> {
  // Use owner/repo as directory name for deduplication
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  const dirName = match
    ? `${match[1]}--${match[2].replace(/\.git$/, "")}`
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoPath = path.join(CLONE_DIR, dirName);

  // If already cloned, check for new commits
  try {
    await fs.access(path.join(repoPath, ".git"));
    const { stdout: oldHead } = await execFileAsync(
      "git", ["-C", repoPath, "rev-parse", "HEAD"], { timeout: 5_000 }
    );
    await execFileAsync("git", ["-C", repoPath, "fetch", "--depth", "1", "origin"], {
      timeout: 60_000,
    });
    const { stdout: fetchHead } = await execFileAsync(
      "git", ["-C", repoPath, "rev-parse", "FETCH_HEAD"], { timeout: 5_000 }
    );
    if (oldHead.trim() === fetchHead.trim()) {
      // No new commits — skip re-analysis
      return { path: repoPath, changed: false };
    }
    await execFileAsync("git", ["-C", repoPath, "reset", "--hard", "FETCH_HEAD"], {
      timeout: 30_000,
    });
    return { path: repoPath, changed: true };
  } catch {
    // Not cloned yet or fetch failed, do a fresh clone
  }

  await fs.mkdir(CLONE_DIR, { recursive: true });

  // Remove stale directory if it exists without .git
  try {
    await fs.rm(repoPath, { recursive: true, force: true });
  } catch { /* ignore */ }

  // Insert token into URL for private repo access
  let cloneUrl = url;
  if (token && url.startsWith("https://github.com/")) {
    cloneUrl = url.replace("https://github.com/", `https://x-access-token:${token}@github.com/`);
  }

  await execFileAsync("git", ["clone", "--depth", "1", cloneUrl, repoPath], {
    timeout: 120_000,
  });

  return { path: repoPath, changed: true };
}

export async function scanLocalTree(
  repoPath: string
): Promise<RepoFileEntry[]> {
  const tree: RepoFileEntry[] = [];

  async function walk(dir: string, prefix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;

      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        tree.push({ path: relativePath, type: "dir" });
        await walk(path.join(dir, entry.name), relativePath);
      } else if (entry.isFile()) {
        const fullPath = path.join(dir, entry.name);
        try {
          const stat = await fs.stat(fullPath);
          tree.push({ path: relativePath, type: "file", size: stat.size });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }

  await walk(repoPath, "");
  return tree;
}

export async function readFileFromClone(
  repoPath: string,
  filePath: string
): Promise<string | null> {
  const fullPath = path.join(repoPath, filePath);

  // Prevent path traversal
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(repoPath))) {
    return null;
  }

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile() || stat.size > 500_000) return null;
    if (!isTextFile(filePath)) return null;
    return await fs.readFile(fullPath, "utf-8");
  } catch {
    return null;
  }
}

export async function cleanupClone(repoPath: string): Promise<void> {
  try {
    await fs.rm(repoPath, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}
