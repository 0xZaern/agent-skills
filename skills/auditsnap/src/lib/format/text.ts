import { AuditDigest } from "../types.js";

export function formatText(digest: AuditDigest): string {
  const { counts, vulnerabilities, fixable, unfixable, stats } = digest;
  const lines: string[] = [];

  lines.push(`AUDITSNAP`);
  lines.push(
    `STATS: digest ~${stats.tokenEstimate} tokens | raw ~${stats.rawEstimate} tokens | ${stats.savedPercent}% smaller`
  );
  lines.push(
    `TOTALS: ${counts.total} total | ${counts.critical} critical | ${counts.high} high | ${counts.moderate} moderate | ${counts.low} low`
  );
  lines.push(`FIXABLE: ${fixable} | UNFIXABLE: ${unfixable}`);
  lines.push("");

  if (vulnerabilities.length === 0) {
    lines.push("no vulnerabilities found");
  } else {
    lines.push(`VULNERABILITIES (${vulnerabilities.length}):`);
    for (const v of vulnerabilities) {
      const fix = v.fixAvailable ? " [fixable]" : "";
      const title = v.title ? ` — ${v.title}` : "";
      lines.push(`  [${v.severity.toUpperCase()}] ${v.name}${fix}${title}`);
      if (v.range) lines.push(`    range: ${v.range}`);
      if (v.via.length > 0) lines.push(`    via: ${v.via.join(", ")}`);
    }
  }

  lines.push("");
  lines.push(`GENERATED: ${digest.generatedAt.slice(0, 19).replace("T", " ")} UTC`);

  return lines.join("\n");
}
