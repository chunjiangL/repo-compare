import { Octokit } from "@octokit/rest";
import type { RepoMetadata, RepoFileEntry, RepoFileContent } from "./types/github.js";

export async function getRepoMetadata(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<RepoMetadata> {
  const [repoRes, languagesRes] = await Promise.all([
    octokit.repos.get({ owner, repo }),
    octokit.repos.listLanguages({ owner, repo }),
  ]);

  let contributorsCount = 0;
  try {
    const contribRes = await octokit.repos.listContributors({
      owner,
      repo,
      per_page: 1,
      anon: "true",
    });
    // GitHub returns contributor count in the last page link
    const linkHeader = contribRes.headers.link;
    if (linkHeader) {
      const match = linkHeader.match(/page=(\d+)>; rel="last"/);
      contributorsCount = match ? parseInt(match[1], 10) : 1;
    } else {
      contributorsCount = contribRes.data.length;
    }
  } catch {
    contributorsCount = 0;
  }

  const r = repoRes.data;
  return {
    owner,
    name: repo,
    fullName: r.full_name,
    description: r.description,
    stars: r.stargazers_count,
    forks: r.forks_count,
    watchers: r.subscribers_count,
    openIssues: r.open_issues_count,
    language: r.language,
    languages: languagesRes.data as Record<string, number>,
    license: r.license?.spdx_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    pushedAt: r.pushed_at,
    size: r.size,
    defaultBranch: r.default_branch,
    topics: r.topics ?? [],
    archived: r.archived,
    contributorsCount,
  };
}

export async function getRepoTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<RepoFileEntry[]> {
  const res = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "true",
  });

  return res.data.tree
    .filter((item) => item.path && (item.type === "blob" || item.type === "tree"))
    .map((item) => ({
      path: item.path!,
      type: item.type === "blob" ? "file" as const : "dir" as const,
      size: item.size,
    }));
}

export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<RepoFileContent | null> {
  try {
    const res = await octokit.repos.getContent({ owner, repo, path });
    const data = res.data;
    if ("content" in data && data.type === "file") {
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      return { path, content, size: data.size };
    }
    return null;
  } catch {
    return null;
  }
}

// Priority file patterns for Phase 1 fetch
const PRIORITY_FILES = [
  // 1. Config/manifest
  "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle",
  "requirements.txt", "Gemfile", "composer.json",
  // 2. README
  "README.md", "README", "README.rst", "README.txt",
  // 3. CI/CD
  ".github/workflows", ".gitlab-ci.yml", "Jenkinsfile", ".circleci/config.yml",
  // 4. Entry points
  "src/index.ts", "src/index.js", "src/main.ts", "src/main.js",
  "app.ts", "app.js", "index.ts", "index.js", "main.py", "app.py",
  // 5. Config files
  "tsconfig.json", ".eslintrc.json", ".eslintrc.js", ".prettierrc",
  "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
  // 6. License
  "LICENSE", "LICENSE.md",
];

// Lock files — check existence only
const LOCK_FILES = [
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "Cargo.lock", "Gemfile.lock", "poetry.lock", "composer.lock",
];

export function selectFilesToFetch(tree: RepoFileEntry[]): string[] {
  const filePaths = new Set(tree.filter((e) => e.type === "file").map((e) => e.path));
  const selected: string[] = [];

  for (const pattern of PRIORITY_FILES) {
    if (filePaths.has(pattern)) {
      selected.push(pattern);
    }
  }

  // Check for CI workflow files
  const workflows = tree
    .filter((e) => e.type === "file" && e.path.startsWith(".github/workflows/") && e.path.endsWith(".yml"))
    .map((e) => e.path)
    .slice(0, 3);
  selected.push(...workflows);

  return [...new Set(selected)].slice(0, 15);
}

export function checkLockFiles(tree: RepoFileEntry[]): string[] {
  const filePaths = new Set(tree.filter((e) => e.type === "file").map((e) => e.path));
  return LOCK_FILES.filter((f) => filePaths.has(f));
}
