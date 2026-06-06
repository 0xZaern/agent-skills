/**
 * Pure transformation functions: raw GitHub API responses -> RepoDigest sub-shapes.
 * No I/O, no side effects. All functions are synchronous.
 */

import {
  CommitEntry,
  FileTreeEntry,
  KeyFile,
  LanguageBreakdown,
  ReadmeContent,
  RepoMetadata,
  DigestStats,
} from "./types.js";
import { GHCommit, GHRepoInfo, GHTreeItem } from "./github/client.js";

// Re-export GHTreeItem so callers can use it without touching the client module.
export type { GHTreeItem };

// ---------------------------------------------------------------------------
// Excluded path segments for file tree pruning
// ---------------------------------------------------------------------------

const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "vendor",
  ".next",
  "coverage",
  "__pycache__",
  ".cache",
  ".turbo",
  ".output",
  "out",
  ".svelte-kit",
]);

const EXCLUDED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Pipfile.lock",
  "poetry.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".avif",
  ".mp4", ".mp3", ".wav", ".ogg", ".woff", ".woff2", ".ttf", ".eot",
  ".zip", ".tar", ".gz", ".7z", ".rar", ".pdf", ".exe", ".dll",
  ".so", ".dylib", ".a", ".lib", ".obj", ".o", ".pyc",
]);

const MAX_TREE_ENTRIES = 300;
const MAX_TREE_DEPTH = 6;

function isExcluded(entry: GHTreeItem): boolean {
  const parts = entry.path.split("/");
  // Check any segment against excluded dirs
  for (const part of parts) {
    if (EXCLUDED_DIRS.has(part)) return true;
  }
  // Check filename against lockfiles
  const filename = parts[parts.length - 1];
  if (EXCLUDED_FILES.has(filename)) return true;
  // Check extension against binary list
  const ext = filename.includes(".") ? "." + filename.split(".").pop()!.toLowerCase() : "";
  if (BINARY_EXTENSIONS.has(ext)) return true;
  // Depth cap
  if (parts.length > MAX_TREE_DEPTH) return true;
  return false;
}

export function toFileTree(items: GHTreeItem[]): FileTreeEntry[] {
  return items
    .filter((item) => !isExcluded(item) && (item.type === "blob" || item.type === "tree"))
    .slice(0, MAX_TREE_ENTRIES)
    .map((item) => ({
      path: item.path,
      type: item.type as "blob" | "tree",
    }));
}

// ---------------------------------------------------------------------------
// README normalization
// ---------------------------------------------------------------------------

const BADGE_PATTERN = /\[!\[.*?\]\(.*?\)\]\(.*?\)/g;
const BADGE_INLINE = /!\[.*?\]\(https?:\/\/(?:img\.shields\.io|badge\.fury\.io|travis-ci\.[a-z]+|circleci\.com|codecov\.io|coveralls\.io).*?\)/g;
const EXCESSIVE_BLANK_LINES = /\n{3,}/g;

export function normalizeReadme(raw: string): ReadmeContent {
  // Strip badge lines (Markdown image links pointing to shields.io etc.)
  let text = raw
    .replace(BADGE_PATTERN, "")
    .replace(BADGE_INLINE, "")
    .replace(EXCESSIVE_BLANK_LINES, "\n\n")
    .trim();

  // Strip leading blank lines that appear after badge removal
  text = text.replace(/^\n+/, "");

  // Excerpt: first ~600 meaningful chars (skip leading headings if very short)
  const excerptRaw = text.slice(0, 600);
  const excerpt = excerptRaw.length === text.length
    ? excerptRaw
    : excerptRaw.slice(0, excerptRaw.lastIndexOf("\n") + 1).trim() || excerptRaw.trim();

  return { full: text, excerpt };
}

// ---------------------------------------------------------------------------
// Language breakdown
// ---------------------------------------------------------------------------

