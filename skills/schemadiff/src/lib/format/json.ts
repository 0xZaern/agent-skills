import { SchemaDigest } from "../types.js";

export function formatJson(digest: SchemaDigest): string {
  return JSON.stringify(digest);
}
