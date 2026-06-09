# secretscan

Pre-commit secret scanner for AI agents. Scans staged or tracked files for leaked credentials — API keys, tokens, private keys, passwords, and connection strings — before they reach the remote.

Secrets are **never printed in full**. Output always masks to first/last 4 characters.

---

## Install

```sh
npx secretscan
```

Or as a library:

```sh
npm install secretscan
```

---

## CLI Usage

```
secretscan [dir] [options]

ARGUMENTS
  dir               Git repo directory to scan (defaults to current directory)

SOURCE (which files to scan)
  --staged          Only staged files — best for pre-commit hooks (default)
  --tracked         All files tracked by git
  --all             All files in the tree, respecting .gitignore

FORMAT
  --json            Output as compact JSON (default, agent-friendly)
  --md              Output as human-readable Markdown
  --text            Output as plain text

DETECTION
  --entropy              Enable Shannon entropy check for high-entropy strings
  --entropy-threshold N  Minimum entropy (bits/char) to flag (default: 4.5)

OTHER
  -h, --help        Show help
  --version         Show version
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | No secrets found — safe to commit |
| `1` | One or more secrets detected |
| `2` | Error (not a git repo, I/O failure, etc.) |

### Pre-commit hook

Add to `.git/hooks/pre-commit`:

```sh
#!/bin/sh
npx secretscan --staged --text
```

### Examples

```sh
# Scan staged files (default — ideal for pre-commit)
secretscan

# Specific project directory, Markdown output
secretscan ./my-project --md

# Scan all tracked files
secretscan --tracked --text

# Enable entropy detection
secretscan --entropy --entropy-threshold 4.8

# Pipe into an agent
secretscan --staged --json | some-agent-cli
```

### Sample output (--text, clean)

```
SECRETSCAN
SOURCE: staged | FILES: 12 | FINDINGS: 0

no secrets found — safe to commit.

SCANNED: 2025-09-15 14:32:00 UTC
```

### Sample output (--text, dirty)

```
SECRETSCAN
SOURCE: staged | FILES: 12 | FINDINGS: 2

FINDINGS (2):
  [CRITICAL] src/config/aws.ts:8
    AWS Access Key ID: AKIA********MPLE
  [HIGH] src/db.ts:3
    Connection String / DSN: post********3000

SCANNED: 2025-09-15 14:32:00 UTC
```

---

## What gets detected

| Pattern | Severity | Example match |
|---------|----------|---------------|
| AWS Access Key ID | critical | `AKIA...` |
| AWS Secret Access Key | critical | `aws_secret_key = ...` |
| OpenAI API Key | critical | `sk-proj-...` |
| Stripe Secret Key | critical | `sk_live_...` |
| GitHub Token | critical | `ghp_...`, `github_pat_...` |
| JWT | high | `eyJ...` three-part token |
| Private Key Block | critical | `-----BEGIN ... PRIVATE KEY-----` |
| Bearer Token | high | `Authorization: Bearer ...` |
| Hardcoded Password | high | `password = "..."` |
| Connection String | high | `postgres://user:pass@host/db` |
| .env File Staged | high | `.env` or `.env.local` in staging area |
| High-Entropy String | medium | opt-in via `--entropy` |

---

## Library Usage

```ts
import { getSecretScanDigest } from 'secretscan';

const digest = await getSecretScanDigest({
  dir: './my-project',
  source: 'staged',   // "staged" | "tracked" | "all"
});

if (!digest.clean) {
  console.error(`Found ${digest.stats.findingsCount} secret(s)`);
  for (const f of digest.findings) {
    console.error(`${f.file}:${f.line} — ${f.label}: ${f.masked}`);
  }
  process.exit(1);
}
```

### With entropy detection

```ts
import { getSecretScanDigest, formatMarkdown } from 'secretscan';

const digest = await getSecretScanDigest({
  dir: '.',
  source: 'staged',
  entropy: true,
  entropyThreshold: 4.8,
});

console.log(formatMarkdown(digest));
```

---

## Output schema

```ts
interface SecretScanDigest {
  clean:    boolean;        // true = no findings, safe to commit
  findings: Finding[];      // sorted by severity, then file, then line
  stats:    SecretScanStats;
}

interface Finding {
  file:     string;         // absolute path
  line:     number;         // 1-based; 0 for file-level findings
  kind:     SecretKind;
  severity: "critical" | "high" | "medium" | "low";
  label:    string;         // human-readable type name
  masked:   string;         // first 4 + last 4 chars visible only
}
```

---

## License

MIT — see [LICENSE](./LICENSE)
