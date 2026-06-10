/**
 * Error deduplication: groups occurrences by signature, counts them, and
 * records first/last timestamps.
 *
 * Signature = errorType + ":" + top app frame location (or message prefix if
 * no app frames remain after folding). This is stable across log files as long
 * as the error class and crash site stay the same.
 */

import { ErrorGroup, ErrorOccurrence } from "./types.js";

// ---------------------------------------------------------------------------
// Signature computation
// ---------------------------------------------------------------------------

/** Build a stable, human-readable signature for an occurrence. */
function makeSignature(occ: ErrorOccurrence): string {
  const topFrame = occ.frames[0]?.location ?? occ.frames[0]?.raw;
  const messagePart = occ.message.slice(0, 60).replace(/\s+/g, " ").trim();
  if (topFrame) {
    return `${occ.errorType}@${topFrame}`;
  }
  return `${occ.errorType}:${messagePart}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function dedupeOccurrences(
  occurrences: ErrorOccurrence[]
): ErrorGroup[] {
  const map = new Map<string, ErrorGroup>();

  for (const occ of occurrences) {
    const sig = makeSignature(occ);

    if (!map.has(sig)) {
      map.set(sig, {
        signature: sig,
        count: 1,
        representative: occ,
        firstSeen: occ.timestamp,
        lastSeen: occ.timestamp,
      });
    } else {
      const group = map.get(sig)!;
      group.count++;

      if (occ.timestamp) {
        if (!group.firstSeen || occ.timestamp < group.firstSeen) {
          group.firstSeen = occ.timestamp;
        }
        if (!group.lastSeen || occ.timestamp > group.lastSeen) {
          group.lastSeen = occ.timestamp;
        }
      }
    }
  }

  // Sort by count descending, then by error type alpha
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.representative.errorType.localeCompare(b.representative.errorType);
  });
}
