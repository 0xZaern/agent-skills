/**
 * JSON formatter — compact output ideal for AI agents and piping.
 */

import { Codemap } from "../types.js";

export function formatJson(codemap: Codemap): string {
  return JSON.stringify(codemap);
}
