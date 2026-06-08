# agent-skills — New Skill Candidates Proposal

**Date:** 2026-06-07  
**Scope:** 7 skill candidates ranked by value-to-effort ratio, with top-2-3 recommendations.

---

## Background

The collection currently has two skills:

- **devpulse** — remote GitHub repo digest (metadata + file tree + key files + recent commits)
- **codemap** — local codebase symbol map (exported APIs + one-line signatures via TS compiler API)

Both follow the same contract: take something verbose, return a compact structured digest with a `--stats` token-savings story, available as CLI + importable lib + MCP tool.

The research below identifies where agents waste the most tokens in 2026 and maps each gap to a new skill that fits this architecture precisely.

---

## Research Findings

### Where agents waste tokens in 2026

1. **Tool-definition bloat** — An agent connected to 30 MCP tools consumes 21,000+ tokens just loading definitions before doing any actual work (Waxell, 2026).
2. **Blind file reads** — Agents read 20-25 files to answer a 3-function question because they have no pre-indexed symbol map. codemap partially solves this for local code; nothing solves it for remote deps or API schemas.
3. **Raw OpenAPI specs** — Feeding an entire OpenAPI file into context burns the budget immediately. The OpenAPI Schema Explorer MCP server (skywork.ai) explicitly identified this as a top token-waste category.
4. **Unstructured git history** — Agents paste raw `git log --oneline` or full diffs into context. Research paper "Lore" (arxiv 2603.15566) proposes structured commit digests as a solution; no standalone tool implements this cleanly.
5. **Flat `npm audit` / `pip-audit` output** — Raw audit JSON for a large monorepo runs 50-200 KB and includes thousands of transitive entries. Agents get no signal-to-noise on what actually matters.
6. **Full error logs** — Stack traces, Sentry payloads, and CI logs are extremely verbose. Agents paste the whole thing into context to "let the model figure it out."
7. **Prisma/Drizzle/SQL schema files** — An agent writing a migration or a query typically reads 5-10 schema files plus migration history. A normalized entity-relationship digest with foreign keys and index hints would replace all of that.

### Existing tool landscape (what NOT to duplicate)

| Area | Existing tools |
|------|---------------|
| OpenAPI → MCP tool generation | `openapi-mcp`, `openapi-mcp-generator`, `mcp-openapi` — all auto-generate callable MCP tools; none produce a token-efficient *read-only digest* |
| Dep graph / code intel | GitNexus, CodeGraphContext, tokensave, repowise — all heavy (knowledge graph DBs, 40+ tools, server processes); no lightweight zero-dep CLI+lib |
| PR review summarization | pr-agent, ai-review, GitHub Copilot review — all CI/CD integrations, not importable lib+MCP skill |
| Security audit | `npm audit`, Snyk, Socket.dev — produce verbose JSON, not compact digests |
| Changelog parsing | `changelog-parser`, `auto-changelog`, `changelogai` — changelogai ships an MCP server but focuses on *generating* changelogs; nothing purely digests/compresses existing changelogs for agent consumption |
| DB schema visualization | ChartDB, Atlas — full UI or migration tools, not compact read-only digests |

---

## Candidate Skills (7)

---

### 1. `apiscout`

**One-line description:** Token-efficient OpenAPI/Swagger spec digest for AI agents — compresses a full spec into endpoint summaries, parameter tables, and auth requirements at a fraction of raw token cost.

**Verbose input → compact output:**
- Input: full OpenAPI 3.x / Swagger 2.x YAML or JSON (typically 20,000–500,000 tokens for real APIs like Stripe, GitHub, or Kubernetes)
- Output: structured digest with `info`, `servers`, `auth` schemes, per-tag endpoint summaries (`METHOD /path — summary — key params — response codes`), global schema definitions (name + field list, no descriptions), and a `--endpoint /foo` drill-down mode for full detail on one route

**Why agents need it:**
An agent tasked with "add a Stripe charge endpoint" currently pastes the entire Stripe OpenAPI spec (~300k tokens) into context, or manually browses dozens of files. A 2,000-token digest of endpoint skeletons and auth requirements gives the agent everything it needs to reason and then drill into specific endpoints on demand.

**Token savings story:**
Real-world Stripe OpenAPI spec: ~280,000 tokens raw → ~3,000 tokens digest = **98% reduction**. GitHub API spec: ~450,000 tokens raw → ~5,000 tokens digest = **98.8% reduction**.

