/**
 * devpulse library types — the public API contract.
 * All exported types are stable and versioned with the package.
 */

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DigestOptions {
  /** Output format hint for the CLI; library always returns RepoDigest. */
  format?: "json" | "md" | "text";
  /**
   * Soft token budget. When set, the library will trim the digest to
   * approximately this many tokens (chars/4). Trimming order:
   *   1. recentActivity dropped first
   *   2. readme.excerpt shortened
   *   3. fileTree entries pruned further
   *   4. readme.full dropped (only excerpt kept)
   */
  maxTokens?: number;
  /** GitHub personal access token. Overrides GITHUB_TOKEN env var. */
  token?: string;
  /** Skip disk cache — always fetch fresh from GitHub. */
  noCache?: boolean;
}

// ---------------------------------------------------------------------------
// RepoDigest sub-shapes
// ---------------------------------------------------------------------------

export interface RepoMetadata {
  /** GitHub owner (user or org). */
  owner: string;
  /** Repository name (without owner). */
  name: string;
  /** Full slug: owner/name. */
  fullName: string;
  /** GitHub repository description. */
  description: string | null;
  /** Number of stars. */
  stars: number;
  /** Number of forks. */
  forks: number;
  /** Primary language reported by GitHub. */
  primaryLanguage: string | null;
  /** SPDX identifier of the license, e.g. "MIT", or null if not set. */
  license: string | null;
  /** Repository topics. */
  topics: string[];
  /** ISO 8601 timestamp of the last push. */
  lastPush: string;
  /** Number of open issues. */
  openIssues: number;
}

export interface LanguageBreakdown {
  /** Language name. */
  name: string;
  /** Total bytes. */
  bytes: number;
  /** Share of total bytes, 0..1, rounded to 4 decimals. */
  share: number;
}

export interface FileTreeEntry {
  /** Path relative to repo root. */
  path: string;
  /** "blob" for file, "tree" for directory. */
  type: "blob" | "tree";
}

export interface ReadmeContent {
  /** Full README text (normalized: collapsed blank lines, stripped badges). */
  full: string;
  /** Short excerpt: first ~500 chars of meaningful content. */
  excerpt: string;
}

export interface KeyFile {
  /** Path of the detected file. */
  path: string;
  /** Compact human-readable summary of what was found. */
  summary: string;
}

export interface CommitEntry {
  /** Short commit SHA (7 chars). */
  sha: string;
  /** Commit message (first line only). */
  message: string;
  /** ISO 8601 timestamp. */
  date: string;
  /** Commit author name. */
  author: string;
}

export interface DigestStats {
  /** Estimated tokens of this digest output (chars / 4). */
  tokenEstimate: number;
  /**
   * Rough estimate if you had pasted the raw README + file listing directly.
   * Used to show savings.
   */
  rawEstimate: number;
  /** Percent reduction vs. raw pasting. */
  savedPercent: number;
}

// ---------------------------------------------------------------------------
// Top-level digest
// ---------------------------------------------------------------------------

export interface RepoDigest {
  /** Repository metadata. */
  metadata: RepoMetadata;
  /** Language breakdown for this repo. */
  languages: LanguageBreakdown[];
  /**
   * Pruned file tree. Excludes: node_modules, dist, build, .git,
   * lockfiles, vendor, .next, coverage, and common binary/image extensions.
   * Capped at 300 entries.
   */
  fileTree: FileTreeEntry[];
  /** README content. */
  readme: ReadmeContent;
  /**
   * Auto-detected important files with compact summaries.
   * Examples: package.json (deps/scripts), tsconfig presence, Dockerfile, CI.
   */
  keyFiles: KeyFile[];
  /** Last ~5 commits. */
  recentActivity: CommitEntry[];
  /** Token-saving stats. */
  stats: DigestStats;
  /** ISO 8601 timestamp when this digest was generated. */
  generatedAt: string;
  /** True if served from disk cache. */
  cached: boolean;
}
