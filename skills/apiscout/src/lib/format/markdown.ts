import { ApiDigest, EndpointEntry } from "../types.js";

function methodBadge(method: string): string {
  return `**${method}**`;
}

function endpointLine(e: EndpointEntry): string {
  const parts: string[] = [`${methodBadge(e.method)} \`${e.path}\``];
  if (e.summary) parts.push(`— ${e.summary}`);
  if (e.deprecated) parts.push("_(deprecated)_");
  return parts.join(" ");
}

export function formatMarkdown(digest: ApiDigest): string {
  const { info, servers, auth, tags, endpoints, schemas, stats } = digest;
  const lines: string[] = [];

  lines.push(`# apiscout: ${info.title}`);
  lines.push("");
  lines.push(
    `> digest ~${stats.tokenEstimate.toLocaleString()} tokens · raw ~${stats.rawEstimate.toLocaleString()} tokens · **${stats.savedPercent}% smaller**`
  );
  lines.push(`> ${stats.endpointCount} endpoints · ${stats.tagCount} tags`);
  lines.push("");

  lines.push("## Info");
  lines.push("");
  lines.push(`- **version:** ${info.version}`);
  if (info.description) lines.push(`- **description:** ${info.description}`);
  lines.push("");

  if (servers.length > 0) {
    lines.push("## Servers");
    lines.push("");
    for (const s of servers) {
      const desc = s.description ? ` — ${s.description}` : "";
      lines.push(`- \`${s.url}\`${desc}`);
    }
    lines.push("");
  }

  if (auth.length > 0) {
    lines.push("## Auth");
    lines.push("");
    for (const a of auth) {
      const parts = [a.name, a.type];
      if (a.scheme) parts.push(a.scheme);
      if (a.in) parts.push(`in:${a.in}`);
      lines.push(`- ${parts.join(" / ")}`);
    }
    lines.push("");
  }

  // group endpoints by tag
  const tagged = new Map<string, EndpointEntry[]>();
  const untagged: EndpointEntry[] = [];
  for (const e of endpoints) {
    if (e.tags.length === 0) {
      untagged.push(e);
    } else {
      const tag = e.tags[0];
      if (!tagged.has(tag)) tagged.set(tag, []);
      tagged.get(tag)!.push(e);
    }
  }

  if (tags.length > 0) {
    lines.push("## Endpoints");
    lines.push("");
    for (const tag of tags) {
      const group = tagged.get(tag);
      if (!group || group.length === 0) continue;
      lines.push(`### ${tag}`);
      lines.push("");
      for (const e of group) {
        lines.push(`- ${endpointLine(e)}`);
        const required = e.params.filter((p) => p.required);
        if (required.length > 0) {
          const pStr = required.map((p) => `${p.name}:${p.type ?? p.in}`).join(", ");
          lines.push(`  - params: ${pStr}`);
        }
        if (e.responseCodes.length > 0) {
          lines.push(`  - responses: ${e.responseCodes.join(", ")}`);
        }
      }
      lines.push("");
    }
    if (untagged.length > 0) {
      lines.push("### (untagged)");
      lines.push("");
      for (const e of untagged) {
        lines.push(`- ${endpointLine(e)}`);
      }
      lines.push("");
    }
  }

  if (schemas.length > 0) {
    lines.push("## Schemas");
    lines.push("");
    for (const s of schemas) {
      if (s.fields.length > 0) {
        lines.push(`- **${s.name}**: ${s.fields.join(", ")}`);
      } else {
        lines.push(`- **${s.name}**`);
      }
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`_generated ${digest.generatedAt.slice(0, 19).replace("T", " ")} UTC_`);

  return lines.join("\n");
}
