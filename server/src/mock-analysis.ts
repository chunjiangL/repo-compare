import type { RepoData } from "./types/github.js";
import type { AnalysisResult, RepoAnalysis, DimensionAnalysis, DimensionMetric } from "./types/analysis.js";

// Phase 1: only dimensions computable from metadata/file tree — no LLM
const HEURISTIC_DIMENSIONS = [
  "Adoption",
  "Maintenance",
  "Leanness",
  "Documentation",
  "Architecture",
];

function clamp(n: number): number {
  return Math.max(1, Math.min(10, n));
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// --- Computed stats helpers ---

function getDependencyCount(data: RepoData): { runtime: number; dev: number; total: number } {
  const pkg = data.files.find((f) => f.path === "package.json");
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg.content);
      const runtime = Object.keys(parsed.dependencies ?? {}).length;
      const dev = Object.keys(parsed.devDependencies ?? {}).length;
      return { runtime, dev, total: runtime + dev };
    } catch { /* ignore */ }
  }

  const reqs = data.files.find((f) => f.path === "requirements.txt");
  if (reqs) {
    const total = reqs.content.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
    return { runtime: total, dev: 0, total };
  }

  const gomod = data.files.find((f) => f.path === "go.mod");
  if (gomod) {
    const total = (gomod.content.match(/^\t[^\s]/gm) ?? []).length;
    return { runtime: total, dev: 0, total };
  }

  const pyproject = data.files.find((f) => f.path === "pyproject.toml");
  if (pyproject) {
    const depsMatch = pyproject.content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depsMatch) {
      const total = Math.floor((depsMatch[1].match(/"/g) ?? []).length / 2);
      return { runtime: total, dev: 0, total };
    }
  }

  return { runtime: 0, dev: 0, total: 0 };
}

function estimateLOC(data: RepoData): number {
  // Estimate from file sizes: ~25 bytes per line average for source code
  const sourceExts = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".kt",
    ".rb", ".php", ".c", ".cpp", ".h", ".cs", ".swift", ".m",
  ]);
  const sourceFiles = data.tree.filter((e) =>
    e.type === "file" && e.size && sourceExts.has(extOf(e.path))
  );
  const totalBytes = sourceFiles.reduce((sum, e) => sum + (e.size ?? 0), 0);
  return Math.round(totalBytes / 25);
}

function extOf(p: string): string {
  const dot = p.lastIndexOf(".");
  return dot >= 0 ? p.slice(dot).toLowerCase() : "";
}

function countTestFiles(data: RepoData): number {
  return data.tree.filter((e) =>
    e.type === "file" &&
    (/\.(test|spec)\.(ts|tsx|js|jsx|py|rs|go)$/.test(e.path) ||
     /test_[^/]+\.py$/.test(e.path) ||
     /_test\.go$/.test(e.path) ||
     e.path.includes("__tests__/"))
  ).length;
}

function countSourceFiles(data: RepoData): number {
  const sourceExts = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".kt",
    ".rb", ".php", ".c", ".cpp", ".h", ".cs", ".swift", ".m",
  ]);
  return data.tree.filter((e) => e.type === "file" && sourceExts.has(extOf(e.path))).length;
}

function getAvgFileSize(data: RepoData): number {
  const sourceExts = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".kt",
    ".rb", ".php", ".c", ".cpp", ".h", ".cs", ".swift",
  ]);
  const files = data.tree.filter((e) =>
    e.type === "file" && e.size && e.size > 0 && sourceExts.has(extOf(e.path))
  );
  if (files.length === 0) return 0;
  return files.reduce((sum, e) => sum + (e.size ?? 0), 0) / files.length;
}

function getMaxDepth(data: RepoData): number {
  let max = 0;
  for (const e of data.tree) {
    if (e.type === "file") {
      const depth = e.path.split("/").length;
      if (depth > max) max = depth;
    }
  }
  return max;
}

function getReadmeWordCount(data: RepoData): number {
  const readme = data.files.find((f) => f.path.toLowerCase().startsWith("readme"));
  if (!readme) return 0;
  return readme.content.split(/\s+/).filter(Boolean).length;
}

