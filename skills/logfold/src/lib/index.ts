/**
 * logfold — public library entry point.
 *
 * Usage:
 *   import { getLogDigest } from 'logfold';
 *   const digest = await getLogDigest('./app.log');
 */

export { getLogDigest } from "./digest.js";
export { formatJson, formatMarkdown, formatText } from "./format/index.js";
export type {
  LogDigest,
  LogFoldOptions,
  LogFoldStats,
  LogLanguage,
  ErrorGroup,
  ErrorOccurrence,
  StackFrame,
} from "./types.js";
