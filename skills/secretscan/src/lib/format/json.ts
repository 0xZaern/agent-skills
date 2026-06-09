import { SecretScanDigest } from "../types.js";

export function formatJson(digest: SecretScanDigest): string {
  return JSON.stringify(digest);
}