function countDocFiles(data: RepoData): number {
  return data.tree.filter((e) =>
    e.type === "file" &&
    (/\.(md|rst|txt)$/.test(e.path) || e.path.toLowerCase().includes("doc"))
  ).length;
}

function countExamples(data: RepoData): number {
  return data.tree.filter((e) =>
    e.type === "file" &&
    (e.path.toLowerCase().includes("example") || e.path.toLowerCase().includes("demo"))
  ).length;
}

function getTopLanguages(data: RepoData): string {
  const langs = Object.entries(data.metadata.languages);
  if (langs.length === 0) return "Unknown";
  const total = langs.reduce((s, [, b]) => s + b, 0);
  return langs
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([l, b]) => `${l} ${((b / total) * 100).toFixed(0)}%`)
    .join(", ");
}

// --- Score computation ---

function computeScore(data: RepoData, dimension: string): number {
  const { metadata, tree } = data;

  switch (dimension) {
    case "Adoption": {
      let score = 3;
      if (metadata.stars >= 10000) score += 3;
      else if (metadata.stars >= 1000) score += 2;
      else if (metadata.stars >= 100) score += 1;
      if (metadata.forks >= 500) score += 2;
      else if (metadata.forks >= 50) score += 1;
      if (metadata.contributorsCount >= 20) score += 2;
      else if (metadata.contributorsCount >= 5) score += 1;
      return clamp(score);
    }

    case "Maintenance": {
      let score = 4;
      const daysSincePush = daysSince(metadata.pushedAt);
      if (daysSincePush < 7) score += 3;
      else if (daysSincePush < 30) score += 2;
      else if (daysSincePush < 90) score += 1;
      else if (daysSincePush >= 365) score -= 2;
      if (!metadata.archived) score += 1;
      if (metadata.openIssues < 100) score += 1;
      else if (metadata.openIssues > 500) score -= 1;
      if (daysSince(metadata.createdAt) / 365 > 1) score += 1;
      return clamp(score);
    }

    case "Leanness": {
      let score = 8;
      const fileCount = tree.filter((e) => e.type === "file").length;
      if (fileCount > 2000) score -= 2;
      else if (fileCount > 500) score -= 1;
      const deps = getDependencyCount(data);
      if (deps.total > 50) score -= 2;
      else if (deps.total > 20) score -= 1;
      const langCount = Object.keys(metadata.languages).length;
      if (langCount > 5) score -= 1;
      if (metadata.size > 50000) score -= 1;
      return clamp(score);
    }

    case "Documentation": {
      let score = 3;
      const readmeWords = getReadmeWordCount(data);
      if (readmeWords > 500) score += 2;
      else if (readmeWords > 100) score += 1;
      const hasDocs = tree.some((e) => e.type === "dir" && /^(docs|documentation|doc)\/?$/.test(e.path));
      if (hasDocs) score += 1;
      const hasChangelog = tree.some((e) => /^(changelog|history|changes)\b/i.test(e.path));
      if (hasChangelog) score += 1;
      if (metadata.license) score += 1;
      const examples = countExamples(data);
      if (examples > 0) score += 1;
      return clamp(score);
    }

    case "Architecture": {
      let score = 4;
      const hasSrcDir = tree.some((e) => e.type === "dir" && /^(src|lib)\/?$/.test(e.path));
      if (hasSrcDir) score += 1;
      const topLevelDirs = new Set(
        tree.filter((e) => e.type === "dir").map((e) => e.path.split("/")[0])
      );
      if (topLevelDirs.size >= 3 && topLevelDirs.size <= 15) score += 1;
      const avgSize = getAvgFileSize(data);
      if (avgSize > 0 && avgSize < 5000) score += 1;
      else if (avgSize > 50000) score -= 1;
      const testFiles = countTestFiles(data);
      if (testFiles > 0) score += 1;
      const maxDepth = getMaxDepth(data);
      if (maxDepth >= 3 && maxDepth <= 8) score += 1;
      return clamp(score);
    }

    default:
      return 5;
  }
}

// --- Metric generation ---

