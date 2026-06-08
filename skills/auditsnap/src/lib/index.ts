/**
 * auditsnap — public library entry point.
 *
 * Usage:
 *   import { getAuditDigest } from 'auditsnap';
 *   const digest = await getAuditDigest({ dir: './my-project' });
 */

export { getAuditDigest } from "./digest.js";
export { formatJson, formatMarkdown, formatText } from "./format/index.js";
export type {
  AuditDigest,
  AuditSnapOptions,
  AuditSnapStats,
  SeverityCounts,
  VulnEntry,
  Severity,
} from "./types.js";
