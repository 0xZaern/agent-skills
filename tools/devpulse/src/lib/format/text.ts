/**
 * Plain text formatter — minimal, no markdown syntax.
 */

import { RepoDigest } from "../types.js";

export function formatText(digest: RepoDigest): string {
  const { metadata, languages, fileTree, readme, keyFiles, recentActivity, stats } = digest;

  const lines: string[] = [];

  lines.push(`REPO: ${metadata.fullName}`);
  if (metadata.description) lines.push(`DESC: ${metadata.description}`);
  lines.push(`STARS: ${metadata.stars}  FORKS: ${metadata.forks}  ISSUES: ${metadata.openIssues}`);
  if (metadata.primaryLanguage) lines.push(`LANG: ${metadata.primaryLanguage}`);
  if (metadata.license) lines.push(`LICENSE: ${metadata.license}`);
  if (metadata.topics.length > 0) lines.push(`TOPICS: ${metadata.topics.join(", ")}`);
  lines.push(`LAST PUSH: ${metadata.lastPush.slice(0, 10)}`);

  if (languages.length > 0) {
    lines.push("");
    lines.push("LANGUAGES:");
    for (const l of languages.slice(0, 8)) {
      lines.push(`  ${l.name}: ${(l.share * 100).toFixed(1)}%`);
    }
  }

  if (readme.excerpt) {
    lines.push("");
    lines.push("README EXCERPT:");
    lines.push(readme.excerpt);
  }

  if (keyFiles.length > 0) {
    lines.push("");
    lines.push("KEY FILES:");
    for (const kf of keyFiles) {
      lines.push(`  ${kf.path}: ${kf.summary}`);
    }
  }

  if (fileTree.length > 0) {
    lines.push("");
    lines.push(`FILE TREE (${fileTree.length} entries):`);
    for (const entry of fileTree.slice(0, 40)) {
      lines.push(`  ${entry.type === "tree" ? "D" : "F"} ${entry.path}`);
    }
    if (fileTree.length > 40) {
      lines.push(`  ... and ${fileTree.length - 40} more`);
    }
  }

  if (recentActivity.length > 0) {
    lines.push("");
    lines.push("RECENT COMMITS:");
    for (const c of recentActivity) {
      lines.push(`  ${c.sha} ${c.date.slice(0, 10)} ${c.author}: ${c.message}`);
    }
  }

  lines.push("");
  lines.push(
    `STATS: digest ~${stats.tokenEstimate} tokens | raw ~${stats.rawEstimate} tokens | ${stats.savedPercent}% smaller`
  );
  lines.push(`GENERATED: ${digest.generatedAt.slice(0, 19).replace("T", " ")} UTC${digest.cached ? " (cached)" : ""}`);

  return lines.join("\n");
}
