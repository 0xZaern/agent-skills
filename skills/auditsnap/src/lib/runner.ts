/**
 * Runs `npm audit --json` in a target directory and returns the raw stdout.
 * Also handles reading from stdin when the caller has already piped it.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";

export function runNpmAudit(dir: string): string {
  const result = spawnSync("npm", ["audit", "--json"], {
    cwd: dir,
    encoding: "utf8",
    // npm audit exits non-zero when vulns are found — that's fine
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`Failed to run npm audit: ${result.error.message}`);
  }

  const out = result.stdout ?? "";
  if (!out.trim()) {
    // no stdout at all usually means npm wasn't found or the dir has no package.json
    const errMsg = result.stderr ?? "";
    throw new Error(
      `npm audit produced no output${errMsg ? `: ${errMsg.slice(0, 200)}` : ". Is there a package.json?"}`
    );
  }

  return out;
}

/** Read the full stdin synchronously (blocking). */
export function readStdin(): string {
  return fs.readFileSync("/dev/stdin", "utf8");
}

export function stdinIsPiped(): boolean {
  try {
    const stat = fs.fstatSync(0);
    // FIFO or regular file means stdin has data piped in
    return stat.isFIFO() || stat.isFile();
  } catch {
    return false;
  }
}
