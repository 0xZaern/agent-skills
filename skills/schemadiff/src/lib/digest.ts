/**
 * Loads a schema source and produces a SchemaDigest.
 */

import fs from "node:fs";
import path from "node:path";
import { parsePrisma } from "./parser-prisma.js";
import { parseSql } from "./parser-sql.js";
import { parseDrizzle } from "./parser-drizzle.js";
import {
  EntityEntry,
  RelationEntry,
  SchemaDigest,
  SchemaDiffOptions,
  SchemaDiffStats,
  SchemaFormat,
} from "./types.js";

// ---------------------------------------------------------------------------
// Format auto-detection
// ---------------------------------------------------------------------------

function detectFormat(filePath: string, content: string): SchemaFormat {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".prisma") return "prisma";

  if (ext === ".sql" || ext === ".ddl" || ext === ".psql" || ext === ".mysql") return "sql";

  if (ext === ".ts" || ext === ".js" || ext === ".mts" || ext === ".mjs") {
    // Drizzle heuristic: imports from drizzle-orm or uses pgTable/mysqlTable/sqliteTable
    if (
      /drizzle-orm/.test(content) ||
      /(?:pg|mysql|sqlite)Table\s*\(/.test(content)
    ) {
      return "drizzle";
    }
  }

  // Content-based fallback
  if (/^\s*model\s+\w+\s*\{/m.test(content) && /^\s*datasource\s+\w+\s*\{/m.test(content)) {
    return "prisma";
  }
  if (/CREATE\s+TABLE\b/i.test(content)) return "sql";
  if (/(?:pg|mysql|sqlite)Table\s*\(/.test(content)) return "drizzle";

  // Default to SQL for unknown extensions
  return "sql";
}

// ---------------------------------------------------------------------------
// Directory scanning
// ---------------------------------------------------------------------------

const SCHEMA_EXTENSIONS = new Set([".prisma", ".sql", ".ddl", ".psql", ".mysql"]);
const DRIZZLE_EXTENSIONS = new Set([".ts", ".js", ".mts", ".mjs"]);

function collectFiles(inputPath: string, forced?: SchemaFormat): string[] {
  const stat = fs.statSync(inputPath);

  if (!stat.isDirectory()) return [inputPath];

  // Directory — scan for schema files
  const results: string[] = [];
  const entries = fs.readdirSync(inputPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (
      SCHEMA_EXTENSIONS.has(ext) ||
      (DRIZZLE_EXTENSIONS.has(ext) && forced === "drizzle")
    ) {
      results.push(path.join(inputPath, entry.name));
    }
  }

  // Recurse one level for migrations directories
  if (results.length === 0) {
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sub = path.join(inputPath, entry.name);
      const subEntries = fs.readdirSync(sub, { withFileTypes: true });
      for (const se of subEntries) {
        if (!se.isFile()) continue;
        const ext = path.extname(se.name).toLowerCase();
        if (SCHEMA_EXTENSIONS.has(ext)) {
          results.push(path.join(sub, se.name));
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Merge entity lists from multiple files
// ---------------------------------------------------------------------------

function mergeEntities(all: EntityEntry[][]): EntityEntry[] {
  const map = new Map<string, EntityEntry>();

  for (const entities of all) {
    for (const entity of entities) {
      if (!map.has(entity.name)) {
        map.set(entity.name, entity);
      } else {
        // Merge fields/relations/indexes from later files
        const existing = map.get(entity.name)!;
        const fieldNames = new Set(existing.fields.map((f) => f.name));
        for (const f of entity.fields) {
          if (!fieldNames.has(f.name)) {
            existing.fields.push(f);
            fieldNames.add(f.name);
          }
        }
        existing.relations.push(...entity.relations);
        existing.indexes.push(...entity.indexes);
      }
    }
  }

  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Global relation de-duplication
// ---------------------------------------------------------------------------

function extractGlobalRelations(entities: EntityEntry[]): RelationEntry[] {
  const seen = new Set<string>();
  const result: RelationEntry[] = [];

  for (const entity of entities) {
    for (const rel of entity.relations) {
      const key = `${rel.from}:${rel.fromFields.join(",")}→${rel.to}:${rel.toFields.join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(rel);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Token budget trimming
// ---------------------------------------------------------------------------

function trimToTokenBudget(digest: SchemaDigest, maxTokens: number): SchemaDigest {
  const estimate = () => Math.ceil(JSON.stringify(digest).length / 4);
  if (estimate() <= maxTokens) return digest;

  // First: drop defaults from fields
  digest = {
    ...digest,
    entities: digest.entities.map((e) => ({
      ...e,
      fields: e.fields.map((f) => ({ ...f, default: undefined })),
    })),
  };
  if (estimate() <= maxTokens) return digest;

  // Then: drop indexes
  digest = {
    ...digest,
    entities: digest.entities.map((e) => ({ ...e, indexes: [] })),
  };
  if (estimate() <= maxTokens) return digest;

  // Then: truncate field lists
  digest = {
    ...digest,
    entities: digest.entities.map((e) => ({
      ...e,
      fields: e.fields.slice(0, 5),
    })),
  };
  if (estimate() <= maxTokens) return digest;

  // Finally: truncate entity list
  const keep = Math.max(
    1,
    Math.floor((maxTokens / estimate()) * digest.entities.length)
  );
  digest = { ...digest, entities: digest.entities.slice(0, keep) };

  return digest;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function computeStats(
  output: string,
  rawSize: number,
  entityCount: number,
  fieldCount: number,
  relationCount: number
): SchemaDiffStats {
  const tokenEstimate = Math.ceil(output.length / 4);
  const rawEstimate = Math.max(1, Math.ceil(rawSize / 4));
  const savedPercent = Math.max(0, Math.round((1 - tokenEstimate / rawEstimate) * 100));
  return { tokenEstimate, rawEstimate, savedPercent, entityCount, fieldCount, relationCount };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getSchemaDigest(
  source: string,
  opts: SchemaDiffOptions = {}
): Promise<SchemaDigest> {
  if (!fs.existsSync(source)) {
    throw new Error(`Path not found: ${source}`);
  }

  const files = collectFiles(source, opts.parser);

  if (files.length === 0) {
    throw new Error(`No schema files found in: ${source}`);
  }

  let totalRawSize = 0;
  const allEntityLists: EntityEntry[][] = [];
  let detectedFormat: SchemaFormat = "sql";

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    totalRawSize += content.length;

    const fmt = opts.parser ?? detectFormat(file, content);
    if (files.indexOf(file) === 0) detectedFormat = fmt;

    let entities: EntityEntry[];
    switch (fmt) {
      case "prisma":
        entities = parsePrisma(content);
        break;
      case "drizzle":
        entities = parseDrizzle(content);
        break;
      default:
        entities = parseSql(content);
    }

    allEntityLists.push(entities);
  }

  let entities = mergeEntities(allEntityLists);

  // Model filter
  if (opts.model) {
    const lower = opts.model.toLowerCase();
    entities = entities.filter((e) => e.name.toLowerCase() === lower);
  }

  const globalRelations = extractGlobalRelations(entities);

  const fieldCount = entities.reduce((s, e) => s + e.fields.length, 0);
  const relationCount = globalRelations.length;

  const prelim: SchemaDigest = {
    format: detectedFormat,
    source: path.resolve(source),
    entities,
    relations: globalRelations,
    stats: {
      tokenEstimate: 0,
      rawEstimate: 0,
      savedPercent: 0,
      entityCount: entities.length,
      fieldCount,
      relationCount,
    },
    generatedAt: new Date().toISOString(),
  };

  const stats = computeStats(
    JSON.stringify(prelim),
    totalRawSize,
    entities.length,
    fieldCount,
    relationCount
  );
  let digest: SchemaDigest = { ...prelim, stats };

  if (opts.maxTokens) {
    digest = trimToTokenBudget(digest, opts.maxTokens);
    const trimmedStats = computeStats(
      JSON.stringify(digest),
      totalRawSize,
      digest.entities.length,
      digest.entities.reduce((s, e) => s + e.fields.length, 0),
      digest.relations.length
    );
    digest = { ...digest, stats: trimmedStats };
  }

  return digest;
}
