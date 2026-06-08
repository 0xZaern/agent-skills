# auditsnap

Hand an AI agent a ranked summary of your npm vulnerabilities instead of the full audit blob.

`auditsnap` runs `npm audit --json` (or reads it from stdin) and produces a compact digest: severity counts, vulnerabilities sorted by severity with fix-available flags, and direct/transitive labels — at a fraction of the raw token cost.

---

## Install

```sh
npx auditsnap
```

Or as a library:

```sh
npm install auditsnap
```

---

## CLI Usage

```
auditsnap [dir] [options]
npm audit --json | auditsnap [options]

ARGUMENTS
  dir               Directory to run npm audit in (defaults to current directory)

OPTIONS
  --json            Output as compact JSON (default, agent-friendly)
  --md              Output as human-readable Markdown
  --text            Output as plain text
  --stats           Print only the token-savings summary line
  --max-tokens N    Trim the digest to approximately N tokens
  -h, --help        Show help
  --version         Show version
```

### Examples

```sh
# Run in current directory
auditsnap

# Specific project as Markdown
auditsnap ./my-project --md

# Just the savings summary
auditsnap . --stats

# Pipe existing audit output
npm audit --json | auditsnap --text

# Pipe into an agent
auditsnap --json | some-agent-cli
```

### Sample output (--stats)

```
audit: digest ~620 tokens | raw ~84,210 tokens | 99% smaller | 38 total (2c/8h/15m/13l)
```

### Sample output (--md, trimmed)

```markdown
# auditsnap

> digest ~620 tokens · raw ~84,210 tokens · **99% smaller**
> 38 advisories · 22 fixable · 16 unfixable

## Summary

2 critical, 8 high, 15 moderate, 13 low

## Vulnerabilities

- **lodash** HIGH — Prototype Pollution in lodash (`<4.17.21`)
  - direct · fix available · via: GHSA-p6mc-m468-83gw
- **minimist** CRITICAL — Prototype Pollution (`<1.2.6`)
  - transitive · fix available · via: GHSA-xvch-5gv4-984h
```

---

## Library Usage

```ts
import { getAuditDigest } from 'auditsnap';

// run npm audit in a directory
const digest = await getAuditDigest({ dir: './my-project' });

// or pipe: npm audit --json | your-script
// (when stdin is a pipe, auditsnap reads it automatically)
const digest = await getAuditDigest();

// digest.counts          — { critical, high, moderate, low, info, total }
// digest.vulnerabilities — sorted by severity, direct first
// digest.fixable         — count fixable with npm audit fix
// digest.stats           — token savings breakdown
console.log(digest.stats);
// { tokenEstimate: 620, rawEstimate: 84210, savedPercent: 99, totalAdvisories: 38, fixableCount: 22 }
```

### With options

```ts
import { getAuditDigest, formatMarkdown } from 'auditsnap';

const digest = await getAuditDigest({
  dir: './my-project',
  maxTokens: 500,
});

console.log(formatMarkdown(digest));
```

---

## Output schema

```ts
interface AuditDigest {
  counts:          SeverityCounts;  // per-severity totals
  vulnerabilities: VulnEntry[];     // sorted by severity
  fixable:         number;
  unfixable:       number;
  stats:           AuditSnapStats;  // token savings
  generatedAt:     string;          // ISO 8601
}
```

---

## Token savings

Medium Next.js project with 40 vulnerabilities: raw `npm audit --json` ~85k tokens → digest ~800 tokens = **99% reduction**.

---

## License

MIT — see [LICENSE](./LICENSE)
