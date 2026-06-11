import { ErrorGroup, LogDigest } from "../types.js";

function groupSection(g: ErrorGroup, idx: number): string[] {
  const lines: string[] = [];
  const rep = g.representative;
  const countStr = g.count > 1 ? ` _(×${g.count})_` : "";
  lines.push(`### ${idx + 1}. \`${rep.errorType}\`${countStr}`);
  lines.push("");
  lines.push(`**Message:** ${rep.message || "(none)"}`);

  if (g.firstSeen || g.lastSeen) {
    const ts: string[] = [];
    if (g.firstSeen) ts.push(`first: ${g.firstSeen}`);
    if (g.lastSeen && g.lastSeen !== g.firstSeen) ts.push(`last: ${g.lastSeen}`);
    lines.push(`**When:** ${ts.join(" · ")}`);
  }

  lines.push(`**Signature:** \`${g.signature}\``);

  if (rep.frames.length > 0) {
    lines.push("");
    lines.push("**App frames:**");
    lines.push("");
    for (const f of rep.frames) {
      const loc = f.location ? ` — \`${f.location}\`` : "";
      lines.push(`- ${f.raw}${loc}`);
    }
  }

  if (rep.foldedFrameCount > 0) {
    lines.push(
      `> _${rep.foldedFrameCount} noise frame(s) from node_modules/stdlib folded_`
    );
  }

  lines.push("");
  return lines;
}

export function formatMarkdown(digest: LogDigest): string {
  const { language, groups, stats } = digest;
  const lines: string[] = [];

  lines.push("# logfold");
  lines.push("");
  lines.push(
    `> digest ~${stats.tokenEstimate.toLocaleString()} tokens · raw ~${stats.rawEstimate.toLocaleString()} tokens · **${stats.savedPercent}% smaller**`
  );
  lines.push(
    `> ${stats.totalOccurrences} occurrences → ${stats.uniqueGroups} unique groups · language: \`${language}\``
  );
  lines.push("");

  if (groups.length === 0) {
    lines.push("_No errors found in the log._");
    lines.push("");
  } else {
    lines.push("## Error Groups (most frequent first)");
    lines.push("");
    for (let i = 0; i < groups.length; i++) {
      lines.push(...groupSection(groups[i]!, i));
    }
  }

  lines.push("---");
  lines.push(`_generated ${digest.generatedAt.slice(0, 19).replace("T", " ")} UTC_`);

  return lines.join("\n");
}
