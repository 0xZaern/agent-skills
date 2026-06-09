/**
 * Shannon entropy helpers for secretscan.
 *
 * Computes entropy (bits per character) of a string.
 * A high-entropy string is a candidate for a leaked secret.
 */

const DEFAULT_THRESHOLD = 4.5;

/**
 * Returns the Shannon entropy (bits per character) of `s`.
 */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Candidate token patterns — long alphanumeric/base64-ish tokens that may be
 * high-entropy secrets not caught by a named rule.
 *
 * Min length 20, must be printable non-whitespace.
 */
const TOKEN_PATTERN = /[A-Za-z0-9+/=_-]{20,}/g;

export interface EntropyFinding {
  token: string;
  entropy: number;
  offset: number;
}

/**
 * Scans a single line for high-entropy tokens.
 * Returns all tokens that exceed `threshold` bits/char.
 */
export function findHighEntropyTokens(
  line: string,
  threshold: number = DEFAULT_THRESHOLD
): EntropyFinding[] {
  const results: EntropyFinding[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(TOKEN_PATTERN.source, "g");
  while ((match = re.exec(line)) !== null) {
    const token = match[0];
    const e = shannonEntropy(token);
    if (e >= threshold) {
      results.push({ token, entropy: e, offset: match.index });
    }
  }
  return results;
}
