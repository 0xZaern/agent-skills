import { AuditDigest, Severity, VulnEntry } from "../types.js";

const SEV_LABEL: Record<Severity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  moderate: "MODERATE",
  low: "LOW",
  info: "INFO",
};

function vulnLine(v: VulnEntry): string {
  const parts: string[] = [`**${v.name}**`, SEV_LABEL[v.severity]];
  if (v.title) parts.push(`— ${v.title}`);
  if (v.range) parts.push(`(\`${v.range}\`)`);
  return parts.join(" ");
}

export function formatMarkdown(digest: AuditDigest): string {
  const { counts, vulnerabilities, fixable, unfixable, stats } = digest;
  const lines: string[] = [];

  lines.push("# auditsnap");
  lines.push("");
  lines.push(
    `> digest ~${stats.tokenEstimate.toLocaleString()} tokens · raw ~${stats.rawEstimate.toLocaleString()} tokens · **${stats.savedPercent}% smaller**`
  );
  lines.push(`> ${stats.totalAdvisories} advisories · ${fixable} fixable · ${unfixable} unfixable`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  const countParts: string[] = [];
  if (counts.critical > 0) countParts.push(`${counts.critical} critical`);
  if (counts.high > 0) countParts.push(`${counts.high} high`);
  if (counts.moderate > 0) countParts.push(`${counts.moderate} moderate`);
  if (counts.low > 0) countParts.push(`${counts.low} low`);
  if (counts.info > 0) countParts.push(`${counts.info} info`);
  lines.push(countParts.length > 0 ? countParts.join(", ") : "no vulnerabilities found");
  lines.push("");

  if (vulnerabilities.length > 0) {
    lines.push("## Vulnerabilities");
    lines.push("");

    for (const v of vulnerabilities) {
      lines.push(`- ${vulnLine(v)}`);
      const meta: string[] = [v.kind];
      if (v.fixAvailable) meta.push("fix available");
      if (v.via.length > 0) meta.push(`via: ${v.via.join(", ")}`);
      lines.push(`  - ${meta.join(" · ")}`);
    }
    lines.push("");
  }

  if (fixable > 0) {
    lines.push(`_${fixable} of ${counts.total} can be addressed with \`npm audit fix\`_`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`_generated ${digest.generatedAt.slice(0, 19).replace("T", " ")} UTC_`);

  return lines.join("\n");
}
