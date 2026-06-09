/**
 * Drizzle ORM schema parser.
 *
 * Parses TypeScript Drizzle schema files by reading the source text directly
 * (no TS compiler API dependency). Handles pgTable / mysqlTable / sqliteTable
 * table definitions, column helpers (text, integer, serial, boolean, varchar,
 * timestamp, uuid, json, jsonb, real, numeric, bigint, smallint, doublePrecision,
 * char, date, time, bigserial, customType), column modifiers (.notNull(),
 * .primaryKey(), .unique(), .default()), and relations() definitions.
 *
 * Limitations: only handles common single-file schema patterns — complex
 * multi-file imports or runtime-computed column definitions are not covered.
 */

import { EntityEntry, FieldEntry, IndexEntry, RelationEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the matching closing brace/paren for an open one, starting just after
 * `startIdx` in `str`. Returns the index of the closer or -1.
 */
function findClose(str: string, startIdx: number, open: string, close: string): number {
  let depth = 1;
  for (let i = startIdx; i < str.length; i++) {
    if (str[i] === open) depth++;
    else if (str[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Strip line comments and block comments from TS source. */
function stripTsComments(src: string): string {
  src = src.replace(/\/\*[\s\S]*?\*\//g, " ");
  src = src.replace(/\/\/[^\n]*/g, "");
  return src;
}

/** Extract the table variable name and table string name. */
function extractTableName(line: string): { varName: string; tableName: string } | null {
  // export const tableName = pgTable("table_name", { ...
  // const tableName = mysqlTable("table_name", {
  const m = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:pg|mysql|sqlite)Table\s*\(\s*["'`]([^"'`]+)["'`]/.exec(
    line
  );
  if (!m) return null;
  return { varName: m[1]!, tableName: m[2]! };
}

// ---------------------------------------------------------------------------
// Column type normaliser
// ---------------------------------------------------------------------------

/** Map a Drizzle column helper name to a compact type string. */
function normaliseType(helper: string): string {
  const MAP: Record<string, string> = {
    serial: "serial",
    bigserial: "bigserial",
    smallserial: "smallserial",
    integer: "integer",
    int: "integer",
    smallint: "smallint",
    bigint: "bigint",
    real: "real",
    doublePrecision: "double",
    numeric: "numeric",
    decimal: "decimal",
    boolean: "boolean",
    text: "text",
    varchar: "varchar",
    char: "char",
    uuid: "uuid",
    timestamp: "timestamp",
    date: "date",
    time: "time",
    json: "json",
    jsonb: "jsonb",
    bytea: "bytea",
    inet: "inet",
    cidr: "cidr",
    macaddr: "macaddr",
    point: "point",
    line: "line",
    polygon: "polygon",
    customType: "custom",
  };
  return MAP[helper] ?? helper;
}

// ---------------------------------------------------------------------------
// Parse a single column definition string (the value in the columns object)
// ---------------------------------------------------------------------------

interface ParsedCol {
  type: string;
  nullable: boolean;
  pk: boolean;
  unique: boolean;
  default?: string;
}

function parseColDef(colSrc: string): ParsedCol {
  // e.g.: text("email").notNull().unique().default("anon")
  // Extract the leading helper name
  const helperMatch = /^(\w+)\s*\(/.exec(colSrc.trim());
  const helper = helperMatch ? helperMatch[1]! : "unknown";
  const type = normaliseType(helper);

  const notNull = /\.notNull\(\)/.test(colSrc);
  const pk = /\.primaryKey\(\)/.test(colSrc);
  const unique = /\.unique\(\)/.test(colSrc) && !pk;

  // .default(value) — capture the raw argument (up to 40 chars)
  let defaultVal: string | undefined;
  const defMatch = /\.default\(([^)]{1,50})/.exec(colSrc);
  if (defMatch) defaultVal = defMatch[1]!.replace(/['"]/g, "").slice(0, 40);

  return { type, nullable: !notNull && !pk, pk, unique, default: defaultVal };
}

// ---------------------------------------------------------------------------
// Extract the columns object body from a table definition
// ---------------------------------------------------------------------------

/**
 * Given the full source starting at the `{` of the columns object,
 * extract top-level `key: value` entries. Returns a map of fieldName → colSrc.
 * Value is everything from after `:` up to the next top-level comma or `}`.
 */
function extractColumns(body: string): Map<string, string> {
  const result = new Map<string, string>();

  // Strip the outer braces
  const inner = body.slice(1, body.lastIndexOf("}")).trim();

  let i = 0;
  while (i < inner.length) {
    // Skip whitespace
    while (i < inner.length && /\s/.test(inner[i]!)) i++;
    if (i >= inner.length) break;

    // Read key (identifier or quoted)
    let keyEnd = i;
    if (inner[i] === '"' || inner[i] === "'") {
      const q = inner[i];
      keyEnd = inner.indexOf(q, i + 1) + 1;
    } else {
      while (keyEnd < inner.length && /[\w$]/.test(inner[keyEnd]!)) keyEnd++;
    }
    if (keyEnd <= i) break;
    const key = inner.slice(i, keyEnd).replace(/['"]/g, "");
    i = keyEnd;

    // Skip to colon
    while (i < inner.length && inner[i] !== ":") i++;
    i++; // skip ':'

    // Skip whitespace
    while (i < inner.length && /\s/.test(inner[i]!)) i++;

    // Read value — respect nested parens and braces
    let valueStart = i;
    let depth = 0;
    while (i < inner.length) {
      const ch = inner[i];
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
      else if (ch === "," && depth === 0) break;
      i++;
    }
    const value = inner.slice(valueStart, i).trim();
    i++; // skip ','

    if (key && value) result.set(key, value);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Relations parser
// ---------------------------------------------------------------------------

/**
 * Parse `relations(tableName, ({ one, many }) => ({ ... }))` blocks.
 * Returns an array of RelationEntry (from → to, 1 per relation).
 */
function parseRelationsBlock(
  src: string,
  tableVarToName: Map<string, string>
): RelationEntry[] {
  const result: RelationEntry[] = [];

  // Find all `relations(varName, ...` calls
  const re = /\brelations\s*\(\s*(\w+)\s*,/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    const tableVar = m[1]!;
    const fromName = tableVarToName.get(tableVar) ?? tableVar;

    // find the opening paren of the second arg
    const arrowStart = src.indexOf("=>", m.index);
    if (arrowStart === -1) continue;

    const openBrace = src.indexOf("{", arrowStart);
    if (openBrace === -1) continue;

    const closeBrace = findClose(src, openBrace + 1, "{", "}");
    if (closeBrace === -1) continue;

    const relBody = src.slice(openBrace + 1, closeBrace);

    // Extract each one/many call: relName: one(targetVar, ...) or many(targetVar)
    const relRe = /(\w+)\s*:\s*(one|many)\s*\(\s*(\w+)/g;
    let rm: RegExpExecArray | null;
    while ((rm = relRe.exec(relBody)) !== null) {
      const relName = rm[1]!;
      const toVar = rm[3]!;
      const toName = tableVarToName.get(toVar) ?? toVar;

      result.push({
        from: fromName,
        fromFields: [],
        to: toName,
        toFields: [],
        name: relName,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseDrizzle(source: string): EntityEntry[] {
  const clean = stripTsComments(source);

  // Map varName → tableName for all tables
  const tableVarToName = new Map<string, string>();
  // Map tableName → EntityEntry
  const entityMap = new Map<string, EntityEntry>();

  // Find all pgTable / mysqlTable / sqliteTable calls
  // Pattern: (export )? const varName = xTable("tableName", { ... })
  const tableRe = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:pg|mysql|sqlite)Table\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{/g;
  let tm: RegExpExecArray | null;

  while ((tm = tableRe.exec(clean)) !== null) {
    const varName = tm[1]!;
    const tableName = tm[2]!;
    tableVarToName.set(varName, tableName);

    // Find the opening { of the columns object
    const openBrace = tm.index + tm[0].length - 1; // points at the `{`
    const closeBrace = findClose(clean, openBrace + 1, "{", "}");
    if (closeBrace === -1) continue;

    const colsBody = clean.slice(openBrace, closeBrace + 1);
    const colsMap = extractColumns(colsBody);

    const fields: FieldEntry[] = [];
    for (const [fieldName, colSrc] of colsMap) {
      const parsed = parseColDef(colSrc);
      fields.push({
        name: fieldName,
        type: parsed.type,
        nullable: parsed.nullable,
        pk: parsed.pk,
        unique: parsed.unique,
        default: parsed.default,
      });
    }

    entityMap.set(tableName, {
      name: tableName,
      fields,
      relations: [],
      indexes: [],
    });
  }

  // Parse relations() blocks and attach to entities
  const allRelations = parseRelationsBlock(clean, tableVarToName);
  for (const rel of allRelations) {
    const entity = entityMap.get(rel.from);
    if (entity) entity.relations.push(rel);
  }

  return [...entityMap.values()];
}
