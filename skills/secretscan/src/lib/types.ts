/**
 * secretscan public type definitions.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export type SecretKind =
  | "aws_access_key"
  | "aws_secret_key"
  | "openai_key"
  | "stripe_key"
  | "github_token"
  | "jwt"
  | "private_key_block"
  | "bearer_token"
  | "generic_password"
  | "connection_string"
  | "env_file_staged"
  | "high_entropy_string";

export interface SecretScanOptions {
  format?: "json" | "md" | "text";
  /** Directory (git repo root) to scan. Defaults to current working directory. */
  dir?: string;
  /**
   * File source to scan:
   *  - "staged"  — only git staged files (default; best for pre-commit hooks)
   *  - "tracked" — all files tracked by git
   *  - "all"     — all files in the directory tree (respects .gitignore)
   */
  source?: "staged" | "tracked" | "all";
  /** Enable Shannon entropy check for high-entropy strings (flag-gated, off by default). */
  entropy?: boolean;
  /** Minimum entropy threshold (bits per char). Defaults to 4.5. */
  entropyThreshold?: number;
}

export interface Finding {
  file: string;
  line: number;
  kind: SecretKind;
  severity: Severity;
  /** Short label, e.g. "AWS Access Key" */
  label: string;
  /** The matched value with secret masked — first 4 + last 4 chars visible. */
  masked: string;
}

export interface SecretScanStats {
  filesScanned: number;
  findingsCount: number;
  /** "staged" | "tracked" | "all" */
  source: string;
  scannedAt: string;
}

export interface SecretScanDigest {
  clean: boolean;
  findings: Finding[];
  stats: SecretScanStats;
}
