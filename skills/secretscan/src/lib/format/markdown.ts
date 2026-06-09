import { Finding, SecretScanDigest, Severity } from "../types.js";

const SEV_LABEL: Record<Severity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

function findingLine(f: Finding): string {
  const loc = f.line > 0 ? `:${f.line}` : "";
  return `**${f.file}${loc}** — ${f.label} \`${f.masked}\` [${SEV_LABEL[f.severity]}]`;
}

export function formatMarkdown(digest: SecretScanDigest): string {
  const { clean, findings, stats } = digest;
  const lines: string[] = [];

  lines.push("# secretscan");
  lines.push("");
  lines.push(
    `> source: \`${stats.source}\` · files scanned: ${stats.filesScanned} · findings: **${stats.findingsCount}**`
  );
  lines.push("");

  if (clean) {
    lines.push("**no secrets found — safe to commit.**");
  } else {
    lines.push("## Findings");
    lines.push("");

    let lastSeverity: Severity | null = null;
    for (const f of findings) {
      if (f.severity !== lastSeverity) {
        if (lastSeverity !== null) lines.push("");
        lines.push(`### ${SEV_LABEL[f.severity]}`);
        lines.push("");
        lastSeverity = f.severity;
      }
      lines.push(`- ${findingLine(f)}`);
    }
    lines.push("");
    lines.push(
      `> **Action required:** remove or rotate the exposed secrets before committing.`
    );
  }

  lines.push("");
  lines.push("---");
  lines.push(`_scanned ${stats.scannedAt.slice(0, 19).replace("T", " ")} UTC_`);

  return lines.join("\n");
}
