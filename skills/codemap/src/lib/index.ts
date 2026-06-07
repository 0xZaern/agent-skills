/**
 * codemap — public library entry point.
 *
 * Usage:
 *   import { getCodemap } from 'codemap';
 *   const map = await getCodemap('./my-project');
 */

export { getCodemap } from "./codemap.js";
export { formatJson, formatMarkdown, formatText } from "./format/index.js";
export type {
  Codemap,
  CodemapOptions,
  CodemapStats,
  FileAnalysis,
  SymbolSignature,
  TreeNode,
} from "./types.js";
