export interface RepoMetadata {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  language: string | null;
  languages: Record<string, number>;
  license: string | null;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  size: number;
  defaultBranch: string;
  topics: string[];
  archived: boolean;
  contributorsCount: number;
}

export interface RepoFileEntry {
  path: string;
  type: "file" | "dir";
  size?: number;
}

export interface RepoFileContent {
  path: string;
  content: string;
  size: number;
}

export interface RepoData {
  metadata: RepoMetadata;
  tree: RepoFileEntry[];
  files: RepoFileContent[];
  phase: "fetch" | "clone";
}
