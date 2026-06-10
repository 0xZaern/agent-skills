/**
 * Log parser: detects the runtime language and extracts raw error occurrences
 * with their stack frames from verbose log / stack-trace text.
 *
 * Handles:
 *   - Node.js  — "Error: message\n    at fn (file:line:col)"
 *   - Python   — "Traceback (most recent call last):\n  File ...\nErrorType: message"
 *   - Java     — "ExceptionClass: message\n\tat pkg.Class.method(File.java:line)"
 *   - Generic  — any line containing "Error:" or "Exception:" followed by indented lines
 */

import { ErrorOccurrence, LogLanguage, StackFrame } from "./types.js";

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

export function detectLanguage(text: string): LogLanguage {
  // Node.js: "    at <fn> (<file>:<line>:<col>)"
  if (/^\s+at\s+\S+\s+\(/m.test(text)) return "node";

  // Python: "Traceback (most recent call last):"
  if (/Traceback\s+\(most recent call last\)/m.test(text)) return "python";

  // Java: "\tat pkg.Class.method(File.java:42)"
  if (/^\s+at\s+[\w$.]+\([\w$.]+\.java:\d+\)/m.test(text)) return "java";

  return "generic";
}

// ---------------------------------------------------------------------------
// Timestamp extraction helpers
// ---------------------------------------------------------------------------

/** Common timestamp patterns. Returns a compact string or undefined. */
function extractTimestamp(line: string): string | undefined {
  // ISO 8601 with optional ms: 2024-01-15T12:34:56.789Z  or  2024-01-15 12:34:56
  const isoMatch = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/.exec(line);
  if (isoMatch) return isoMatch[1];

  // Common log prefix like [2024-01-15 12:34:56]
  const bracketMatch = /\[(\d{2}\/\w+\/\d{4}[:\s]\d{2}:\d{2}:\d{2}[^\]]*)\]/.exec(line);
  if (bracketMatch) return bracketMatch[1];

  // Unix epoch or epoch-like
  const epochMatch = /\b(\d{10,13})\b/.exec(line);
  if (epochMatch) {
    const n = parseInt(epochMatch[1]!, 10);
    // Sanity check: between 2000 and 2100
    if (n >= 946684800000 / 1000 && n <= 4102444800) {
      return new Date(n < 1e11 ? n * 1000 : n).toISOString().slice(0, 19) + "Z";
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Node.js parser
// ---------------------------------------------------------------------------

const NODE_FRAME_RE = /^\s+at\s+(.+)$/;

function parseNodeError(line: string): { errorType: string; message: string } | null {
  // Matches "TypeError: Cannot read..." or plain "Error: ..."
  // Also catches "UnhandledPromiseRejectionWarning: TypeError: ..."
  const m = /(?:^|\s)([\w$.]+Error|[\w$.]+Exception|[\w$.]+Warning)\s*:\s*(.+)$/.exec(line);
  if (!m) return null;
  return { errorType: m[1]!, message: m[2]!.slice(0, 200) };
}

function parseNodeFrameLine(line: string): StackFrame | null {
  const m = NODE_FRAME_RE.exec(line);
  if (!m) return null;

  const raw = m[1]!.trim();
  // Extract location: "at function (file:line:col)" or "at file:line:col"
  const locMatch = /\(([^)]+)\)$/.exec(raw) ?? /at\s+(.+)$/.exec(raw);
  const location = locMatch ? locMatch[1]!.trim() : undefined;

  return { raw, location, app: false }; // app-ness determined in fold step
}

// ---------------------------------------------------------------------------
// Python parser
// ---------------------------------------------------------------------------

function parsePythonBlocks(text: string): ErrorOccurrence[] {
  const occurrences: ErrorOccurrence[] = [];
  const lines = text.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    // Start of traceback
    if (/Traceback\s+\(most recent call last\)/i.test(line)) {
      const startLine = i + 1;
      const frames: StackFrame[] = [];
      i++;

      // Collect File/line pairs and code preview lines
      while (i < lines.length) {
        const fl = lines[i]!;
        // "  File 'foo.py', line 42, in bar"
        if (/^\s+File\s+"[^"]+",\s+line\s+\d+/.test(fl)) {
          const locMatch = /File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+(.+))?/.exec(fl);
          const location = locMatch
            ? `${locMatch[1]!}:${locMatch[2]!}${locMatch[3] ? ` in ${locMatch[3]}` : ""}`
            : fl.trim();
          frames.push({ raw: fl.trim(), location, app: false });
          i++;
          // Skip the code preview line (next non-frame line that isn't a new "File")
          if (i < lines.length && !/^\s+File\s+/.test(lines[i]!)) {
            i++; // code preview
          }
          continue;
        }
        // End of traceback — exception line
        if (/^[\w$.]+(?:Error|Exception|Warning)\s*:/.test(fl) || /^\w+: /.test(fl)) {
          break;
        }
        // Blank line or other — end of block
        if (!fl.trim()) break;
        i++;
      }

      // Exception line
      if (i < lines.length) {
        const excLine = lines[i]!;
        const excMatch = /^([\w$.]+(?:Error|Exception|Warning|Fault)?)\s*:\s*(.*)/.exec(excLine);
        if (excMatch) {
          const ts = undefined; // Python tracebacks rarely have inline timestamps
          occurrences.push({
            errorType: excMatch[1]!,
            message: excMatch[2]!.slice(0, 200),
            timestamp: ts,
            frames,
            foldedFrameCount: 0,
            lineNumber: startLine,
          });
        }
        i++;
      }
      continue;
    }
    i++;
  }

  return occurrences;
}

