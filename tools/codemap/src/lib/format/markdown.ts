/**
 * Markdown formatter — clean human-readable output.
 */

import { Codemap } from "../types.js";

export function formatMarkdown(codemap: Codemap): string {
  const { projectName, tree, files, stats } = codemap;
  const lines: string[] = [];

  lines.push(`# codemap: ${projectName}`);
  lines.push("");

  // Stats header
  lines.push(
    `> digest ~${stats.tokenEstimate.toLocaleString()} tokens · raw would be ~${stats.rawEstimate.toLocaleString()} tokens · **${stats.savedPercent}% smaller**`
  );
  lines.push(
    `> ${stats.fileCount} files analysed · ${stats.sourceFileCount} source files`
  );
  lines.push("");

  // File tree
  if (tree.length > 0) {
    lines.push("## File Tree");
    lines.push("");
    lines.push("```");
    const shown = tree.slice(0, 80);
    for (const node of shown) {
      const prefix = node.type === "dir" ? "d " : "  ";
      lines.push(`${prefix}${node.path}`);
    }
    if (tree.length > 80) {
      lines.push(`... and ${tree.length - 80} more entries`);
    }
    lines.push("```");
    lines.push("");
  }

  // Source file analyses
  const sourceFiles = files.filter((f) => f.exports !== undefined);
  if (sourceFiles.length > 0) {
    lines.push("## Exports by File");
    lines.push("");

    for (const file of sourceFiles) {
      if (!file.exports || file.exports.length === 0) continue;
      lines.push(`### \`${file.path}\``);
      lines.push("");

      for (const sym of file.exports) {
        lines.push(`- **${sym.kind}** \`${sym.signature}\``);
      }

      if (file.imports && file.imports.length > 0) {
        const importList = file.imports.slice(0, 8).join(", ");
        const more = file.imports.length > 8 ? ` +${file.imports.length - 8} more` : "";
        lines.push(`  - _imports: ${importList}${more}_`);
      }
      lines.push("");
    }
  }

  // Other files
  const otherFiles = files.filter((f) => f.exports === undefined);
  if (otherFiles.length > 0) {
    lines.push("## Other Files");
    lines.push("");
    for (const f of otherFiles) {
      const kb = (f.sizeBytes / 1024).toFixed(1);
      lines.push(`- \`${f.path}\` (${kb} KB)`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(
    `_generated ${codemap.generatedAt.slice(0, 19).replace("T", " ")} UTC_`
  );

  return lines.join("\n");
}
