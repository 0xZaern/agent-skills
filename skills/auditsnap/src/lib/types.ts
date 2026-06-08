/**
 * auditsnap public type definitions.
 */

export type Severity = "critical" | "high" | "moderate" | "low" | "info";

export interface AuditSnapOptions {
  format?: "json" | "md" | "text";
  maxTokens?: number;
  /** Directory to run `npm audit --json` in. Ignored when reading from stdin. */
  dir?: string;
}

export interface VulnEntry {
  name: string;
  severity: Severity;
  /** CVE or GHSA identifier, if present */
  via: string[];
  /** One-line description from the advisory */
  title: string;
  range: string;
  fixAvailable: boolean;
  /** "direct" if listed in dependencies/devDependencies, else "transitive" */
  kind: "direct" | "transitive";
}

export interface SeverityCounts {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  info: number;
  total: number;
}

export interface AuditSnapStats {
  tokenEstimate: number;
  rawEstimate: number;
  savedPercent: number;
  totalAdvisories: number;
  fixableCount: number;
}

export interface AuditDigest {
  counts: SeverityCounts;
  vulnerabilities: VulnEntry[];
  fixable: number;
  unfixable: number;
  stats: AuditSnapStats;
  generatedAt: string;
}