**Differentiation:**
Existing tools (`openapi-mcp`, `openapi-mcp-generator`) convert a spec into *callable MCP tools* — they let an agent invoke endpoints. `apiscout` produces a *read-only structural digest* so an agent can understand what an API can do without calling it, and without consuming the whole spec. Different use case, complementary to the callers.

**Implementation difficulty:** LOW  
- Parse YAML/JSON with `js-yaml` (already a zero-native-build package)
- Walk the OpenAPI paths object, group by tag, extract method/summary/params/responses
- Token-count with `gpt-tokenizer` (pure JS, same approach as the existing skills)
- No external API calls; works fully offline from a local file path or a URL (`fetch`)
- Supports `--endpoint /path/method` drill-down for full schema on a single route
- Disk cache keyed on URL + ETag header (same pattern as devpulse)

**Key npm dependencies:** `js-yaml`, `gpt-tokenizer`

**Existing similar tools:** OpenAPI Schema Explorer MCP (skywork.ai) — similar concept but closed/hosted. No open-source standalone CLI+lib exists for this specific pattern.

---

### 2. `auditsnap`

**One-line description:** Token-efficient dependency security snapshot for AI agents — compresses `npm audit` / `pip-audit` / `cargo audit` output into a ranked digest of actionable vulnerabilities, stripping transitive noise.

**Verbose input → compact output:**
- Input: raw `npm audit --json` (10-200 KB for large projects, hundreds of entries), or reads `package.json` + `package-lock.json` directly and calls `npm audit` internally
- Output: structured digest with `critical`, `high`, `moderate`, `low` counts, a ranked list of the top N vulnerabilities (each: package name, severity, CVE, fix-available flag, direct-vs-transitive, one-line description), and a `fixable` summary (`N of M can be fixed with npm audit fix`)

**Why agents need it:**
An agent asked to "fix the security issues" currently pastes raw `npm audit --json` into context — which for a mid-size project is 50,000–200,000 tokens of nested JSON describing hundreds of transitive vulnerabilities, many unfixable. The agent has no idea what to act on first. A ranked 1,000-token digest surfaces the 5-10 actionable items immediately.

**Token savings story:**
Medium Next.js project with 40 vulnerabilities: raw `npm audit --json` ≈ 85,000 tokens → digest ≈ 800 tokens = **99% reduction**.

**Differentiation:**
`npm audit` itself, Snyk, and Socket.dev all produce verbose output designed for human review. None provide a compact structured digest intended for agent/LLM ingestion. This skill is to `npm audit` what devpulse is to a raw GitHub API response.

**Implementation difficulty:** LOW  
- Spawn `npm audit --json` as a child_process, or parse `package-lock.json` directly with `@npmcli/arborist` for zero-shell approach
- Python support: spawn `pip-audit --format=json`, parse output
- Rank by severity, deduplicate by CVE, separate direct from transitive
- No native dependencies, pure Node.js

**Key npm dependencies:** `@npmcli/arborist` (optional, for direct parse), or just `child_process` + JSON parse; `gpt-tokenizer`

**Existing similar tools:** None as a standalone CLI+lib+MCP skill.

---

### 3. `diffdigest`

**One-line description:** Token-efficient git diff/PR digest for AI agents — compresses a full git diff or GitHub PR diff into a structured change summary (files affected, hunks by file, risk signals) at a fraction of raw diff token cost.

**Verbose input → compact output:**
- Input: raw unified diff from `git diff`, a local diff file, or a GitHub PR URL (uses the GitHub Compare API)
- Output: structured digest with `summary` (total files, insertions, deletions), per-file entries (file path, change type add/modify/delete/rename, hunk count, net lines, key changed symbols if TS/JS), `risk_signals` (test files absent while logic files changed, schema files touched, security-sensitive patterns like auth/credentials/eval), and a `--file path` drill-down for the raw hunk of a specific file

**Why agents need it:**
A 50-file PR with 2,000 line changes produces a raw diff of ~80,000 tokens. An agent reviewing it currently either pastes the whole thing (expensive, causes context rot) or reads files individually (10-20 tool calls). A 3,000-token structured digest with risk signals lets the agent prioritize which files to drill into.

**Token savings story:**
50-file PR with 2,000 changed lines: raw diff ≈ 80,000 tokens → digest ≈ 2,500 tokens = **97% reduction** before any drill-down.

