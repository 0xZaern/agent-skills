/**
 * Git helpers for secretscan.
 *
 * Resolves the list of files to scan based on the requested source:
 *  - "staged"  — files currently staged (git diff --cached --name-only)
 *  - "tracked" — all files tracked by git (git ls-files)
 *  - "all"     — all files in the directory (git ls-files + untracked respecting .gitignore)
 *
 * No network calls. Synchronous (spawnSync) for simplicity.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

function runGit(args: string[], cwd: string): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw new Error(`git ${args[0]} failed: ${result.error.message}`);
  }
  return result.stdout ?? "";
}

/** Returns absolute paths of staged files in the given repo directory. */
export function getStagedFiles(dir: string): string[] {
  const raw = runGit(["diff", "--cached", "--name-only", "--diff-filter=ACM"], dir);
  return raw
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => path.resolve(dir, f));
}

/** Returns absolute paths of all files tracked by git. */
export function getTrackedFiles(dir: string): string[] {
  const raw = runGit(["ls-files", "--cached", "--others", "--exclude-standard"], dir);
  return raw
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => path.resolve(dir, f));
}

/** Returns absolute paths of tracked + untracked (not ignored) files. */
export function getAllFiles(dir: string): string[] {
  // git ls-files with --others --exclude-standard gives untracked files respecting .gitignore
  const tracked = runGit(["ls-files", "--cached"], dir);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], dir);
  const combined = new Set([
    ...tracked.split("\n").map((f) => f.trim()).filter(Boolean),
    ...untracked.split("\n").map((f) => f.trim()).filter(Boolean),
  ]);
  return Array.from(combined).map((f) => path.resolve(dir, f));
}

/** True if the given directory is inside a git repository. */
export function isGitRepo(dir: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--git-dir"], {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}
