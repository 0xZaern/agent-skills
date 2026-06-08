import { AuditDigest } from "../types.js";

export function formatJson(digest: AuditDigest): string {
  return JSON.stringify(digest);
}
