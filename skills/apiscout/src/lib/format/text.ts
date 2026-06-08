import { ApiDigest } from "../types.js";

export function formatText(digest: ApiDigest): string {
  const { info, servers, auth, endpoints, schemas, stats } = digest;
  const lines: string[] = [];

  lines.push(`API: ${info.title} v${info.version}`);
  lines.push(
    `STATS: digest ~${stats.tokenEstimate} tokens | raw ~${stats.rawEstimate} tokens | ${stats.savedPercent}% smaller`
  );
  lines.push(`ENDPOINTS: ${stats.endpointCount} | TAGS: ${stats.tagCount}`);
  lines.push("");

  if (servers.length > 0) {
    lines.push("SERVERS:");
    for (const s of servers) lines.push(`  ${s.url}`);
    lines.push("");
  }

  if (auth.length > 0) {
    lines.push("AUTH:");
    for (const a of auth) {
      const detail = [a.type, a.scheme, a.in ? `in:${a.in}` : undefined]
        .filter(Boolean)
        .join(", ");
      lines.push(`  ${a.name} (${detail})`);
    }
    lines.push("");
  }

  if (endpoints.length > 0) {
    lines.push("ENDPOINTS:");
    for (const e of endpoints) {
      const dep = e.deprecated ? " [deprecated]" : "";
      const summary = e.summary ? ` — ${e.summary}` : "";
      lines.push(`  ${e.method} ${e.path}${dep}${summary}`);
      const req = e.params.filter((p) => p.required);
      if (req.length > 0) {
        lines.push(`    required: ${req.map((p) => p.name).join(", ")}`);
      }
    }
    lines.push("");
  }

  if (schemas.length > 0) {
    lines.push(`SCHEMAS (${schemas.length}):`);
    for (const s of schemas) {
      if (s.fields.length > 0) {
        lines.push(`  ${s.name}: ${s.fields.join(", ")}`);
      } else {
        lines.push(`  ${s.name}`);
      }
    }
    lines.push("");
  }

  lines.push(`GENERATED: ${digest.generatedAt.slice(0, 19).replace("T", " ")} UTC`);

  return lines.join("\n");
}
