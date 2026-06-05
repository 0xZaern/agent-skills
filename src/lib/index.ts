/**
 * devpulse — public library entry point.
 *
 * Usage:
 *   import { getRepoDigest } from 'devpulse';
 *   const digest = await getRepoDigest('facebook/react');
 */

export { getRepoDigest } from "./digest.js";
export { formatJson, formatMarkdown, formatText } from "./format/index.js";
export type {
  RepoDigest,
  RepoMetadata,
  LanguageBreakdown,
  FileTreeEntry,
  ReadmeContent,
  KeyFile,
  CommitEntry,
  DigestStats,
  DigestOptions,
} from "./types.js";
export { DigestError } from "./github/client.js";
export type { DigestErrorCode } from "./github/client.js";
