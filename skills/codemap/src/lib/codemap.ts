/**
 * Core codemap library: walks a local directory, extracts symbols from
 * source files, and produces a compact Codemap result.
 */

import fs from "node:fs";
import path from "node:path";
import { walk } from "./walker.js";
import { extractSymbols } from "./extractor.js";
import {
  Codemap,
  CodemapOptions,
  CodemapStats,
  FileAnalysis,
  TreeNode,
} from "./types.js";

// ---------------------------------------------------------------------------
// Project name resolution
// ---------------------------------------------------------------------------

function getProjectName(rootDir: string): string {
  const pkgPath = path.join(rootDir, "package.json");
  try {
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { name?: string };
    if (pkg.name) return pkg.name;
  } catch {
    // fall through
  }
  return path.basename(path.resolve(rootDir));
}

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------

function computeStats(
  output: string,
  files: FileAnalysis[]
): CodemapStats {
  const tokenEstimate = Math.ceil(output.length / 4);
  const totalSourceBytes = files.reduce((s, f) => s + f.sizeBytes, 0);
  const rawEstimate = Math.max(1, Math.ceil(totalSourceBytes / 4));
  const savedPercent = Math.max(
    0,
    Math.round((1 - tokenEstimate / rawEstimate) * 100)
  );
  const sourceFileCount = files.filter((f) => f.exports !== undefined).length;
  return {
    tokenEstimate,
    rawEstimate,
    savedPercent,
    fileCount: files.length,
    sourceFileCount,
  };
}

// ---------------------------------------------------------------------------
// Token budget trimming
// ---------------------------------------------------------------------------

function trimToTokenBudget(codemap: Codemap, maxTokens: number): Codemap {
  const estimate = () =>
    Math.ceil(JSON.stringify(codemap).length / 4);

  if (estimate() <= maxTokens) return codemap;

  // Step 1: drop imports lists
  codemap = {
    ...codemap,
    files: codemap.files.map((f) => ({ ...f, imports: undefined })),
  };
  if (estimate() <= maxTokens) return codemap;

  // Step 2: drop signatures, keep only paths + sizeBytes
  codemap = {
    ...codemap,
    files: codemap.files.map((f) => ({
      path: f.path,
      sizeBytes: f.sizeBytes,
      exports: undefined,
      imports: undefined,
    })),
  };
  if (estimate() <= maxTokens) return codemap;

  // Step 3: prune tree to first 100 entries
  codemap = { ...codemap, tree: codemap.tree.slice(0, 100) };

  return codemap;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getCodemap(
  rootDir: string,
  opts: CodemapOptions = {}
): Promise<Codemap> {
  const absRoot = path.resolve(rootDir);

  if (!fs.existsSync(absRoot)) {
    throw new Error(`Directory not found: ${absRoot}`);
  }

  const projectName = getProjectName(absRoot);
  const { files: walkedFiles, dirs: walkedDirs } = walk(absRoot);

  // Build file tree (sorted: dirs first, then files; alphabetically within each)
  const tree: TreeNode[] = [
    ...walkedDirs.sort((a, b) => a.relPath.localeCompare(b.relPath)).map(
      (d): TreeNode => ({ path: d.relPath, type: "dir" })
    ),
    ...walkedFiles.sort((a, b) => a.relPath.localeCompare(b.relPath)).map(
      (f): TreeNode => ({ path: f.relPath, type: "file" })
    ),
  ];

  // Analyse files: extract symbols from source files
  const files: FileAnalysis[] = walkedFiles
    .sort((a, b) => a.relPath.localeCompare(b.relPath))
    .map((wf): FileAnalysis => {
      if (wf.isSource) {
        const { exports, imports } = extractSymbols(wf.absPath);
        return {
          path: wf.relPath,
          sizeBytes: wf.sizeBytes,
          exports,
          imports,
        };
      }
      return {
        path: wf.relPath,
        sizeBytes: wf.sizeBytes,
      };
    });

  // Build preliminary codemap for stats
  const prelim: Codemap = {
    projectName,
    tree,
    files,
    stats: {
      tokenEstimate: 0,
      rawEstimate: 0,
      savedPercent: 0,
      fileCount: 0,
      sourceFileCount: 0,
    },
    generatedAt: new Date().toISOString(),
  };

  const stats = computeStats(JSON.stringify(prelim), files);
  let codemap: Codemap = { ...prelim, stats };

  if (opts.maxTokens) {
    codemap = trimToTokenBudget(codemap, opts.maxTokens);
    // Recompute stats after trimming
    const trimmedStats = computeStats(JSON.stringify(codemap), files);
    codemap = { ...codemap, stats: trimmedStats };
  }

  return codemap;
}
