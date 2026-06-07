/**
 * Plain text formatter — minimal, no markdown syntax.
 */

import { Codemap } from "../types.js";

export function formatText(codemap: Codemap): string {
  const { projectName, tree, files, stats } = codemap;
  const lines: string[] = [];

  lines.push(`PROJECT: ${projectName}`);
  lines.push(
    `STATS: digest ~${stats.tokenEstimate} tokens | raw ~${stats.rawEstimate} tokens | ${stats.savedPercent}% smaller`
  );
  lines.push(`FILES: ${stats.fileCount} total, ${stats.sourceFileCount} source`);
  lines.push("");

  if (tree.length > 0) {
    lines.push(`FILE TREE (${tree.length} entries):`);
    for (const node of tree.slice(0, 60)) {
      const prefix = node.type === "dir" ? "D " : "F ";
      lines.push(`  ${prefix}${node.path}`);
    }
    if (tree.length > 60) {
      lines.push(`  ... and ${tree.length - 60} more`);
    }
    lines.push("");
  }

  const sourceFiles = files.filter((f) => f.exports !== undefined && f.exports.length > 0);
  if (sourceFiles.length > 0) {
    lines.push("EXPORTS:");
    for (const file of sourceFiles) {
      lines.push(`  ${file.path}:`);
      for (const sym of file.exports ?? []) {
        lines.push(`    [${sym.kind}] ${sym.signature}`);
      }
      if (file.imports && file.imports.length > 0) {
        lines.push(`    imports: ${file.imports.slice(0, 6).join(", ")}`);
      }
    }
    lines.push("");
  }

  lines.push(`GENERATED: ${codemap.generatedAt.slice(0, 19).replace("T", " ")} UTC`);

  return lines.join("\n");
}
