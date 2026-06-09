/**
 * secretscan — public library entry point.
 *
 * Usage:
 *   import { getSecretScanDigest } from 'secretscan';
 *   const digest = await getSecretScanDigest({ dir: '/path/to/repo' });
 */

export { getSecretScanDigest } from "./digest.js";
export { formatJson, formatMarkdown, formatText } from "./format/index.js";
export type {
  SecretScanDigest,
  SecretScanOptions,
  SecretScanStats,
  Finding,
  SecretKind,
  Severity,
} from "./types.js";
