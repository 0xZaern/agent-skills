/**
 * File system walker with .gitignore-aware pruning.
 *
 * Excludes node_modules, dist, build, .git, .next, coverage, vendor,
 * lockfiles, binary/image extensions, and paths matched by .gitignore patterns.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Hard exclusion lists (always excluded, regardless of .gitignore)
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
  ".parcel-cache",
  "storybook-static",
  ".vercel",
  ".netlify",
]);

const EXCLUDED_FILENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Pipfile.lock",
  "poetry.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum",
  ".DS_Store",
  "Thumbs.db",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".avif",
  ".mp4",
  ".mp3",
  ".wav",
  ".ogg",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".rar",
  ".pdf",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".a",
  ".lib",
  ".obj",
  ".o",
  ".pyc",
  ".class",
  ".wasm",
  ".map",
  ".db",
  ".sqlite",
  ".db-shm",
  ".db-wal",
]);

const MAX_FILE_SIZE_BYTES = 500_000; // 500 KB — skip huge generated files

// ---------------------------------------------------------------------------
// Minimal .gitignore parser
// ---------------------------------------------------------------------------

type GitignorePattern = { negate: boolean; pattern: string; isDir: boolean };

function parseGitignore(filePath: string): GitignorePattern[] {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const negate = l.startsWith("!");
        const raw = negate ? l.slice(1) : l;
        const isDir = raw.endsWith("/");
        const pattern = isDir ? raw.slice(0, -1) : raw;
        return { negate, pattern, isDir };
      });
  } catch {
    return [];
  }
}

function matchesGitignore(
  patterns: GitignorePattern[],
  relPath: string,
  isDirectory: boolean
): boolean {
  let matched = false;
  const parts = relPath.split("/");
  const name = parts[parts.length - 1];

  for (const { negate, pattern, isDir } of patterns) {
    if (isDir && !isDirectory) continue;

    // Simple matching: check against name or full relPath
    const matchName = globMatch(pattern, name);
    const matchPath = globMatch(pattern, relPath);
    // Also check if any path segment matches a simple (non-glob, non-slash) pattern
    const matchSegment =
      !pattern.includes("/") &&
      !pattern.includes("*") &&
      parts.some((p) => p === pattern);

    if (matchName || matchPath || matchSegment) {
      matched = !negate;
    }
  }

  return matched;
}

/**
 * Minimal glob matching: supports * and ? wildcards, no ** support.
 * Sufficient for the common .gitignore patterns (*.log, *.env, dist/, etc.)
 */
function globMatch(pattern: string, str: string): boolean {
  // Convert glob to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(str);
}

// ---------------------------------------------------------------------------
// Public walk function
// ---------------------------------------------------------------------------

export interface WalkedFile {
  /** Absolute path. */
  absPath: string;
  /** Path relative to root. */
  relPath: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Whether this is a source file eligible for symbol extraction. */
  isSource: boolean;
}

export interface WalkedDir {
  /** Path relative to root. */
  relPath: string;
}

export interface WalkResult {
  files: WalkedFile[];
  dirs: WalkedDir[];
}

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function walk(rootDir: string): WalkResult {
  const absRoot = path.resolve(rootDir);
  const gitignorePatterns = parseGitignore(path.join(absRoot, ".gitignore"));

  const files: WalkedFile[] = [];
  const dirs: WalkedDir[] = [];

  function recurse(absDir: string, relDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name;
      const absPath = path.join(absDir, name);
      const relPath = relDir ? `${relDir}/${name}` : name;

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(name)) continue;
        if (matchesGitignore(gitignorePatterns, relPath, true)) continue;
        dirs.push({ relPath });
        recurse(absPath, relPath);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        if (EXCLUDED_FILENAMES.has(name)) continue;
        const ext = getExt(name);
        if (BINARY_EXTENSIONS.has(ext)) continue;
        if (matchesGitignore(gitignorePatterns, relPath, false)) continue;

        let sizeBytes = 0;
        try {
          const stat = fs.statSync(absPath);
          sizeBytes = stat.size;
        } catch {
          continue;
        }
        if (sizeBytes > MAX_FILE_SIZE_BYTES) continue;

        files.push({
          absPath,
          relPath,
          sizeBytes,
          isSource: SOURCE_EXTENSIONS.has(ext),
        });
      }
    }
  }

  recurse(absRoot, "");
  return { files, dirs };
}
