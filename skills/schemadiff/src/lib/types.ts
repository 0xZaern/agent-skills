/**
 * schemadiff public type definitions.
 */

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface SchemaDiffOptions {
  format?: "json" | "md" | "text";
  maxTokens?: number;
  /** Drill into a single model/table by name. */
  model?: string;
  /** Force a specific parser instead of auto-detecting. */
  parser?: "prisma" | "sql" | "drizzle";
}

// ---------------------------------------------------------------------------
// Schema format detection
// ---------------------------------------------------------------------------

export type SchemaFormat = "prisma" | "sql" | "drizzle";

// ---------------------------------------------------------------------------
// Field descriptor
// ---------------------------------------------------------------------------

export interface FieldEntry {
  name: string;
  /** The column / field type as a compact string, e.g. "String", "Int", "varchar(255)" */
  type: string;
  nullable: boolean;
  /** Primary key flag */
  pk: boolean;
  /** Unique constraint flag */
  unique: boolean;
  /** Default value hint, if present (truncated) */
  default?: string;
}

// ---------------------------------------------------------------------------
// Relation (foreign key edge)
// ---------------------------------------------------------------------------

export interface RelationEntry {
  /** Source model/table */
  from: string;
  /** Source field(s) */
  fromFields: string[];
  /** Target model/table */
  to: string;
  /** Target field(s) */
  toFields: string[];
  /** Relation name or constraint name (optional) */
  name?: string;
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

export interface IndexEntry {
  name?: string;
  fields: string[];
  unique: boolean;
}

// ---------------------------------------------------------------------------
// Entity (model / table)
// ---------------------------------------------------------------------------

export interface EntityEntry {
  name: string;
  fields: FieldEntry[];
  relations: RelationEntry[];
  indexes: IndexEntry[];
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface SchemaDiffStats {
  tokenEstimate: number;
  rawEstimate: number;
  savedPercent: number;
  entityCount: number;
  fieldCount: number;
  relationCount: number;
}

// ---------------------------------------------------------------------------
// Top-level digest
// ---------------------------------------------------------------------------

export interface SchemaDigest {
  format: SchemaFormat;
  source: string;
  entities: EntityEntry[];
  /** Global relation list (FK edges, de-duplicated across all entities) */
  relations: RelationEntry[];
  stats: SchemaDiffStats;
  generatedAt: string;
}
