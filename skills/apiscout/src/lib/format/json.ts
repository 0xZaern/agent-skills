import { ApiDigest } from "../types.js";

export function formatJson(digest: ApiDigest): string {
  return JSON.stringify(digest);
}
