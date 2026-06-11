import { LogDigest } from "../types.js";

export function formatJson(digest: LogDigest): string {
  return JSON.stringify(digest);
}
