# devpulse

[![npm version](https://img.shields.io/npm/v/devpulse?style=flat-square)](https://www.npmjs.com/package/devpulse)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](./LICENSE)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-blue?style=flat-square)](https://nodejs.org)
[![CI](https://img.shields.io/github/actions/workflow/status/0xZaern/agent-tools/ci.yml?branch=main&style=flat-square)](https://github.com/0xZaern/agent-tools/actions)

**Token-efficient GitHub repository context for AI agents and CLIs.**

Stop pasting raw GitHub links or crawling files. `devpulse` fetches a GitHub repo and returns a clean, structured digest — metadata, language breakdown, pruned file tree, README excerpt, key file summaries, and recent commits — in one command.

---

## Why

Reading a repo without devpulse means feeding an AI agent every source file it needs to understand the project. For `expressjs/express` that costs roughly **176,653 tokens**; the devpulse digest costs **~6,698 tokens** — **96% less**. For a smaller repo like `sindresorhus/slugify` the savings are still ~69% (6,978 → 2,156 tokens).

Under the hood, devpulse:

- Sums the actual byte sizes of all text/source blobs (same exclusion list used for the tree) to compute what raw reading would cost
- Strips badge noise, contributor tables, and link spam from READMEs
- Prunes `node_modules`, `dist`, lockfiles, binaries, and build artifacts from the file tree
- Packs metadata, languages, key-file summaries, and recent commits into one compact JSON instead of multiple verbose API responses

---

## Install

```bash
# Global CLI
npm install -g devpulse

# Or run without installing
npx devpulse repo facebook/react
```

**Requires Node.js 18 or higher.**

---

## CLI Usage

```
devpulse repo <owner/name> [options]

Options:
  --json            Compact JSON output (default — ideal for piping)
  --md              Human-readable Markdown
  --text            Minimal plain text
  --stats           Print only the token-savings summary
  --max-tokens N    Trim digest to approximately N tokens
  --no-cache        Skip disk cache, always fetch fresh
  --token X         GitHub token (overrides GITHUB_TOKEN env var)
  -h, --help        Show help
  --version         Show version
```

### Examples

```bash
# Default JSON output — pipe directly to an agent
devpulse repo facebook/react

# Human-readable Markdown for reading in the terminal
devpulse repo facebook/react --md

# Check token savings
devpulse repo facebook/react --stats

# Fit within a token budget (trims recentActivity, then README, then tree)
devpulse repo facebook/react --max-tokens 3000

# No cache, custom token
devpulse repo my-org/private-repo --no-cache --token ghp_xxx

# Pipe JSON into jq
devpulse repo expressjs/express | jq '.metadata'
```

### Sample output

```
$ devpulse repo expressjs/express --stats
expressjs/express: digest ~6,698 tokens | raw ~176,653 tokens | 96% smaller
```

```
$ devpulse repo expressjs/express --md
# expressjs/express

> Fast, unopinionated, minimalist web framework for node.

**Stars** 69,105 · **Forks** 23,618 · **Open issues** 217 · **Language** JavaScript · **License** MIT

**Topics:** express, javascript, nodejs, server

**Last push:** 2026-06-02

## Languages

- **JavaScript** 100.0%

## README (excerpt)

Fast, unopinionated, minimalist web framework for Node.js.

## Key Files

- `package.json` — name=express version=5.2.1 deps=28 devDeps=16 scripts=[lint, test, test-ci] topDeps=[accepts, body-parser, cookie]
- `.github/workflows` — CI workflows: [ci, codeql, legacy, scorecard]
- `index.js` — present

## File Tree

  .editorconfig
  .eslintrc.yml
d .github
  .github/workflows/ci.yml
  index.js
d lib
  lib/application.js
  lib/express.js
  lib/request.js
  lib/response.js
  package.json
d test
  ... and 278 more entries

## Recent Commits

- `dae209a` 2026-05-17 **dependabot[bot]** — build(deps): bump github/codeql-action
- `777001a` 2026-05-17 **dependabot[bot]** — build(deps): bump actions/upload-artifact

---
_digest ~6,698 tokens · raw would be ~176,653 tokens · **96% smaller**_
```

---

## Library Usage

```typescript
import { getRepoDigest, formatMarkdown, DigestOptions } from 'devpulse';

const opts: DigestOptions = {
  token: process.env.GITHUB_TOKEN,   // optional but recommended
  maxTokens: 4000,                   // trim to budget if needed
  noCache: false,                    // use disk cache (default)
};

const digest = await getRepoDigest('facebook/react', opts);

// Use the structured data directly
console.log(digest.metadata.stars);         // 230000
console.log(digest.languages[0].name);     // "JavaScript"
console.log(digest.readme.excerpt);         // First ~600 chars of README
console.log(digest.keyFiles[0].summary);    // "name=react version=19.1.0 deps=..."
console.log(digest.stats.savedPercent);     // 72

// Or render to a format
const md = formatMarkdown(digest);
const json = formatJson(digest);
const txt = formatText(digest);
```

---

## Output Schema

```typescript
interface RepoDigest {
  metadata: {
    owner: string;
    name: string;
    fullName: string;          // "owner/name"
    description: string | null;
    stars: number;
    forks: number;
    primaryLanguage: string | null;
    license: string | null;    // SPDX id, e.g. "MIT"
    topics: string[];
    lastPush: string;          // ISO 8601
    openIssues: number;
  };

  languages: Array<{
    name: string;
    bytes: number;
    share: number;             // 0..1
  }>;

  fileTree: Array<{
    path: string;              // relative to repo root
    type: "blob" | "tree";
  }>;

  readme: {
    full: string;              // normalized (badges stripped, blank lines collapsed)
    excerpt: string;           // first ~600 chars of meaningful content
  };

  keyFiles: Array<{
    path: string;              // e.g. "package.json", "Dockerfile"
    summary: string;           // compact human-readable summary
  }>;

  recentActivity: Array<{
    sha: string;               // 7-char short SHA
    message: string;           // first line only
    date: string;              // ISO 8601
    author: string;
  }>;

  stats: {
    tokenEstimate: number;     // approx tokens in this digest (chars / 4)
    rawEstimate: number;       // approx tokens of equivalent raw paste
    savedPercent: number;      // (rawEstimate - tokenEstimate) / rawEstimate × 100
  };

  generatedAt: string;         // ISO 8601
  cached: boolean;
}
```

### Token budget trimming

When `maxTokens` is set, the digest is trimmed in this order (least impactful first):

1. `recentActivity` dropped
2. `readme.excerpt` shortened to ~200 chars
3. `fileTree` pruned to first 50 entries
4. `readme.full` dropped (only excerpt kept)

### File tree filtering

The following are always excluded from the tree:

- Directories: `node_modules`, `dist`, `build`, `.git`, `vendor`, `.next`, `coverage`, `__pycache__`, `.turbo`, `.output`
- Lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `poetry.lock`, `go.sum`, etc.
- Binary/image extensions: `.png`, `.jpg`, `.gif`, `.svg`, `.woff`, `.pdf`, `.zip`, etc.
- Depth capped at 6 levels; total entries capped at 300

---

## GitHub Token (optional)

Without a token: 60 requests/hour (GitHub unauthenticated limit).  
With a token: 5,000 requests/hour.

```bash
export GITHUB_TOKEN=ghp_yourtoken
devpulse repo facebook/react
```

Or pass inline: `devpulse repo facebook/react --token ghp_yourtoken`

Create a token at https://github.com/settings/tokens — no scopes required for public repositories.

---

## Caching

Digests are cached on disk at `~/.cache/devpulse/<owner>/<name>.json` with a 60-minute TTL. Use `--no-cache` to bypass.

---

## License

MIT — see [LICENSE](./LICENSE).
