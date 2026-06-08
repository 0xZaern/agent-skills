/**
 * apiscout — public library entry point.
 *
 * Usage:
 *   import { getApiDigest } from 'apiscout';
 *   const digest = await getApiDigest('./openapi.yaml');
 */

export { getApiDigest } from "./digest.js";
export { formatJson, formatMarkdown, formatText } from "./format/index.js";
export type {
  ApiDigest,
  ApiScoutOptions,
  ApiScoutStats,
  ApiInfo,
  AuthScheme,
  EndpointEntry,
  ParamEntry,
  SchemaEntry,
  ServerEntry,
} from "./types.js";
