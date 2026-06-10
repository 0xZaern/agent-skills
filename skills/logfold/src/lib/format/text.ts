import { ErrorGroup, LogDigest } from "../types.js";

function groupBlock(g: ErrorGroup, idx: number): string[] {
  const lines: string[] = [];
  const rep = g.representative;
  lines.push(
    `[${idx + 1}] ${rep.errorType} x${g.count} | sig: ${g.signature}`
  );
  lines.push(`    msg: ${rep.message || "(none)"}`);

  if (g.firstSeen) {
    const lastStr =
      g.lastSeen && g.lastSeen !== g.firstSeen ? ` → ${g.lastSeen}` : "";
    lines.push(`    when: ${g.firstSeen}${lastStr}`);
  }

  for (const f of rep.frames) {
    lines.push(`    at ${f.location ?? f.raw}`);
  }

  if (rep.foldedFrameCount > 0) {
    lines.push(`    ... ${rep.foldedFrameCount} noise frames folded`);
  }

  return lines;
}

export function formatText(digest: LogDigest): string {
  const { language, groups, stats } = digest;
  const lines: string[] = [];

  lines.push(`LOGFOLD [${language}]`);
  lines.push(
    `STATS: digest ~${stats.tokenEstimate} tokens | raw ~${stats.rawEstimate} tokens | ${stats.savedPercent}% smaller`
  );
  lines.push(
    `OCCURRENCES: ${stats.totalOccurrences} raw -> ${stats.uniqueGroups} groups`
  );
  lines.push("");

  if (groups.length === 0) {
    lines.push("No errors found.");
  } else {
    for (let i = 0; i < groups.length; i++) {
      lines.push(...groupBlock(groups[i]!, i));
      lines.push("");
    }
  }

  lines.push(`GENERATED: ${digest.generatedAt.slice(0, 19).replace("T", " ")} UTC`);

  return lines.join("\n");
}