export function toLanguageBreakdown(
  langMap: Record<string, number>
): LanguageBreakdown[] {
  const total = Object.values(langMap).reduce((s, b) => s + b, 0);
  if (total === 0) return [];
  return Object.entries(langMap)
    .map(([name, bytes]) => ({
      name,
      bytes,
      share: parseFloat((bytes / total).toFixed(4)),
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

// ---------------------------------------------------------------------------
// Repo metadata
// ---------------------------------------------------------------------------

export function toRepoMetadata(info: GHRepoInfo): RepoMetadata {
  return {
    owner: info.owner.login,
    name: info.name,
    fullName: info.full_name,
    description: info.description,
    stars: info.stargazers_count,
    forks: info.forks_count,
    primaryLanguage: info.language,
    license: info.license?.spdx_id ?? null,
    topics: info.topics,
    lastPush: info.pushed_at,
    openIssues: info.open_issues_count,
  };
}

// ---------------------------------------------------------------------------
// Recent commits
// ---------------------------------------------------------------------------

export function toCommitEntries(commits: GHCommit[]): CommitEntry[] {
  return commits.map((c) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0].trim(),
    date: c.commit.author.date,
    author: c.commit.author.name,
  }));
}

// ---------------------------------------------------------------------------
// Key file detection
// ---------------------------------------------------------------------------

const KEY_FILE_PATHS: string[] = [
  "package.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "tsconfig.app.json",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".github/workflows",
  "Makefile",
  "pyproject.toml",
  "setup.py",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "src/index.ts",
  "src/index.js",
  "src/main.ts",
  "src/main.js",
  "index.ts",
  "index.js",
  "main.ts",
  "main.py",
  "app.py",
  ".env.example",
];

export function detectKeyFiles(
  tree: FileTreeEntry[],
  fileContents: Map<string, string>
): KeyFile[] {
  const results: KeyFile[] = [];
  const treePaths = new Set(tree.map((e) => e.path));

  for (const kp of KEY_FILE_PATHS) {
    // Check exact match or (for directories like .github/workflows) prefix match
    const isDir = !kp.includes(".");
    const found = isDir
      ? tree.some((e) => e.path.startsWith(kp + "/") && e.type === "blob")
      : treePaths.has(kp);

    if (!found) continue;

    const content = fileContents.get(kp);
    const summary = summarizeKeyFile(kp, content ?? null, tree);
    results.push({ path: kp, summary });
  }

  return results;
}

function summarizeKeyFile(
  filePath: string,
  content: string | null,
  tree: FileTreeEntry[]
): string {
  const name = filePath.split("/").pop()!;

  if (name === "package.json" && content) {
    try {
      const pkg = JSON.parse(content) as {
        name?: string;
        version?: string;
        description?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const scriptList = Object.keys(pkg.scripts ?? {}).join(", ") || "(none)";
      const depCount = Object.keys(pkg.dependencies ?? {}).length;
      const devDepCount = Object.keys(pkg.devDependencies ?? {}).length;
      const topDeps = Object.keys(pkg.dependencies ?? {}).slice(0, 6).join(", ");
      return (
        `name=${pkg.name ?? "?"} version=${pkg.version ?? "?"} ` +
        `deps=${depCount} devDeps=${devDepCount} ` +
        `scripts=[${scriptList}]` +
        (topDeps ? ` topDeps=[${topDeps}]` : "")
      );
    } catch {
      return "present (parse error)";
    }
  }

  if (name === "tsconfig.json" || name.startsWith("tsconfig")) {
    if (content) {
      try {
        // Strip JSON comments for rough parse
        const stripped = content.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        const tc = JSON.parse(stripped) as {
          compilerOptions?: { target?: string; module?: string; strict?: boolean };
          extends?: string;
        };
        const co = tc.compilerOptions ?? {};
        return `target=${co.target ?? "?"} module=${co.module ?? "?"} strict=${co.strict ?? false}${tc.extends ? ` extends=${tc.extends}` : ""}`;
      } catch {
        return "present";
      }
    }
    return "present";
  }

  if (name === "Dockerfile") {
    if (content) {
      const fromLine = content.split("\n").find((l) => l.trimStart().startsWith("FROM"));
      return fromLine ? `base: ${fromLine.replace(/^FROM\s+/i, "").trim()}` : "present";
    }
    return "present";
  }

  if (name === "docker-compose.yml" || name === "docker-compose.yaml") {
    if (content) {
      const services = (content.match(/^\s{2}[a-z][a-z0-9_-]+:/gm) ?? []).map(
        (s) => s.trim().replace(":", "")
      );
      return services.length ? `services: [${services.join(", ")}]` : "present";
    }
    return "present";
  }

  if (filePath === ".github/workflows") {
    const workflows = tree
      .filter((e) => e.path.startsWith(".github/workflows/") && e.type === "blob")
      .map((e) => e.path.split("/").pop()!.replace(/\.ya?ml$/, ""));
    return `CI workflows: [${workflows.join(", ")}]`;
  }

  if (name === "Makefile") return "present";

  if (name === "pyproject.toml" && content) {
    const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
    const versionMatch = content.match(/^version\s*=\s*"([^"]+)"/m);
    return `name=${nameMatch?.[1] ?? "?"} version=${versionMatch?.[1] ?? "?"}`;
  }

  if (name === "requirements.txt" && content) {
    const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    return `${lines.length} packages`;
  }

  if (name === "go.mod" && content) {
    const moduleMatch = content.match(/^module\s+(\S+)/m);
    const goMatch = content.match(/^go\s+([\d.]+)/m);
    return `module=${moduleMatch?.[1] ?? "?"} go=${goMatch?.[1] ?? "?"}`;
  }

  if (name === "Cargo.toml" && content) {
    const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
    const versionMatch = content.match(/^version\s*=\s*"([^"]+)"/m);
    return `name=${nameMatch?.[1] ?? "?"} version=${versionMatch?.[1] ?? "?"}`;
  }

  return "present";
}

