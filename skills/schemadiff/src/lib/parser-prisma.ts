/**
 * Prisma schema parser.
 *
 * Parses `.prisma` SDL files: model blocks, field definitions, @id, @unique,
 * @default, @relation, @@index, @@unique directives. Does not require the
 * @prisma/internals package — implements a real line-oriented state-machine
 * parser that handles the common Prisma SDL grammar correctly.
 */

import { EntityEntry, FieldEntry, IndexEntry, RelationEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip a single-line comment from the end of a line. */
function stripComment(line: string): string {
  const idx = line.indexOf("//");
  return idx === -1 ? line : line.slice(0, idx);
}

/** Extract attribute arguments: given `@default(now())` returns `now()`. Handles nested parens. */
function attrArgs(text: string, attr: string): string | undefined {
  const prefix = `@${attr}(`;
  const start = text.indexOf(prefix);
  if (start === -1) return undefined;

  let depth = 0;
  let argStart = start + prefix.length;
  let i = start + prefix.length - 1; // points at the opening '('
  for (; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  return text.slice(argStart, i).trim() || undefined;
}

/** Check whether a bare attribute (no parens) is present. */
function hasAttr(text: string, attr: string): boolean {
  return new RegExp(`@${attr}(?:[^a-zA-Z_]|$)`).test(text);
}

// ---------------------------------------------------------------------------
// Relation attribute parser
// ---------------------------------------------------------------------------

interface RelationAttr {
  name?: string;
  fields?: string[];
  references?: string[];
}

function parseRelationAttr(text: string): RelationAttr {
  // @relation("name", fields: [...], references: [...])
  // @relation(fields: [...], references: [...])
  const result: RelationAttr = {};

  const relMatch = /@relation\(([^)]+)\)/.exec(text);
  if (!relMatch) return result;

  const inner = relMatch[1]!;

  // Named relation — first token if it starts with a quoted string
  const namedMatch = /^"([^"]+)"/.exec(inner.trim());
  if (namedMatch) result.name = namedMatch[1];

  // fields: [a, b]
  const fieldsMatch = /fields:\s*\[([^\]]*)\]/.exec(inner);
  if (fieldsMatch) {
    result.fields = fieldsMatch[1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // references: [a, b]
  const refsMatch = /references:\s*\[([^\]]*)\]/.exec(inner);
  if (refsMatch) {
    result.references = refsMatch[1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Block-level attribute parsers (@@index, @@unique, @@id)
// ---------------------------------------------------------------------------

function parseBlockAttr(line: string): { fields: string[]; name?: string; unique: boolean } | null {
  const m = /@@(index|unique|id)\(([^)]*)\)/.exec(line);
  if (!m) return null;
  const isUnique = m[1] !== "index";
  const inner = m[2]!;

  // fields: [a, b] or just [a, b] at start
  const fieldsMatch = /(?:fields:\s*)?\[([^\]]+)\]/.exec(inner);
  const fields = fieldsMatch
    ? fieldsMatch[1]!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const nameMatch = /name:\s*"([^"]+)"/.exec(inner);
  return { fields, unique: isUnique, name: nameMatch?.[1] };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parsePrisma(source: string): EntityEntry[] {
  const lines = source.split(/\r?\n/);
  const entities: EntityEntry[] = [];

  let inModel = false;
  let modelName = "";
  let fields: FieldEntry[] = [];
  let relations: RelationEntry[] = [];
  let indexes: IndexEntry[] = [];

  for (const rawLine of lines) {
    const line = stripComment(rawLine).trim();

    if (!inModel) {
      // Look for: model ModelName {
      const modelMatch = /^model\s+(\w+)\s*\{/.exec(line);
      if (modelMatch) {
        inModel = true;
        modelName = modelMatch[1]!;
        fields = [];
        relations = [];
        indexes = [];
      }
      continue;
    }

    // End of block
    if (line === "}") {
      entities.push({ name: modelName, fields, relations, indexes });
      inModel = false;
      continue;
    }

    // Block-level attributes: @@index, @@unique, @@id
    if (line.startsWith("@@")) {
      const ba = parseBlockAttr(line);
      if (ba && ba.fields.length > 0) {
        indexes.push({ fields: ba.fields, unique: ba.unique, name: ba.name });
      }
      continue;
    }

    // Skip empty lines and directive-only lines
    if (!line || line.startsWith("@")) continue;

    // Field line: fieldName  FieldType  @attr1 @attr2 ...
    // The type may be optional (?) or a list ([]) or both ([]?)
    const fieldMatch = /^(\w+)\s+([\w\[\]?]+)(.*)$/.exec(line);
    if (!fieldMatch) continue;

    const fieldName = fieldMatch[1]!;
    const rawType = fieldMatch[2]!;
    const attrStr = fieldMatch[3] ?? "";

    // Normalise type
    const nullable = rawType.endsWith("?");
    const isList = rawType.includes("[]");
    const baseType = rawType.replace("?", "").replace("[]", "");

    // Skip non-field directives / map / etc that look like fields
    if (fieldName === "datasource" || fieldName === "generator") continue;

    const isPk = hasAttr(attrStr, "id");
    const isUnique = hasAttr(attrStr, "unique");

    const defaultRaw = attrArgs(attrStr, "default");
    const defaultVal = defaultRaw ? defaultRaw.slice(0, 40) : undefined;

    // Relation field — @relation(...) present
    if (/@relation/.test(attrStr)) {
      const ra = parseRelationAttr(attrStr);
      if (ra.fields && ra.fields.length > 0 && ra.references && ra.references.length > 0) {
        // Only add the owning side (has fields:) to the relation list
        relations.push({
          from: modelName,
          fromFields: ra.fields,
          to: baseType,
          toFields: ra.references,
          name: ra.name,
        });
      }
      // Still record the relation field itself as a field (without @relation detail)
      fields.push({
        name: fieldName,
        type: isList ? `${baseType}[]` : baseType,
        nullable,
        pk: false,
        unique: false,
      });
      continue;
    }

    fields.push({
      name: fieldName,
      type: isList ? `${baseType}[]` : baseType,
      nullable,
      pk: isPk,
      unique: isUnique,
      default: defaultVal,
    });
  }

  return entities;
}
