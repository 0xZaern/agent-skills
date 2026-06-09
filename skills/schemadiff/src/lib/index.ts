/**
 * schemadiff — public library entry point.
 *
 * Usage:
 *   import { getSchemaDigest } from 'schemadiff';
 *   const digest = await getSchemaDigest('./schema.prisma');
 */

export { getSchemaDigest } from "./digest.js";
export { formatJson, formatMarkdown, formatText } from "./format/index.js";
export type {
  SchemaDigest,
  SchemaDiffOptions,
  SchemaDiffStats,
  SchemaFormat,
  EntityEntry,
  FieldEntry,
  RelationEntry,
  IndexEntry,
} from "./types.js";
