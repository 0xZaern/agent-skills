/**
 * Frame folding: classifies each frame as app code or noise, then collapses
 * contiguous noise runs into a single "(N frames from node_modules/internals)"
 * marker.
 *
 * Rules per language:
 *   Node.js  — noise: node_modules/, node:internal, node:*, <anonymous>
 *   Python   — noise: site-packages, dist-packages, python3.x stdlib paths
 *   Java     — noise: java.*, javax.*, sun.*, com.sun.*, org.springframework.*,
 *                      io.netty.*, reactor.*, org.apache.*, ch.qos.*
 *   Generic  — noise: anything not matching a user-code heuristic
 */

import { ErrorOccurrence, LogLanguage, StackFrame } from "./types.js";

// ---------------------------------------------------------------------------
// Noise classifiers per language
// ---------------------------------------------------------------------------

function isNodeNoise(frame: StackFrame): boolean {
  const r = frame.location ?? frame.raw;
  return (
    r.includes("node_modules/") ||
    r.includes("node_modules\\") ||
    r.startsWith("node:") ||
    /\(node:/.test(r) ||
    r.includes("internal/modules/") ||
    r === "<anonymous>" ||
    r.includes("Generator.next") ||
    r.includes("processTicksAndRejections") ||
    r.includes("async Promise.all") ||
    r.includes("new Promise")
  );
}

function isPythonNoise(frame: StackFrame): boolean {
  const r = frame.location ?? frame.raw;
  return (
    r.includes("site-packages") ||
    r.includes("dist-packages") ||
    r.includes("lib/python") ||
    r.includes("/usr/lib/") ||
    // stdlib paths
    /\/python\d[\d.]*\//.test(r) ||
    r.includes("<frozen") ||
    r.includes("<string>")
  );
}

function isJavaNoise(frame: StackFrame): boolean {
  const r = frame.location ?? frame.raw;
  return (
    /\b(java|javax|sun|com\.sun|jdk)\b/.test(r) ||
    /\b(org\.springframework|io\.netty|reactor\.|org\.apache|ch\.qos|org\.slf4j)\b/.test(r) ||
    /\b(com\.fasterxml|org\.hibernate|io\.undertow|org\.jboss)\b/.test(r) ||
    r.includes("$Proxy") ||
    r.includes("reflect.Method")
  );
}

function isGenericNoise(frame: StackFrame): boolean {
  const r = frame.raw.toLowerCase();
  // Heuristic: noise if it mentions common runtime internals
  return (
    r.includes("node_modules") ||
    r.includes("site-packages") ||
    /\bjava\.\w+/.test(r) ||
    r.includes("(unknown source)") ||
    r.includes("native method")
  );
}

function isNoise(frame: StackFrame, lang: LogLanguage): boolean {
  switch (lang) {
    case "node":    return isNodeNoise(frame);
    case "python":  return isPythonNoise(frame);
    case "java":    return isJavaNoise(frame);
    default:        return isGenericNoise(frame);
  }
}

// ---------------------------------------------------------------------------
// Fold one occurrence
// ---------------------------------------------------------------------------

export function foldOccurrence(
  occ: ErrorOccurrence,
  lang: LogLanguage,
  maxAppFrames = 8
): ErrorOccurrence {
  const classified: Array<StackFrame & { isNoise: boolean }> = occ.frames.map((f) => ({
    ...f,
    app: !isNoise(f, lang),
    isNoise: isNoise(f, lang),
  }));

  const appFrames = classified.filter((f) => f.app);
  const noiseCount = classified.length - appFrames.length;

  // Keep at most maxAppFrames app frames
  const kept = appFrames.slice(0, maxAppFrames).map(({ isNoise: _n, ...rest }) => rest);

  return {
    ...occ,
    frames: kept,
    foldedFrameCount: noiseCount,
  };
}

export function foldAll(
  occurrences: ErrorOccurrence[],
  lang: LogLanguage
): ErrorOccurrence[] {
  return occurrences.map((occ) => foldOccurrence(occ, lang));
}
