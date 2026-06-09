/**
 * Core scanner for secretscan.
 *
 * Scans a list of files line by line against the detection rules.
 * Binary files are skipped. High-entropy scan is opt-in.
 */

import fs from "node:fs";
import path from "node:path";
import { RULES, ENV_FILE_PATTERN } from "./rules.js";
import { maskSecret } from "./mask.js";
import { findHighEntropyTokens } from "./entropy.js";
import { Finding, SecretKind } from "./types.js";

/** Maximum file size to scan (1 MB). Larger files are skipped. */
const MAX_FILE_BYTES = 1_048_576;

/** Binary-like file extensions to skip entirely. */
const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".mp3", ".mp4", ".avi", ".mov", ".mkv", ".wav",
  ".db", ".sqlite", ".sqlite3",
  ".lock",
]);

/** Comment-only lines are noisy, skip them. */
function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("#") || t.startsWith("*") || t.startsWith("/*");
}

function shouldSkipFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return true;

  // Skip binary files by peeking at the first 512 bytes for null bytes
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return true;
    if (stat.size > MAX_FILE_BYTES) return true;
    if (stat.size === 0) return true;
    const buf = Buffer.alloc(512);
    const fd = fs.openSync(filePath, "r");
    const read = fs.readSync(fd, buf, 0, Math.min(512, stat.size), 0);
    fs.closeSync(fd);
    for (let i = 0; i < read; i++) {
      if (buf[i] === 0) return true; // null byte = binary
    }
  } catch {
    return true;
  }

  return false;
}

export interface ScanFileOptions {
  entropy?: boolean;
  entropyThreshold?: number;
}

/**
 * Scans a single file for secrets.
 * Returns all findings (masked). Never throws — returns empty array on error.
 */
export function scanFile(
  filePath: string,
  opts: ScanFileOptions = {}
): Finding[] {
  const findings: Finding[] = [];

  // Detect .env file staged for commit (file-level check)
  const basename = path.basename(filePath);
  if (ENV_FILE_PATTERN.test(basename)) {
    findings.push({
      file: filePath,
      line: 0,
      kind: "env_file_staged",
      severity: "high",
      label: ".env File Staged for Commit",
      masked: basename,
    });
    // Still scan the .env file contents for actual secrets
  }

  if (shouldSkipFile(filePath)) return findings;

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return findings;
  }

  const lines = content.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Skip blank and pure-comment lines for named rules
    if (!line.trim() || isCommentLine(line)) {
      if (opts.entropy) {
        // Entropy still checks non-blank lines
      } else {
        continue;
      }
    }

    // Apply named rules
    for (const rule of RULES) {
      const match = rule.pattern.exec(line);
      if (match && match[1]) {
        const raw = match[1];
        findings.push({
          file: filePath,
          line: lineNum,
          kind: rule.kind,
          severity: rule.severity,
          label: rule.label,
          masked: maskSecret(raw),
        });
      }
    }

    // Shannon entropy scan (opt-in)
    if (opts.entropy && line.trim() && !isCommentLine(line)) {
      const hits = findHighEntropyTokens(line, opts.entropyThreshold);
      for (const hit of hits) {
        // Avoid double-reporting tokens already caught by named rules
        const alreadyCaught = findings.some(
          (f) => f.line === lineNum && maskSecret(hit.token) === f.masked
        );
        if (!alreadyCaught) {
          findings.push({
            file: filePath,
            line: lineNum,
            kind: "high_entropy_string" as SecretKind,
            severity: "medium",
            label: `High-Entropy String (${hit.entropy.toFixed(2)} bits/char)`,
            masked: maskSecret(hit.token),
          });
        }
      }
    }
  }

  return findings;
}
