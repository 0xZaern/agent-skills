/**
 * Secret masking utilities.
 *
 * Never print the full value of a detected secret.
 * Show first 4 + last 4 characters, mask the middle with asterisks.
 */

const MASK_CHAR = "*";
const VISIBLE_ENDS = 4;

/**
 * Masks a secret value: shows first 4 and last 4 characters,
 * replaces the middle with 8 asterisks regardless of actual length.
 *
 * Examples:
 *   "AKIAIOSFODNN7EXAMPLE"  → "AKIA********MPLE"
 *   "short"                 → "****" (too short to show ends)
 *   "sk-abc123def456ghi789" → "sk-a********h789"
 */
export function maskSecret(value: string): string {
  if (value.length <= VISIBLE_ENDS * 2) {
    return MASK_CHAR.repeat(VISIBLE_ENDS);
  }
  const head = value.slice(0, VISIBLE_ENDS);
  const tail = value.slice(-VISIBLE_ENDS);
  return `${head}${MASK_CHAR.repeat(8)}${tail}`;
}