**Differentiation:**
pr-agent and ai-review are CI/CD integrations that *post reviews as comments*. diffdigest is a standalone skill that *produces a compact digest* for an agent to reason over. It is a read tool, not a review bot. It also works on local `git diff` output, not just GitHub PRs.

**Implementation difficulty:** LOW-MED  
- Parse unified diff format with `parse-diff` (npm, pure JS)
- For GitHub PRs: use GitHub Compare API (same fetch pattern as devpulse, reuse auth)
- Extract changed symbol names from TS/JS hunks with a lightweight regex pass (not full AST)
- Risk signal detection: check if any test file mirrors a changed logic file, look for known sensitive filename patterns
- Disk cache keyed on PR URL + merge SHA

**Key npm dependencies:** `parse-diff`, `gpt-tokenizer`

**Existing similar tools:** pr-agent (full review bot, not importable lib), diffstat (no semantic analysis, no MCP). Clean gap.

---

### 4. `schemamap`

**One-line description:** Token-efficient database schema digest for AI agents — reads Prisma schema, Drizzle schema, raw SQL migrations, or a live database connection and returns a compact ERD-style digest with entities, fields, relations, and indexes.

**Verbose input → compact output:**
- Input: path to `schema.prisma`, a Drizzle schema directory, a `migrations/` folder, or a database connection string (Postgres, SQLite)
- Output: structured digest with a list of models/tables (each: fields with type + nullable + default, relations with cardinality, indexes), a global `relations` section showing FK graph, and a `--model ModelName` drill-down mode

**Why agents need it:**
An agent writing a migration or complex query reads 5-10 schema files plus migration history — typically 15,000-60,000 tokens for a mid-size app. The critical information (column names, types, FK constraints, indexes) fits in under 2,000 tokens. This is the database analogue of codemap.

**Token savings story:**
Mid-size Prisma schema (15 models, 20 migrations): raw files ≈ 40,000 tokens → digest ≈ 1,800 tokens = **95% reduction**.

**Differentiation:**
ChartDB and Atlas are full-featured schema design/migration tools. SchemaMap is intentionally read-only and output-only — a pure digest skill, not a migration runner or visualizer. The closest existing thing is manually dumping `prisma format` output, which still requires reading every file.

**Implementation difficulty:** MED  
- Prisma: parse `.prisma` files with `@prisma/internals` (official package) or a custom parser targeting the Prisma SDL subset
- Drizzle: use TypeScript compiler API (same approach as codemap) to extract table/column definitions
- Raw SQL: parse with `node-sql-parser` or `pgsql-ast-parser`
- Live DB: use `pg` or `better-sqlite3` with `information_schema` queries
- The Prisma parser path has the most reuse and covers the majority of modern Node.js projects

**Key npm dependencies:** `@prisma/internals` (optional), `pgsql-ast-parser` (optional), `gpt-tokenizer`

**Existing similar tools:** None as standalone CLI+lib+MCP skill.

---

### 5. `errorlens`

**One-line description:** Token-efficient error/log digest for AI agents — compresses raw stack traces, CI logs, or Sentry payloads into a structured root-cause digest (error class, message, relevant frames, reproduction context).

**Verbose input → compact output:**
- Input: raw log text piped from stdin, a file path, or a Sentry issue URL (via Sentry API)
- Output: structured digest with `error` (class + message), `frames` (top 5-10 deduplicated relevant frames from user code, stripping node_modules noise), `context` (env vars present, Node version, relevant request info if present), `pattern` (known error class — e.g., "ECONNREFUSED", "Cannot read properties of undefined"), and `suggested_queries` (compact search terms for docs/SO)

**Why agents need it:**
Agents are pasted 10,000-token CI logs or Sentry payloads and asked to diagnose a bug. 95% of the log content is irrelevant (framework internals, repeated log lines, unrelated traces). The agent buries the signal in noise. A 500-token digest of the relevant frames + context is far more actionable.

**Token savings story:**
Typical CI failure log: ≈ 15,000 tokens raw → digest ≈ 400 tokens = **97% reduction**. Sentry payload with full stack: ≈ 8,000 tokens → digest ≈ 300 tokens = **96% reduction**.

**Differentiation:**
Datadog and Logz.io have AI-powered log parsing, but these are hosted SaaS products. The runbookai/runbook-mcp-server is for runbook execution, not log digesting. No open-source standalone CLI+lib+MCP skill exists for this pattern.

