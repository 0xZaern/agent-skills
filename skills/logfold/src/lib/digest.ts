/**
 * Top-level logfold orchestration: read input → detect language → parse →
 * fold frames → dedupe → format stats → return LogDigest.
 */

import fs from "node:fs";
import { detectLanguage, parseLog } from "./parse.js";
import { foldAll } from "./fold.js";
import { dedupeOccurrences } from "./dedupe.js";
import {
  LogDigest,
  LogFoldOptions,
  LogFoldStats,
} from "./types.js";

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function computeStats(
  output: string,
  rawSize: number,
  totalOccurrences: number,
  uniqueGroups: number,
  language: LogDigest["language"]
): LogFoldStats {
  const tokenEstimate = Math.ceil(output.length / 4);
  const rawEstimate = Math.max(1, Math.ceil(rawSize / 4));
  const savedPercent = Math.max(0, Math.round((1 - tokenEstimate / rawEstimate) * 100));
  return {
    tokenEstimate,
    rawEstimate,
    savedPercent,
    totalOccurrences,
    uniqueGroups,
    language,
  };
}

// ---------------------------------------------------------------------------
// Token budget trimming
// ---------------------------------------------------------------------------

function trimToTokenBudget(digest: LogDigest, maxTokens: number): LogDigest {
  const estimate = () => Math.ceil(JSON.stringify(digest).length / 4);
  if (estimate() <= maxTokens) return digest;

  // First: strip frames from each group's representative
  digest = {
    ...digest,
    groups: digest.groups.map((g) => ({
      ...g,
      representative: { ...g.representative, frames: g.representative.frames.slice(0, 2) },
    })),
  };
  if (estimate() <= maxTokens) return digest;

  // Then: drop all frames
  digest = {
    ...digest,
    groups: digest.groups.map((g) => ({
      ...g,
      representative: { ...g.representative, frames: [] },
    })),
  };
  if (estimate() <= maxTokens) return digest;

  // Then: truncate group list
  const keep = Math.max(1, Math.floor((maxTokens / estimate()) * digest.groups.length));
  digest = { ...digest, groups: digest.groups.slice(0, keep) };

  return digest;
}

// ---------------------------------------------------------------------------
// Stdin detection (mirrors auditsnap pattern)
// ---------------------------------------------------------------------------

function stdinIsPiped(): boolean {
  try {
    const stat = fs.fstatSync(0);
    return stat.isFIFO() || stat.isFile();
  } catch {
    return false;
  }
}

function readStdin(): string {
  return fs.readFileSync("/dev/stdin", "utf8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getLogDigest(
  source: string | null,
  opts: LogFoldOptions = {}
): Promise<LogDigest> {
  let raw: string;

  if (source === null || source === "-") {
    if (!stdinIsPiped()) {
      throw new Error(
        'No input provided. Pass a file path or pipe log text via stdin. Example: cat app.log | logfold'
      );
    }
    raw = readStdin();
  } else {
    if (!fs.existsSync(source)) {
      throw new Error(`File not found: ${source}`);
    }
    raw = fs.readFileSync(source, "utf8");
  }

  const rawSize = raw.length;
  const language = detectLanguage(raw);

  const rawOccurrences = parseLog(raw, language);
  const totalOccurrences = rawOccurrences.length;

  const folded = foldAll(rawOccurrences, language);
  let groups = dedupeOccurrences(folded);

  // Apply --top N
  if (opts.top !== undefined && opts.top > 0) {
    groups = groups.slice(0, opts.top);
  }

  const prelim: LogDigest = {
    language,
    groups,
    stats: {
      tokenEstimate: 0,
      rawEstimate: 0,
      savedPercent: 0,
      totalOccurrences,
      uniqueGroups: groups.length,
      language,
    },
    generatedAt: new Date().toISOString(),
  };

  const stats = computeStats(
    JSON.stringify(prelim),
    rawSize,
    totalOccurrences,
    groups.length,
    language
  );

  let digest: LogDigest = { ...prelim, stats };

  if (opts.maxTokens) {
    digest = trimToTokenBudget(digest, opts.maxTokens);
    const trimmedStats = computeStats(
      JSON.stringify(digest),
      rawSize,
      totalOccurrences,
      digest.groups.length,
      language
    );
    digest = { ...digest, stats: trimmedStats };
  }

  return digest;
}
