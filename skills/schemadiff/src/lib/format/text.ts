import { EntityEntry, SchemaDigest } from "../types.js";

function entityBlock(e: EntityEntry): string[] {
  const lines: string[] = [];
  lines.push(`ENTITY: ${e.name}`);

  for (const f of e.fields) {
    const flags: string[] = [];
    if (f.pk) flags.push("PK");
    if (f.unique && !f.pk) flags.push("UNIQUE");
    if (!f.nullable) flags.push("NOT NULL");
    const flagStr = flags.length > 0 ? ` [${flags.join(",")}]` : "";
    const defStr = f.default !== undefined ? ` =${f.default}` : "";
    lines.push(`  ${f.name}: ${f.type}${flagStr}${defStr}`);
  }

  if (e.relations.length > 0) {
    lines.push("  RELATIONS:");
    for (const r of e.relations) {
      const fromF = r.fromFields.length > 0 ? `(${r.fromFields.join(",")})` : "";
      const toF = r.toFields.length > 0 ? `(${r.toFields.join(",")})` : "";
      lines.push(`    ${fromF} -> ${r.to}${toF}`);
    }
  }

  if (e.indexes.length > 0) {
    lines.push("  INDEXES:");
    for (const idx of e.indexes) {
      const u = idx.unique ? "UNIQUE " : "";
      lines.push(`    ${u}(${idx.fields.join(",")})`);
    }
  }

  return lines;
}

export function formatText(digest: SchemaDigest): string {
  const { format, source, entities, relations, stats } = digest;
  const lines: string[] = [];

  lines.push(`SCHEMA: ${source.split("/").pop() ?? source} [${format}]`);
  lines.push(
    `STATS: digest ~${stats.tokenEstimate} tokens | raw ~${stats.rawEstimate} tokens | ${stats.savedPercent}% smaller`
  );
  lines.push(
    `ENTITIES: ${stats.entityCount} | FIELDS: ${stats.fieldCount} | RELATIONS: ${stats.relationCount}`
  );
  lines.push("");

  for (const e of entities) {
    lines.push(...entityBlock(e));
    lines.push("");
  }

  if (relations.length > 0) {
    lines.push("FK GRAPH:");
    for (const r of relations) {
      const fromF = r.fromFields.join(",") || "?";
      const toF = r.toFields.join(",") || "?";
      lines.push(`  ${r.from}.${fromF} -> ${r.to}.${toF}`);
    }
    lines.push("");
  }

  lines.push(`GENERATED: ${digest.generatedAt.slice(0, 19).replace("T", " ")} UTC`);

  return lines.join("\n");
}
