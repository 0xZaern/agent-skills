/**
 * logfold public type definitions.
 */

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface LogFoldOptions {
  format?: "json" | "md" | "text";
  maxTokens?: number;
  /** Show only the top N most-frequent error groups. Default: all. */
  top?: number;
}

// ---------------------------------------------------------------------------
// Language / runtime detection
// ---------------------------------------------------------------------------

export type LogLanguage = "node" | "python" | "java" | "generic";

// ---------------------------------------------------------------------------
// A single stack frame
// ---------------------------------------------------------------------------

export interface StackFrame {
  /** Raw frame text (after cleaning) */
  raw: string;
  /** Whether this frame is from app code (true) or a noise frame (false) */
  app: boolean;
  /** Location hint: file:line or module.class.method */
  location?: string;
}

// ---------------------------------------------------------------------------
// A single error occurrence
// ---------------------------------------------------------------------------

export interface ErrorOccurrence {
  /** Error class / exception type */
  errorType: string;
  /** Error message (trimmed) */
  message: string;
  /** Timestamp of this occurrence if found in the log */
  timestamp?: string;
  /** App-code frames only (noise folded away) */
  frames: StackFrame[];
  /** How many noise frames were collapsed */
  foldedFrameCount: number;
  /** Line number in the original log where this error starts */
  lineNumber: number;
}

// ---------------------------------------------------------------------------
// A deduplicated error group
// ---------------------------------------------------------------------------

export interface ErrorGroup {
  /** Stable hash-like signature: errorType + top app frame */
  signature: string;
  /** Number of times this error occurred in the log */
  count: number;
  /** The representative occurrence (first seen) */
  representative: ErrorOccurrence;
  /** Timestamp of the first occurrence */
  firstSeen?: string;
  /** Timestamp of the last occurrence */
  lastSeen?: string;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface LogFoldStats {
  tokenEstimate: number;
  rawEstimate: number;
  savedPercent: number;
  /** Total raw error occurrences found before dedup */
  totalOccurrences: number;
  /** Unique error groups after dedup */
  uniqueGroups: number;
  /** Detected language */
  language: LogLanguage;
}

// ---------------------------------------------------------------------------
// Top-level digest
// ---------------------------------------------------------------------------

export interface LogDigest {
  language: LogLanguage;
  groups: ErrorGroup[];
  stats: LogFoldStats;
  generatedAt: string;
}
