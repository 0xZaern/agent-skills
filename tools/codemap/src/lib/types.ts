/**
 * codemap public type definitions.
 */

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CodemapOptions {
  /**
   * Output format. Defaults to "json" (compact, agent-friendly).
   */
  format?: "json" | "md" | "text";
  /**
   * Soft token budget. When set, the library trims the output to fit:
   *   1. Drop per-file signatures (keep only paths)
   *   2. Prune non-source files from file tree
   *   3. Drop imports lists
   */
  maxTokens?: number;
  /** When true, suppress ANSI color in text formatter. */
  noColor?: boolean;
}

// ---------------------------------------------------------------------------
// Per-file symbol shapes
// ---------------------------------------------------------------------------

export interface SymbolSignature {
  /** Symbol name. */
  name: string;
  /**
   * Symbol kind: function, class, interface, type, const, enum, variable.
   */
  kind:
    | "function"
    | "class"
    | "interface"
    | "type"
    | "const"
    | "enum"
    | "variable";
  /**
   * One-line signature string, e.g.:
   *   function getUser(id: string): Promise<User>
   *   class AuthService { login(email, password); logout(); }
   *   interface Config { port: number; host: string; }
   */
  signature: string;
}

export interface FileAnalysis {
  /** Path relative to rootDir. */
  path: string;
  /**
   * Exported symbols extracted via the TypeScript compiler API.
   * Only present for .ts/.tsx/.js/.jsx/.mjs files.
   */
  exports?: SymbolSignature[];
  /**
   * Module specifiers from import declarations.
   * Only present for .ts/.tsx/.js/.jsx/.mjs files.
   */
  imports?: string[];
  /** File size in bytes. */
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Tree node (pruned file tree)
// ---------------------------------------------------------------------------

export interface TreeNode {
  /** Path relative to rootDir. */
  path: string;
  /** "file" or "dir". */
  type: "file" | "dir";
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface CodemapStats {
  /**
   * Estimated tokens for this codemap output (output bytes / 4).
   */
  tokenEstimate: number;
  /**
   * Estimated tokens an agent would spend reading all included source files
   * directly (sum of source file bytes / 4).
   */
  rawEstimate: number;
  /**
   * Percent reduction vs. reading raw. Clamped >= 0.
   */
  savedPercent: number;
  /** Total number of files analysed. */
  fileCount: number;
  /** Number of files with symbol extraction (TS/JS source files). */
  sourceFileCount: number;
}

// ---------------------------------------------------------------------------
// Top-level result
// ---------------------------------------------------------------------------

export interface Codemap {
  /** Project name from package.json, or the rootDir basename. */
  projectName: string;
  /** Pruned, sorted file tree. */
  tree: TreeNode[];
  /** Per-file analyses (source files first, then others). */
  files: FileAnalysis[];
  /** Token-saving statistics. */
  stats: CodemapStats;
  /** ISO 8601 timestamp when this codemap was generated. */
  generatedAt: string;
}