// ---------------------------------------------------------------------------
// Java parser
// ---------------------------------------------------------------------------

const JAVA_FRAME_RE = /^\s+at\s+([\w$.]+)\(([\w$.]+\.java|Unknown Source|Native Method)(?::(\d+))?\)/;
const JAVA_CAUSED_BY_RE = /^(?:Caused by|Suppressed):\s+([\w$.]+(?:Exception|Error|Throwable))\s*:\s*(.*)/;

function parseJavaBlocks(text: string): ErrorOccurrence[] {
  const occurrences: ErrorOccurrence[] = [];
  const lines = text.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    // Root exception or "Caused by:" line
    const excMatch =
      /^([\w$.]+(?:Exception|Error|Throwable))\s*(?::\s*(.*))?$/.exec(line) ??
      JAVA_CAUSED_BY_RE.exec(line);

    if (excMatch) {
      const startLine = i + 1;
      const errorType = excMatch[1]!;
      const message = (excMatch[2] ?? "").slice(0, 200);
      const ts = extractTimestamp(line);
      const frames: StackFrame[] = [];
      i++;

      while (i < lines.length) {
        const fl = lines[i]!;
        const fm = JAVA_FRAME_RE.exec(fl);
        if (fm) {
          const method = fm[1]!;
          const file = fm[2]!;
          const lineNum = fm[3];
          const location = lineNum ? `${file}:${lineNum} (${method})` : `${file} (${method})`;
          frames.push({ raw: fl.trim(), location, app: false });
          i++;
          continue;
        }
        // "... N more" — skip
        if (/^\s+\.\.\.\s+\d+\s+more/.test(fl)) { i++; continue; }
        break;
      }

      if (frames.length > 0 || message) {
        occurrences.push({
          errorType,
          message,
          timestamp: ts,
          frames,
          foldedFrameCount: 0,
          lineNumber: startLine,
        });
      }
      continue;
    }
    i++;
  }

  return occurrences;
}

// ---------------------------------------------------------------------------
// Node.js block parser
// ---------------------------------------------------------------------------

function parseNodeBlocks(text: string): ErrorOccurrence[] {
  const occurrences: ErrorOccurrence[] = [];
  const lines = text.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const errInfo = parseNodeError(line);
    if (errInfo) {
      const startLine = i + 1;
      const ts = extractTimestamp(line);
      const frames: StackFrame[] = [];
      i++;

      while (i < lines.length) {
        const fl = lines[i]!;
        const frame = parseNodeFrameLine(fl);
        if (frame) {
          frames.push(frame);
          i++;
        } else {
          break;
        }
      }

      occurrences.push({
        errorType: errInfo.errorType,
        message: errInfo.message,
        timestamp: ts,
        frames,
        foldedFrameCount: 0,
        lineNumber: startLine,
      });
      continue;
    }
    i++;
  }

  return occurrences;
}

// ---------------------------------------------------------------------------
// Generic parser (fallback)
// ---------------------------------------------------------------------------

function parseGenericBlocks(text: string): ErrorOccurrence[] {
  const occurrences: ErrorOccurrence[] = [];
  const lines = text.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    // Any line that contains "Error:" or "Exception:" or ends with "Error"
    const errMatch = /([\w$.]*(?:Error|Exception|Fault|Panic))\s*:\s*(.{0,200})/.exec(line);
    if (errMatch) {
      const startLine = i + 1;
      const ts = extractTimestamp(line);
      const frames: StackFrame[] = [];
      i++;

      // Collect indented or "at"-prefixed lines
      while (i < lines.length) {
        const fl = lines[i]!;
        if (/^\s{2,}/.test(fl) || /^\s*at\s+/.test(fl) || /^\s*#\d+/.test(fl)) {
          frames.push({ raw: fl.trim(), location: fl.trim(), app: false });
          i++;
        } else {
          break;
        }
      }

      occurrences.push({
        errorType: errMatch[1]!,
        message: errMatch[2]!,
        timestamp: ts,
        frames,
        foldedFrameCount: 0,
        lineNumber: startLine,
      });
      continue;
    }
    i++;
  }

  return occurrences;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function parseLog(text: string, language: LogLanguage): ErrorOccurrence[] {
  switch (language) {
    case "node":
      return parseNodeBlocks(text);
    case "python":
      return parsePythonBlocks(text);
    case "java":
      return parseJavaBlocks(text);
    default:
      return parseGenericBlocks(text);
  }
}
