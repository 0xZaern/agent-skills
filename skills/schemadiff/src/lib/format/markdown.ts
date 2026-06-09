import { EntityEntry, FieldEntry, RelationEntry, SchemaDigest } from "../types.js";

function fieldLine(f: FieldEntry): string {
  const flags: string[] = [];
  if (f.pk) flags.push("PK");
  if (f.unique && !f.pk) flags.push("UNIQUE");
  if (!f.nullable) flags.push("NOT NULL");
  const flagStr = flags.length > 0 ? ` _(${flags.join(", ")})_` : "";
  const defStr = f.default !== undefined ? ` \`=${f.default}\`` : "";
  return `  - **${f.name}**: \`${f.type}\`${flagStr}${defStr}`;
}

function entitySection(e: EntityEntry): string[] {
  const lines: string[] = [];
  lines.push(`### ${e.name}`);
  lines.push("");

  if (e.fields.length > 0) {
    lines.push("**Fields**");
    lines.push("");
    for (const f of e.fields) lines.push(fieldLine(f));
    lines.push("");
  }

  if (e.relations.length > 0) {
    lines.push("**Relations**");
    lines.push("");
    for (const r of e.relations) {
      const fromStr = r.fromFields.length > 0 ? `(${r.fromFields.join(", ")})` : "";
      const toStr = r.toFields.length > 0 ? `(${r.toFields.join(", ")})` : "";
      const nameStr = r.name ? ` _${r.name}_` : "";
      lines.push(`  - ${fromStr} → **${r.to}**${toStr}${nameStr}`);
    }
    lines.push("");
  }

  if (e.indexes.length > 0) {
    lines.push("**Indexes**");
    lines.push("");
    for (const idx of e.indexes) {
      const u = idx.unique ? "UNIQUE " : "";
      const n = idx.name ? `${idx.name}: ` : "";
      lines.push(`  - ${u}${n}(${idx.fields.join(", ")})`);
    }
    lines.push("");
  }

  return lines;
}

function relationsTable(relations: RelationEntry[]): string[] {
  if (relations.length === 0) return [];
  const lines: string[] = [];
  lines.push("## Relations");
  lines.push("");
  lines.push("| From | Fields | To | Ref Fields |");
  lines.push("|------|--------|----|------------|");
  for (const r of relations) {
    const fromF = r.fromFields.join(", ") || "—";
    const toF = r.toFields.join(", ") || "—";
    lines.push(`| **${r.from}** | ${fromF} | **${r.to}** | ${toF} |`);
  }
  lines.push("");
  return lines;
}

export function formatMarkdown(digest: SchemaDigest): string {
  const { format, source, entities, relations, stats } = digest;
  const lines: string[] = [];

  lines.push(`# schemadiff: ${source.split("/").pop() ?? source}`);
  lines.push("");
  lines.push(
    `> digest ~${stats.tokenEstimate.toLocaleString()} tokens · raw ~${stats.rawEstimate.toLocaleString()} tokens · **${stats.savedPercent}% smaller**`
  );
  lines.push(
    `> ${stats.entityCount} entities · ${stats.fieldCount} fields · ${stats.relationCount} relations · format: \`${format}\``
  );
  lines.push("");

  if (entities.length > 0) {
    lines.push("## Entities");
    lines.push("");
    for (const e of entities) {
      lines.push(...entitySection(e));
    }
  }

  lines.push(...relationsTable(relations));

  lines.push("---");
  lines.push(`_generated ${digest.generatedAt.slice(0, 19).replace("T", " ")} UTC_`);

  return lines.join("\n");
}