**Implementation difficulty:** MED  
- Input parsing: detect format (Node.js stack, Python traceback, Java stacktrace, structured JSON log, Sentry payload) via heuristics
- Frame filtering: strip frames from `node_modules`, `node:internal`, known framework paths; keep user code frames
- Deduplication: repeated identical frames (e.g., Promise chains) collapse to `... repeated N times`
- Sentry integration: optional, via `SENTRY_AUTH_TOKEN` env var + Sentry Issues API
- The hard part is multi-format detection, but MVP with Node.js + Python covers 80% of use cases

**Key npm dependencies:** `gpt-tokenizer`; Sentry API via `fetch`

**Existing similar tools:** None as standalone importable lib+MCP skill.

---

### 6. `depgraph`

**One-line description:** Token-efficient local dependency graph digest for AI agents — maps the first- and second-degree import graph of a TypeScript/JavaScript project without requiring a graph database.

**Verbose input → compact output:**
- Input: path to a local TypeScript/JavaScript project
- Output: structured digest with per-file import/export edges (2-3 levels deep), a `cycles` list (circular dependency chains), `entry_points` (files not imported by anything), `heaviest_subtrees` (which files are most imported), and a `--file path` drill-down for the full import/export list of one file

**Why agents need it:**
An agent doing a refactor or debugging an import error reads files one-by-one to trace the dependency chain, burning 5-20 tool calls and 10,000-50,000 tokens. A pre-computed graph digest lets it immediately see "if I change X, these 8 files are affected."

**Token savings story:**
100-file TypeScript project: walking imports manually ≈ 40,000 tokens of file reads → digest ≈ 2,000 tokens = **95% reduction**.

**Differentiation:**
GitNexus and CodeGraphContext use persistent graph databases (Neo4j, etc.) and require server processes. tokensave has 40+ tools and 9 integrations — heavy. depgraph is intentionally a single-purpose, zero-server, zero-database CLI+lib+MCP skill that answers one question: what imports what?

**Implementation difficulty:** MED  
- Use TypeScript compiler API (same foundation as codemap) to extract import declarations
- Build adjacency list, detect cycles with DFS
- No graph database; pure in-memory for projects under 1,000 files (covers 99% of real use)
- Shares significant infrastructure with codemap — could potentially be a codemap flag rather than a standalone skill

**Key npm dependencies:** `typescript` (already used by codemap), `gpt-tokenizer`

**Existing similar tools:** madge (produces dot graphs, not structured JSON digests, no MCP). Clean gap for the structured-digest + MCP pattern.

---

### 7. `releasemap`

**One-line description:** Token-efficient changelog/release-notes digest for AI agents — parses CHANGELOG.md, GitHub Releases, or npm registry history and returns a compact version-timeline digest.

**Verbose input → compact output:**
- Input: path to a `CHANGELOG.md`, a GitHub `owner/repo` (reads GitHub Releases API), or an npm package name (reads npm registry)
- Output: structured digest with version timeline (each release: semver, date, breaking-change flag, 1-line summary, added/changed/fixed counts), a `--since v1.2.0` filter, and a `--version v2.0.0` drill-down for the full notes of one release

**Why agents need it:**
An agent upgrading a dependency reads the full CHANGELOG.md for context — large projects (React, Next.js, TypeScript) have 50,000-300,000 token changelogs. The agent needs to answer "what broke between v14 and v15?" — a question a 2,000-token timeline digest answers trivially.

**Token savings story:**
Next.js CHANGELOG.md: ≈ 180,000 tokens raw → digest ≈ 2,500 tokens = **98.6% reduction**. Plus drill-down for specific version: ≈ 800 tokens.

**Differentiation:**
`changelog-parser` (npm) parses the file but returns raw objects with full text — no compression, no token counting, no MCP. `changelogai` *generates* changelogs from git history. releasemap *digests existing changelogs* for agent consumption. Clearly differentiated.

**Implementation difficulty:** LOW  
- `CHANGELOG.md` parsing: use `@release-notes/changelog-parser` (MIT, pure JS) as the foundation
- GitHub Releases: GitHub API `/repos/{owner}/{repo}/releases` (same fetch pattern as devpulse)
- npm registry: `https://registry.npmjs.org/{package}` returns full version history in a single JSON payload
- Breaking-change detection: scan for `BREAKING`, `!`, `major` keywords in section headers
- Disk cache with TTL (same pattern as devpulse)

**Key npm dependencies:** `@release-notes/changelog-parser`, `gpt-tokenizer`

