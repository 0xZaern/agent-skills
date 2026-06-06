/**
 * JSON formatter — compact output ideal for AI agents and piping.
 */

import { RepoDigest } from "../types.js";

export function formatJson(digest: RepoDigest): string {
  return JSON.stringify(digest);
}
