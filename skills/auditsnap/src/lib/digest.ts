/**
 * Parses raw npm audit --json output and produces an AuditDigest.
 */

import {
  AuditDigest,
  AuditSnapOptions,
  AuditSnapStats,
  Severity,
  SeverityCounts,
  VulnEntry,
} from "./types.js";
import { runNpmAudit, readStdin, stdinIsPiped } from "./runner.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SEVERITY_ORDER: Severity[] = ["critical", "high", "moderate", "low", "info"];

function isSeverity(s: string): s is Severity {
  return (SEVERITY_ORDER as string[]).includes(s);
}

// ---------------------------------------------------------------------------
// Parse audit report v2 (npm 7+)
// ---------------------------------------------------------------------------

function parseAuditV2(data: AnyObj, rawSize: number): AuditDigest {
  const vulnMap = data["vulnerabilities"] as AnyObj | undefined;
  const meta = data["metadata"] as AnyObj | undefined;
  const metaCounts = (meta?.["vulnerabilities"] as AnyObj) ?? {};

  const counts: SeverityCounts = {
    critical: Number(metaCounts["critical"] ?? 0),
    high: Number(metaCounts["high"] ?? 0),
    moderate: Number(metaCounts["moderate"] ?? 0),
    low: Number(metaCounts["low"] ?? 0),
    info: Number(metaCounts["info"] ?? 0),
    total: Number(metaCounts["total"] ?? 0),
  };

  const entries: VulnEntry[] = [];

  if (vulnMap) {
    for (const [, vuln] of Object.entries(vulnMap)) {
      const v = vuln as AnyObj;
      const sev = String(v["severity"] ?? "low");
      const severity: Severity = isSeverity(sev) ? sev : "low";

      // "via" can be an array of strings (package names) or advisory objects
      const viaRaw = v["via"] as Array<string | AnyObj> | undefined;
      const viaIds: string[] = [];
      const titles: string[] = [];

      if (Array.isArray(viaRaw)) {
        for (const item of viaRaw) {
          if (typeof item === "string") {
            viaIds.push(item);
          } else {
            // advisory object
            const url = String((item as AnyObj)["url"] ?? "");
            const ghsa = url.split("/").pop();
            if (ghsa) viaIds.push(ghsa);
            const t = (item as AnyObj)["title"] as string | undefined;
            if (t) titles.push(t);
          }
        }
      }

      const fixAvailable = !!v["fixAvailable"];
      const isDirect = v["isDirect"] === true;

      entries.push({
        name: String(v["name"] ?? ""),
        severity,
        via: viaIds.slice(0, 3),
        title: titles[0] ?? (viaIds[0] ?? ""),
        range: String(v["range"] ?? ""),
        fixAvailable,
        kind: isDirect ? "direct" : "transitive",
      });
    }
  }

  // sort: severity desc, then direct before transitive, then alpha
  entries.sort((a, b) => {
    const si = SEVERITY_ORDER.indexOf(a.severity);
    const sj = SEVERITY_ORDER.indexOf(b.severity);
    if (si !== sj) return si - sj;
    if (a.kind !== b.kind) return a.kind === "direct" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const fixable = entries.filter((e) => e.fixAvailable).length;
  const unfixable = entries.length - fixable;

  const prelim: AuditDigest = {
    counts,
    vulnerabilities: entries,
    fixable,
    unfixable,
    stats: { tokenEstimate: 0, rawEstimate: 0, savedPercent: 0, totalAdvisories: 0, fixableCount: 0 },
    generatedAt: new Date().toISOString(),
  };

  const stats = computeStats(JSON.stringify(prelim), rawSize, entries.length, fixable);
  return { ...prelim, stats };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function computeStats(
  output: string,
  rawSize: number,
  totalAdvisories: number,
  fixableCount: number
): AuditSnapStats {
  const tokenEstimate = Math.ceil(output.length / 4);
  const rawEstimate = Math.max(1, Math.ceil(rawSize / 4));
  const savedPercent = Math.max(0, Math.round((1 - tokenEstimate / rawEstimate) * 100));
  return { tokenEstimate, rawEstimate, savedPercent, totalAdvisories, fixableCount };
}

// ---------------------------------------------------------------------------
// Token budget trimming
// ---------------------------------------------------------------------------

function trimToTokenBudget(digest: AuditDigest, maxTokens: number): AuditDigest {
  const estimate = () => Math.ceil(JSON.stringify(digest).length / 4);
  if (estimate() <= maxTokens) return digest;

  // drop via arrays first
  digest = {
    ...digest,
    vulnerabilities: digest.vulnerabilities.map((v) => ({ ...v, via: [] })),
  };
  if (estimate() <= maxTokens) return digest;

  // truncate list
  const keep = Math.max(1, Math.floor((maxTokens / estimate()) * digest.vulnerabilities.length));
  digest = { ...digest, vulnerabilities: digest.vulnerabilities.slice(0, keep) };

  return digest;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getAuditDigest(
  opts: AuditSnapOptions = {}
): Promise<AuditDigest> {
  let raw: string;

  if (stdinIsPiped()) {
    raw = readStdin();
  } else {
    const dir = opts.dir ?? ".";
    raw = runNpmAudit(dir);
  }

  const data = JSON.parse(raw) as AnyObj;
  const rawSize = raw.length;

  // detect report version — v2 has "auditReportVersion: 2"
  let digest: AuditDigest;
  if (Number(data["auditReportVersion"]) >= 2) {
    digest = parseAuditV2(data, rawSize);
  } else {
    // npm 6 format — "advisories" object
    digest = parseAuditV1(data, rawSize);
  }

  if (opts.maxTokens) {
    digest = trimToTokenBudget(digest, opts.maxTokens);
    const trimmedStats = computeStats(
      JSON.stringify(digest),
      rawSize,
      digest.vulnerabilities.length,
      digest.fixable
    );
    digest = { ...digest, stats: trimmedStats };
  }

  return digest;
}

// ---------------------------------------------------------------------------
// npm audit v1 (npm 6)
// ---------------------------------------------------------------------------

function parseAuditV1(data: AnyObj, rawSize: number): AuditDigest {
  const advisories = (data["advisories"] as AnyObj) ?? {};
  const metaCounts = ((data["metadata"] as AnyObj)?.["vulnerabilities"] as AnyObj) ?? {};

  const counts: SeverityCounts = {
    critical: Number(metaCounts["critical"] ?? 0),
    high: Number(metaCounts["high"] ?? 0),
    moderate: Number(metaCounts["moderate"] ?? 0),
    low: Number(metaCounts["low"] ?? 0),
    info: 0,
    total: Number(metaCounts["total"] ?? 0),
  };

  const entries: VulnEntry[] = [];

  for (const [, adv] of Object.entries(advisories)) {
    const a = adv as AnyObj;
    const sev = String(a["severity"] ?? "low");
    const severity: Severity = isSeverity(sev) ? sev : "low";
    const findings = a["findings"] as AnyObj[] | undefined;
    const isDirect = Array.isArray(findings) && findings.some((f) => (f as AnyObj)["depth"] === 1);

    entries.push({
      name: String(a["module_name"] ?? ""),
      severity,
      via: [String(a["url"] ?? "").split("/").pop() ?? ""].filter(Boolean),
      title: String(a["title"] ?? ""),
      range: String(a["vulnerable_versions"] ?? ""),
      fixAvailable: !!a["patched_versions"] && a["patched_versions"] !== "<0.0.0",
      kind: isDirect ? "direct" : "transitive",
    });
  }

  entries.sort((a, b) => {
    const si = SEVERITY_ORDER.indexOf(a.severity);
    const sj = SEVERITY_ORDER.indexOf(b.severity);
    if (si !== sj) return si - sj;
    if (a.kind !== b.kind) return a.kind === "direct" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const fixable = entries.filter((e) => e.fixAvailable).length;

  const prelim: AuditDigest = {
    counts,
    vulnerabilities: entries,
    fixable,
    unfixable: entries.length - fixable,
    stats: { tokenEstimate: 0, rawEstimate: 0, savedPercent: 0, totalAdvisories: 0, fixableCount: 0 },
    generatedAt: new Date().toISOString(),
  };

  const stats = computeStats(JSON.stringify(prelim), rawSize, entries.length, fixable);
  return { ...prelim, stats };
}