// ---------------------------------------------------------------------------
// Token stats
// ---------------------------------------------------------------------------

/**
 * Estimates token savings of the digest vs. reading the repo's actual file
 * contents without devpulse.
 *
 * tokenEstimate: produced digest JSON length / 4 (chars-per-token heuristic).
 *
 * rawEstimate: what an AI agent would actually spend to understand this repo
 * without devpulse — the token cost of reading every text/source blob:
 *   sum(size_bytes of all non-excluded text blobs from the recursive tree) / 4
 * The same exclusion list used for the pruned tree is applied (node_modules,
 * dist, build, lockfiles, binaries, etc.), so this reflects only the files a
 * developer would reasonably read.
 *
 * savedPercent is clamped to >= 0: if the digest is somehow not smaller (only
 * possible on a trivially tiny repo), we show 0% rather than a negative number.
 */
export function computeStats(
  digestJson: string,
  rawTree: GHTreeItem[]
): DigestStats {
  const tokenEstimate = Math.ceil(digestJson.length / 4);

  // Sum bytes of all text blobs that pass the same exclusion filter used for
  // the displayed tree. Only blobs have a meaningful size; trees report 0 or
  // undefined.
  let totalSourceBytes = 0;
  for (const item of rawTree) {
    if (item.type !== "blob") continue;
    if (isExcluded(item)) continue;
    totalSourceBytes += item.size ?? 0;
  }

  // Floor at 1 so we never divide by zero, but also ensures tiny single-file
  // repos produce 0% rather than crashing.
  const rawEstimate = Math.max(1, Math.ceil(totalSourceBytes / 4));

  const savedPercent = Math.max(
    0,
    Math.round((1 - tokenEstimate / rawEstimate) * 100)
  );

  return { tokenEstimate, rawEstimate, savedPercent };
}

// ---------------------------------------------------------------------------
// Token budget trimming
// ---------------------------------------------------------------------------

import { RepoDigest } from "./types.js";

/**
 * Trims a RepoDigest to approximately fit within maxTokens.
 * Trimming order (least to most impactful on quality):
 *   1. Drop recentActivity
 *   2. Shorten readme.excerpt
 *   3. Prune fileTree entries
 *   4. Drop readme.full (keep only excerpt)
 */
export function trimToTokenBudget(digest: RepoDigest, maxTokens: number): RepoDigest {
  const estimate = () => Math.ceil(JSON.stringify(digest).length / 4);

  if (estimate() <= maxTokens) return digest;

  // Step 1: drop recentActivity
  digest = { ...digest, recentActivity: [] };
  if (estimate() <= maxTokens) return digest;

  // Step 2: shorten readme excerpt
  const shortExcerpt = digest.readme.excerpt.slice(0, 200);
  digest = { ...digest, readme: { ...digest.readme, excerpt: shortExcerpt } };
  if (estimate() <= maxTokens) return digest;

  // Step 3: prune file tree (keep only first 50 entries)
  digest = { ...digest, fileTree: digest.fileTree.slice(0, 50) };
  if (estimate() <= maxTokens) return digest;

  // Step 4: drop readme.full
  digest = { ...digest, readme: { ...digest.readme, full: "" } };

  return digest;
}
