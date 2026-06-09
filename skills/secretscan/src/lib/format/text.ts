import { SecretScanDigest } from "../types.js";

export function formatText(digest: SecretScanDigest): string {
  const { clean, findings, stats } = digest;
  const lines: string[] = [];

  lines.push("SECRETSCAN");
  lines.push(
    `SOURCE: ${stats.source} | FILES: ${stats.filesScanned} | FINDINGS: ${stats.findingsCount}`
  );
  lines.push("");

  if (clean) {
    lines.push("no secrets found — safe to commit.");
  } else {
    lines.push(`FINDINGS (${findings.length}):`);
    for (const f of findings) {
      const loc = f.line > 0 ? `:${f.line}` : "";
      lines.push(`  [${f.severity.toUpperCase()}] ${f.file}${loc}`);
      lines.push(`    ${f.label}: ${f.masked}`);
    }
  }

  lines.push("");
  lines.push(`SCANNED: ${stats.scannedAt.slice(0, 19).replace("T", " ")} UTC`);

  return lines.join("\n");
}
