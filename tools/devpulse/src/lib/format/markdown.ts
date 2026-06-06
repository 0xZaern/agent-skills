/**
 * Markdown formatter — clean human-readable output.
 */

import { RepoDigest } from "../types.js";

export function formatMarkdown(digest: RepoDigest): string {
  const { metadata, languages, fileTree, readme, keyFiles, recentActivity, stats } = digest;

  const lines: string[] = [];

  // Header
  lines.push(`# ${metadata.fullName}`);
  lines.push("");
  if (metadata.description) {
    lines.push(`> ${metadata.description}`);
    lines.push("");
  }

  // Meta row
  const metaItems: string[] = [
    `**Stars** ${metadata.stars.toLocaleString()}`,
    `**Forks** ${metadata.forks.toLocaleString()}`,
    `**Open issues** ${metadata.openIssues}`,
  ];
  if (metadata.primaryLanguage) metaItems.push(`**Language** ${metadata.primaryLanguage}`);
  if (metadata.license) metaItems.push(`**License** ${metadata.license}`);
  lines.push(metaItems.join(" · "));
  lines.push("");

  if (metadata.topics.length > 0) {
    lines.push(`**Topics:** ${metadata.topics.join(", ")}`);
    lines.push("");
  }

  lines.push(`**Last push:** ${metadata.lastPush.slice(0, 10)}`);
  lines.push("");

  // Language breakdown
  if (languages.length > 0) {
    lines.push("## Languages");
    lines.push("");
    for (const lang of languages.slice(0, 8)) {
      const pct = (lang.share * 100).toFixed(1);
      lines.push(`- **${lang.name}** ${pct}%`);
    }
    lines.push("");
  }

  // README excerpt
  if (readme.excerpt) {
    lines.push("## README (excerpt)");
    lines.push("");
    lines.push(readme.excerpt);
    lines.push("");
  }

  // Key files
  if (keyFiles.length > 0) {
    lines.push("## Key Files");
    lines.push("");
    for (const kf of keyFiles) {
      lines.push(`- \`${kf.path}\` — ${kf.summary}`);
    }
    lines.push("");
  }

  // File tree (first 50 entries for readability)
  if (fileTree.length > 0) {
    lines.push("## File Tree");
    lines.push("");
    lines.push("```");
    const shown = fileTree.slice(0, 50);
    for (const entry of shown) {
      const prefix = entry.type === "tree" ? "d " : "  ";
      lines.push(`${prefix}${entry.path}`);
    }
    if (fileTree.length > 50) {
      lines.push(`... and ${fileTree.length - 50} more entries`);
    }
    lines.push("```");
    lines.push("");
  }

  // Recent activity
  if (recentActivity.length > 0) {
    lines.push("## Recent Commits");
    lines.push("");
    for (const commit of recentActivity) {
      const date = commit.date.slice(0, 10);
      lines.push(`- \`${commit.sha}\` ${date} **${commit.author}** — ${commit.message}`);
    }
    lines.push("");
  }

  // Stats footer
  lines.push("---");
  lines.push(
    `_digest ~${stats.tokenEstimate.toLocaleString()} tokens · raw would be ~${stats.rawEstimate.toLocaleString()} tokens · **${stats.savedPercent}% smaller**_`
  );
  lines.push(
    `_generated ${digest.generatedAt.slice(0, 19).replace("T", " ")} UTC${digest.cached ? " (cached)" : ""}_`
  );

  return lines.join("\n");
}