**Existing similar tools:** `changelog-parser` (no digest/compression), `changelogai` (generates, not digests). Gap is real.

---

## Ranked Proposal (Value-to-Effort)

| Rank | Skill | Value | Effort | Score |
|------|-------|-------|--------|-------|
| 1 | **apiscout** | Very High | Low | 5/5 |
| 2 | **auditsnap** | High | Low | 4.5/5 |
| 3 | **diffdigest** | High | Low-Med | 4/5 |
| 4 | **releasemap** | High | Low | 4/5 |
| 5 | **schemamap** | High | Med | 3.5/5 |
| 6 | **errorlens** | Med-High | Med | 3/5 |
| 7 | **depgraph** | Med | Med | 2.5/5 |

### Scoring rationale

**apiscout** (#1): The token-waste problem is massive (entire specs dumped into context), the problem is well-understood, and the implementation is a pure JSON/YAML walk with no native dependencies. The output format is a natural extension of devpulse (same `--json/--md/--text/--stats` contract). No open-source standalone equivalent exists. Highest value-to-effort in the set.

**auditsnap** (#2): npm audit is a daily workflow for every Node.js developer and agent alike. The implementation is trivially `child_process` + JSON parse + sort-by-severity. The token waste story is concrete and demonstrable. Very quick win.

**diffdigest** (#3): Reviewing diffs is a core agent workflow and the token waste is enormous for large PRs. `parse-diff` does the heavy lifting. The GitHub PR integration reuses devpulse auth patterns. Risk signals add genuine value beyond raw compression.

**releasemap** (#4): Tied with diffdigest for effort (both LOW-ish), but slightly lower frequency — agents need to understand changelogs mostly during upgrades, not on every task. Still a clear gap with strong token savings story.

**schemamap** (#5): Very high value for backend agents, but the multi-format input (Prisma vs Drizzle vs raw SQL vs live DB) adds complexity. Prisma-only MVP reduces this to medium effort and covers the majority of the target audience.

**errorlens** (#6): High value for debugging workflows, but multi-format detection (Node.js vs Python vs structured JSON vs Sentry) is the hard part. A Node.js-only MVP is medium effort; full coverage is high.

**depgraph** (#7): Valid skill, but the space is crowded (madge, CodeGraphContext, GitNexus) and the use case overlaps heavily with codemap. It could become a `codemap --deps` flag rather than a standalone skill, reducing its ranking as a separate candidate.

---

## Top 3 Recommendations

### Build first: `apiscout`

The clearest gap in the ecosystem. OpenAPI specs are enormous, agents need to understand APIs constantly, and no open-source standalone CLI+lib+MCP digest tool exists. The implementation is a weekend of work (YAML parse + path walker + formatter). It would immediately become the third and most widely applicable skill in the collection — most agents interact with external APIs far more often than they do git history or dependency graphs.

### Build second: `auditsnap`

The simplest possible implementation with the most universal applicability. Every Node.js project has dependencies with vulnerabilities; every agent doing `npm install` or code maintenance will benefit. It also demonstrates the collection's breadth: devpulse (remote repos), codemap (local code structure), auditsnap (project health/security). Three skills that cover a complete "understand this project" workflow.

### Build third: `diffdigest`

After apiscout and auditsnap, diffdigest rounds out the "understanding changes" use case that devpulse's recent-commits section hints at but doesn't go deep on. It also enables agentic PR review workflows without requiring a full CI integration — a strong differentiator vs pr-agent and ai-review. The `parse-diff` library makes the implementation straightforward.

---

## Notes on Shared Infrastructure

All three recommended skills (`apiscout`, `auditsnap`, `diffdigest`) can reuse:
- The devpulse fetch/cache pattern (URL fetch + TTL disk cache + ETag)
- The `gpt-tokenizer` token estimation approach
- The `--json/--md/--text/--stats/--max-tokens` CLI contract already established
- The MCP skill wrapper pattern from `skills/mcp/`

This means each new skill is primarily domain logic + formatter, with the scaffolding already proven.

---

*Research sources: Waxell AI Token Budget Enforcement 2026, Factory.ai Context Window Problem, Medium/@jakenesler context compression post, arxiv Lore paper (2603.15566), skywork.ai OpenAPI Schema Explorer, github.com/mkearl/dependency-mcp, github.com/tirth8205/code-review-graph, Socket.dev Axios compromise analysis, stackgen.com MCP Benefits for SREs, npm audit docs.*
