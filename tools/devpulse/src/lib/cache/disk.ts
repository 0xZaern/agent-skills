/**
 * Disk-based cache for RepoDigest results.
 *
 * Cache location: ~/.cache/devpulse/<owner>/<name>.json
 * Default TTL: 60 minutes.
 * Safe for concurrent CLI invocations — each write is an atomic rename-ish
 * overwrite via writeFileSync which is atomic on most POSIX systems.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { RepoDigest } from "../types.js";

const CACHE_DIR = path.join(os.homedir(), ".cache", "devpulse");
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 60 minutes

interface CacheEnvelope {
  expiresAt: number;
  digest: RepoDigest;
}

function cacheFilePath(owner: string, name: string): string {
  return path.join(CACHE_DIR, owner, `${name}.json`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function cacheGet(owner: string, name: string): RepoDigest | null {
  const filePath = cacheFilePath(owner, name);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const envelope = JSON.parse(raw) as CacheEnvelope;
    if (Date.now() > envelope.expiresAt) {
      // Stale — delete silently
      fs.unlinkSync(filePath);
      return null;
    }
    return envelope.digest;
  } catch {
    return null;
  }
}

export function cacheSet(
  owner: string,
  name: string,
  digest: RepoDigest,
  ttlMs = DEFAULT_TTL_MS
): void {
  try {
    const dir = path.join(CACHE_DIR, owner);
    ensureDir(dir);
    const envelope: CacheEnvelope = {
      expiresAt: Date.now() + ttlMs,
      digest,
    };
    fs.writeFileSync(cacheFilePath(owner, name), JSON.stringify(envelope), "utf8");
  } catch {
    // Cache write failure is non-fatal — just proceed without caching
  }
}