function generateMetrics(data: RepoData, dimension: string): DimensionMetric[] {
  const { metadata, tree } = data;

  switch (dimension) {
    case "Adoption": {
      const starsPerFork = metadata.forks > 0 ? (metadata.stars / metadata.forks).toFixed(1) : "N/A";
      return [
        { label: "Stars", value: metadata.stars.toLocaleString(), sentiment: metadata.stars >= 1000 ? "positive" : metadata.stars >= 100 ? "neutral" : "negative" },
        { label: "Forks", value: metadata.forks.toLocaleString(), sentiment: metadata.forks >= 100 ? "positive" : "neutral" },
        { label: "Contributors", value: String(metadata.contributorsCount), sentiment: metadata.contributorsCount >= 20 ? "positive" : metadata.contributorsCount >= 5 ? "neutral" : "negative" },
        { label: "Stars/Fork", value: starsPerFork },
        { label: "Topics", value: metadata.topics.length > 0 ? String(metadata.topics.length) : "None", sentiment: metadata.topics.length > 0 ? "positive" : "neutral" },
      ];
    }

    case "Maintenance": {
      const daysSincePushVal = daysSince(metadata.pushedAt);
      const pushLabel = daysSincePushVal < 7 ? `${daysSincePushVal}d ago` : daysSincePushVal < 30 ? `${Math.floor(daysSincePushVal / 7)}w ago` : daysSincePushVal < 365 ? `${Math.floor(daysSincePushVal / 30)}mo ago` : `${Math.floor(daysSincePushVal / 365)}y ago`;
      const ageYears = (daysSince(metadata.createdAt) / 365).toFixed(1);
      const issueRatio = metadata.stars > 0 ? (metadata.openIssues / metadata.stars * 100).toFixed(1) : "N/A";
      return [
        { label: "Last Push", value: pushLabel, sentiment: daysSincePushVal < 30 ? "positive" : daysSincePushVal > 365 ? "negative" : "neutral" },
        { label: "Open Issues", value: metadata.openIssues.toLocaleString(), sentiment: metadata.openIssues < 50 ? "positive" : metadata.openIssues > 500 ? "negative" : "neutral" },
        { label: "Issue/Star %", value: `${issueRatio}%`, sentiment: Number(issueRatio) < 5 ? "positive" : Number(issueRatio) > 20 ? "negative" : "neutral" },
        { label: "Age", value: `${ageYears}y`, sentiment: Number(ageYears) > 1 ? "positive" : "neutral" },
        { label: "Archived", value: metadata.archived ? "Yes" : "No", sentiment: metadata.archived ? "negative" : "positive" },
      ];
    }

    case "Leanness": {
      const fileCount = tree.filter((e) => e.type === "file").length;
      const deps = getDependencyCount(data);
      const langCount = Object.keys(metadata.languages).length;
      const loc = estimateLOC(data);
      const locPerFile = countSourceFiles(data) > 0 ? Math.round(loc / countSourceFiles(data)) : 0;
      return [
        { label: "Total Files", value: fileCount.toLocaleString(), sentiment: fileCount < 500 ? "positive" : fileCount > 2000 ? "negative" : "neutral" },
        { label: "Source Files", value: countSourceFiles(data).toLocaleString() },
        { label: "Est. LOC", value: loc > 1000 ? `${(loc / 1000).toFixed(1)}K` : String(loc) },
        { label: "LOC/File", value: String(locPerFile), sentiment: locPerFile > 0 && locPerFile < 300 ? "positive" : locPerFile > 500 ? "negative" : "neutral" },
        { label: "Dependencies", value: deps.total > 0 ? `${deps.runtime} + ${deps.dev} dev` : "0", sentiment: deps.total < 20 ? "positive" : deps.total > 50 ? "negative" : "neutral" },
        { label: "Languages", value: String(langCount), sentiment: langCount <= 3 ? "positive" : langCount > 5 ? "negative" : "neutral" },
        { label: "Repo Size", value: metadata.size > 1024 ? `${(metadata.size / 1024).toFixed(0)}MB` : `${metadata.size}KB` },
      ];
    }

    case "Documentation": {
      const readmeWords = getReadmeWordCount(data);
      const hasDocs = tree.some((e) => e.type === "dir" && /^(docs|documentation|doc)\/?$/.test(e.path));
      const hasChangelog = tree.some((e) => /^(changelog|history|changes)\b/i.test(e.path));
      const docFiles = countDocFiles(data);
      const examples = countExamples(data);
      const readme = data.files.find((f) => f.path.toLowerCase().startsWith("readme"));
      const readmeSections = readme ? (readme.content.match(/^#{1,3}\s+/gm) ?? []).length : 0;
      return [
        { label: "README", value: readmeWords > 0 ? `${readmeWords.toLocaleString()} words` : "None", sentiment: readmeWords > 500 ? "positive" : readmeWords > 0 ? "neutral" : "negative" },
        { label: "README Sections", value: String(readmeSections), sentiment: readmeSections >= 5 ? "positive" : readmeSections >= 2 ? "neutral" : "negative" },
        { label: "Doc Files", value: String(docFiles), sentiment: docFiles >= 5 ? "positive" : docFiles > 0 ? "neutral" : "negative" },
        { label: "Docs Dir", value: hasDocs ? "Yes" : "No", sentiment: hasDocs ? "positive" : "neutral" },
        { label: "Examples", value: examples > 0 ? String(examples) : "None", sentiment: examples > 0 ? "positive" : "neutral" },
        { label: "Changelog", value: hasChangelog ? "Yes" : "No", sentiment: hasChangelog ? "positive" : "neutral" },
        { label: "License", value: metadata.license ?? "None", sentiment: metadata.license ? "positive" : "negative" },
      ];
    }

    case "Architecture": {
      const sourceFiles = countSourceFiles(data);
      const testFiles = countTestFiles(data);
      const testRatio = sourceFiles > 0 ? ((testFiles / sourceFiles) * 100).toFixed(0) : "0";
      const avgSize = getAvgFileSize(data);
      const maxDepth = getMaxDepth(data);
      const topLevelDirs = new Set(tree.filter((e) => e.type === "dir").map((e) => e.path.split("/")[0]));
      const topLangs = getTopLanguages(data);
      return [
        { label: "Test Files", value: String(testFiles), sentiment: testFiles > 0 ? "positive" : "negative" },
        { label: "Test Ratio", value: `${testRatio}%`, sentiment: Number(testRatio) >= 20 ? "positive" : Number(testRatio) > 0 ? "neutral" : "negative" },
        { label: "Avg File Size", value: avgSize > 0 ? `${(avgSize / 1024).toFixed(1)}KB` : "N/A", sentiment: avgSize > 0 && avgSize < 5000 ? "positive" : avgSize > 50000 ? "negative" : "neutral" },
        { label: "Max Depth", value: String(maxDepth), sentiment: maxDepth >= 3 && maxDepth <= 8 ? "positive" : maxDepth > 10 ? "negative" : "neutral" },
        { label: "Top Dirs", value: String(topLevelDirs.size) },
        { label: "Languages", value: topLangs },
      ];
    }

    default:
      return [];
  }
}

// --- Main export ---

export function generateMockAnalysis(data: RepoData): RepoAnalysis {
  const dimensions: Record<string, DimensionAnalysis> = {};

  for (const dim of HEURISTIC_DIMENSIONS) {
    const score = computeScore(data, dim);
    const metrics = generateMetrics(data, dim);

    dimensions[dim] = {
      score,
      summary: "",
      details: "",
      evidence: [],
      metrics,
    };
  }

  return {
    url: `https://github.com/${data.metadata.fullName}`,
    name: data.metadata.fullName,
    description: data.metadata.description ?? "No description available",
    metadata: data.metadata,
    dimensions,
  };
}

export function generateAnalysisResult(repoAnalyses: RepoAnalysis[]): AnalysisResult {
  const result: AnalysisResult = {
    repos: repoAnalyses,
    overallSummary: `Analyzed ${repoAnalyses.length} repositor${repoAnalyses.length === 1 ? "y" : "ies"}.`,
  };

  if (repoAnalyses.length > 1) {
    const scores = repoAnalyses.map((r) => {
      const dims = Object.values(r.dimensions);
      const avg = dims.reduce((sum, d) => sum + d.score, 0) / dims.length;
      return { name: r.name, avg };
    });
    scores.sort((a, b) => b.avg - a.avg);

    result.comparison = {
      comparable: true,
      reason: "Repositories share common characteristics for comparison",
      summary: `${scores[0].name} leads with an average score of ${scores[0].avg.toFixed(1)}/10.`,
      winner: scores[0].name,
    };
  }

  return result;
}
