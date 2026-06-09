/**
 * Orchestrates the full secretscan: resolves files, scans each one,
 * and assembles the SecretScanDigest.
 */

import { SecretScanDigest, SecretScanOptions } from "./types.js";
import { isGitRepo, getStagedFiles, getTrackedFiles, getAllFiles } from "./git.js";
import { scanFile } from "./scanner.js";

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

function sortFindings(digest: SecretScanDigest): SecretScanDigest {
  return {
    ...digest,
    findings: [...digest.findings].sort((a, b) => {
      const si = SEVERITY_ORDER.indexOf(a.severity as typeof SEVERITY_ORDER[number]);
      const sj = SEVERITY_ORDER.indexOf(b.severity as typeof SEVERITY_ORDER[number]);
      if (si !== sj) return si - sj;
      if (a.file !== b.file) return a.file.localeCompare(b.file);
      return a.line - b.line;
    }),
  };
}

export async function getSecretScanDigest(
  opts: SecretScanOptions = {}
): Promise<SecretScanDigest> {
  const dir = opts.dir ?? ".";
  const source = opts.source ?? "staged";

  if (!isGitRepo(dir)) {
    throw new Error(
      `"${dir}" is not inside a git repository. secretscan requires a git repo.`
    );
  }

  let files: string[];
  switch (source) {
    case "tracked":
      files = getTrackedFiles(dir);
      break;
    case "all":
      files = getAllFiles(dir);
      break;
    default:
      files = getStagedFiles(dir);
  }

  const scanOpts = {
    entropy: opts.entropy ?? false,
    entropyThreshold: opts.entropyThreshold,
  };

  const allFindings = files.flatMap((f) => scanFile(f, scanOpts));

  const raw: SecretScanDigest = {
    clean: allFindings.length === 0,
    findings: allFindings,
    stats: {
      filesScanned: files.length,
      findingsCount: allFindings.length,
      source,
      scannedAt: new Date().toISOString(),
    },
  };

  return sortFindings(raw);
}
