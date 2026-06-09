/**
 * SQL DDL parser.
 *
 * Handles CREATE TABLE, inline PRIMARY KEY / UNIQUE / NOT NULL / DEFAULT,
 * table-level PRIMARY KEY (...) and UNIQUE (...) constraints,
 * FOREIGN KEY (...) REFERENCES ..., and CREATE [UNIQUE] INDEX statements.
 *
 * Supports PostgreSQL, MySQL, and SQLite DDL conventions.
 */

import { EntityEntry, FieldEntry, IndexEntry, RelationEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Remove SQL line comments (--) and block comments (/* ... *\/) */
function stripSqlComments(sql: string): string {
  // Block comments (non-greedy, including newlines)
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
  // Line comments
  sql = sql.replace(/--[^\n]*/g, "");
  return sql;
}

/** Collapse whitespace to single spaces. */
function normalise(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Split a parenthesised list like "(a, b, c)" into ["a", "b", "c"].
 * Handles nested parens by counting depth.
 */
function splitParenList(inner: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      items.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = inner.slice(start).trim();
  if (last) items.push(last);
  return items;
}

/**
 * Extract the content inside the outer parens of a CREATE TABLE statement.
 * Returns null if no outer paren pair is found.
 */
function extractTableBody(stmt: string): string | null {
  const open = stmt.indexOf("(");
  if (open === -1) return null;

  let depth = 0;
  let close = -1;
  for (let i = open; i < stmt.length; i++) {
    if (stmt[i] === "(") depth++;
    else if (stmt[i] === ")") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return null;
  return stmt.slice(open + 1, close);
}

// ---------------------------------------------------------------------------
// Column definition parser
// ---------------------------------------------------------------------------

interface ParsedColumn {
  name: string;
  type: string;
  nullable: boolean;
  pk: boolean;
  unique: boolean;
  default?: string;
}

function parseColumn(colDef: string): ParsedColumn | null {
  const norm = normalise(colDef);

  // Skip constraint lines that start with CONSTRAINT / PRIMARY KEY / UNIQUE / FOREIGN KEY / CHECK
  if (/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK)\b/i.test(norm)) return null;

  // Identifier — may be quoted with backticks, double-quotes, or brackets
  const identRe = /^(?:`([^`]+)`|"([^"]+)"|(\[([^\]]+)\])|(\w+))\s+/;
  const identMatch = identRe.exec(norm);
  if (!identMatch) return null;

  const name = identMatch[1] ?? identMatch[2] ?? identMatch[4] ?? identMatch[5] ?? "";
  const rest = norm.slice(identMatch[0].length);

  // Extract type — everything up to the first keyword modifier
  const typeMatch = /^([\w\s(),]+?)(?:\s+(?:NOT\s+NULL|NULL|DEFAULT|PRIMARY\s+KEY|UNIQUE|REFERENCES|GENERATED|AUTO_INCREMENT|AUTOINCREMENT|COMMENT|CHARACTER|COLLATE|CHECK|ON\s+DELETE|ON\s+UPDATE)|$)/i.exec(
    rest
  );
  const rawType = typeMatch ? typeMatch[1]!.trim() : rest.split(/\s+/)[0] ?? "";

  const notNull = /\bNOT\s+NULL\b/i.test(rest);
  const nullable = !notNull;
  const pk = /\bPRIMARY\s+KEY\b/i.test(rest);
  const unique = /\bUNIQUE\b/i.test(rest) && !pk;

  // DEFAULT value
  let defaultVal: string | undefined;
  const defMatch = /\bDEFAULT\s+([^\s,)]+(?:\([^)]*\))?)/i.exec(rest);
  if (defMatch) defaultVal = defMatch[1]!.slice(0, 40);

  return { name, type: rawType, nullable, pk, unique, default: defaultVal };
}

// ---------------------------------------------------------------------------
// Table-level constraint parsers
// ---------------------------------------------------------------------------

interface TableConstraint {
  type: "pk" | "unique" | "fk";
  fields: string[];
  refTable?: string;
  refFields?: string[];
  name?: string;
}

function parseConstraint(def: string): TableConstraint | null {
  const norm = normalise(def);

  // PRIMARY KEY (col1, col2)
  const pkMatch = /^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(norm);
  if (pkMatch) {
    const fields = splitParenList(pkMatch[1]!)
      .map((f) => f.replace(/[`"[\]]/g, "").trim())
      .filter(Boolean);
    return { type: "pk", fields };
  }

  // UNIQUE (col1, col2) or UNIQUE KEY name (col1)
  const uqMatch = /^(?:CONSTRAINT\s+\S+\s+)?UNIQUE(?:\s+(?:KEY|INDEX))?\s*(?:\w+\s*)?\(([^)]+)\)/i.exec(norm);
  if (uqMatch) {
    const fields = splitParenList(uqMatch[1]!)
      .map((f) => f.replace(/[`"[\]]/g, "").trim())
      .filter(Boolean);
    return { type: "unique", fields };
  }

  // FOREIGN KEY (col) REFERENCES table(col)
  const fkMatch = /^(?:CONSTRAINT\s+(\S+)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([`"\w]+)\s*\(([^)]+)\)/i.exec(
    norm
  );
  if (fkMatch) {
    const constraintName = fkMatch[1]
      ? fkMatch[1]!.replace(/[`"[\]]/g, "")
      : undefined;
    const fromFields = splitParenList(fkMatch[2]!)
      .map((f) => f.replace(/[`"[\]]/g, "").trim())
      .filter(Boolean);
    const refTable = fkMatch[3]!.replace(/[`"[\]]/g, "");
    const refFields = splitParenList(fkMatch[4]!)
      .map((f) => f.replace(/[`"[\]]/g, "").trim())
      .filter(Boolean);
    return { type: "fk", fields: fromFields, refTable, refFields, name: constraintName };
  }

  return null;
}

// ---------------------------------------------------------------------------
// CREATE TABLE statement parser
// ---------------------------------------------------------------------------

interface ParsedTable {
  name: string;
  entity: EntityEntry;
}

function parseCreateTable(stmt: string, allRelations: RelationEntry[]): ParsedTable | null {
  const norm = normalise(stmt);

  // CREATE [TEMPORARY] TABLE [IF NOT EXISTS] name (...)
  const nameMatch = /^CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\w.]+)\s*\(/i.exec(norm);
  if (!nameMatch) return null;

  const rawName = nameMatch[1]!.replace(/[`"]/g, "");
  // Strip schema prefix (e.g. "public.users" → "users")
  const tableName = rawName.includes(".") ? rawName.split(".").pop()! : rawName;

  const body = extractTableBody(norm);
  if (!body) return null;

  const colDefs = splitParenList(body);

  const fields: FieldEntry[] = [];
  const indexes: IndexEntry[] = [];
  const pkFields: string[] = [];

  for (const def of colDefs) {
    const trimmed = def.trim();
    if (!trimmed) continue;

    const constraint = parseConstraint(trimmed);
    if (constraint) {
      if (constraint.type === "pk") {
        pkFields.push(...constraint.fields);
        indexes.push({ fields: constraint.fields, unique: true, name: "pk" });
      } else if (constraint.type === "unique") {
        indexes.push({ fields: constraint.fields, unique: true });
      } else if (constraint.type === "fk" && constraint.refTable) {
        allRelations.push({
          from: tableName,
          fromFields: constraint.fields,
          to: constraint.refTable,
          toFields: constraint.refFields ?? [],
          name: constraint.name,
        });
      }
      continue;
    }

    const col = parseColumn(trimmed);
    if (!col) continue;

    // If this column is part of a table-level PK, it will be flagged later
    if (col.pk) pkFields.push(col.name);

    fields.push({
      name: col.name,
      type: col.type,
      nullable: col.nullable,
      pk: col.pk,
      unique: col.unique,
      default: col.default,
    });
  }

  // Apply table-level PK
  for (const f of fields) {
    if (pkFields.includes(f.name)) f.pk = true;
  }

  return { name: tableName, entity: { name: tableName, fields, relations: [], indexes } };
}

// ---------------------------------------------------------------------------
// CREATE INDEX statement parser
// ---------------------------------------------------------------------------

interface ParsedIndex {
  table: string;
  index: IndexEntry;
}

function parseCreateIndex(stmt: string): ParsedIndex | null {
  const norm = normalise(stmt);

  // CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON table (col1, col2)
  const m = /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)\s+ON\s+([`"\w.]+)\s*\(([^)]+)\)/i.exec(
    norm
  );
  if (!m) return null;

  const isUnique = Boolean(m[1]);
  const indexName = m[2]!.replace(/[`"]/g, "");
  const rawTable = m[3]!.replace(/[`"]/g, "");
  const tableName = rawTable.includes(".") ? rawTable.split(".").pop()! : rawTable;
  const fields = splitParenList(m[4]!)
    .map((f) => {
      // strip ASC/DESC and cast expressions
      return f.replace(/[`"]/g, "").split(/\s+/)[0]!.trim();
    })
    .filter(Boolean);

  return { table: tableName, index: { name: indexName, fields, unique: isUnique } };
}

// ---------------------------------------------------------------------------
// Statement splitter
// ---------------------------------------------------------------------------

/**
 * Split SQL source into individual statements on semicolons, respecting
 * parenthesis nesting (so we don't split inside CREATE TABLE bodies).
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth === 0) {
      const stmt = sql.slice(start, i).trim();
      if (stmt) statements.push(stmt);
      start = i + 1;
    }
  }
  const last = sql.slice(start).trim();
  if (last) statements.push(last);
  return statements;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function parseSql(source: string): EntityEntry[] {
  const clean = stripSqlComments(source);
  const statements = splitStatements(clean);

  const tableMap = new Map<string, EntityEntry>();
  const allRelations: RelationEntry[] = [];

  for (const stmt of statements) {
    const norm = normalise(stmt);

    if (/^CREATE\s+(?:TEMPORARY\s+)?TABLE\b/i.test(norm)) {
      const parsed = parseCreateTable(stmt, allRelations);
      if (parsed) tableMap.set(parsed.name, parsed.entity);
      continue;
    }

    if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(norm)) {
      const parsed = parseCreateIndex(stmt);
      if (parsed) {
        const entity = tableMap.get(parsed.table);
        if (entity) entity.indexes.push(parsed.index);
      }
      continue;
    }

    if (/^ALTER\s+TABLE\b/i.test(norm)) {
      // ALTER TABLE tbl ADD CONSTRAINT name FOREIGN KEY (...) REFERENCES ...
      const altMatch = /^ALTER\s+TABLE\s+([`"\w.]+)\s+ADD\s+(?:CONSTRAINT\s+(\S+)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([`"\w]+)\s*\(([^)]+)\)/i.exec(
        norm
      );
      if (altMatch) {
        const rawTable = altMatch[1]!.replace(/[`"]/g, "");
        const fromTable = rawTable.includes(".") ? rawTable.split(".").pop()! : rawTable;
        const constraintName = altMatch[2]
          ? altMatch[2]!.replace(/[`"]/g, "")
          : undefined;
        const fromFields = splitParenList(altMatch[3]!)
          .map((f) => f.replace(/[`"]/g, "").trim())
          .filter(Boolean);
        const toTable = altMatch[4]!.replace(/[`"]/g, "");
        const toFields = splitParenList(altMatch[5]!)
          .map((f) => f.replace(/[`"]/g, "").trim())
          .filter(Boolean);
        allRelations.push({
          from: fromTable,
          fromFields,
          to: toTable,
          toFields,
          name: constraintName,
        });
      }
      continue;
    }
  }

  // Attach relations to their source entity
  for (const rel of allRelations) {
    const entity = tableMap.get(rel.from);
    if (entity) entity.relations.push(rel);
  }

  return [...tableMap.values()];
}
