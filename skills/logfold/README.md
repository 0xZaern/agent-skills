# logfold

Hand an AI agent a compact error digest instead of making it read raw stack traces.

`logfold` reads verbose error logs and stack traces (Node.js, Python, Java, or generic format), deduplicates repeated errors, folds `node_modules` / stdlib / `site-packages` noise out of each stack trace, groups errors by signature, counts occurrences, and records first/last timestamps — producing a structured digest at a fraction of the raw log token cost.

---

## Install

```sh
npx logfold
```

Or as a library:

```sh
npm install logfold
```

---

## CLI Usage

```
logfold [file] [options]
cat app.log | logfold [options]

ARGUMENTS
  file              Path to a log file (or omit to read stdin)

OPTIONS
  --json            Output as compact JSON (default, agent-friendly)
  --md              Output as human-readable Markdown
  --text            Output as plain text
  --stats           Print only the token-savings summary line
  --top N           Show only the top N most-frequent error groups
  --max-tokens N    Trim the digest to approximately N tokens
  -h, --help        Show help
  --version         Show version
```

### Examples

```sh
# Digest a log file as JSON (default)
logfold ./app.log

# Human-readable Markdown
logfold ./app.log --md

# Just the savings summary
logfold ./app.log --stats

# Top 5 errors only
logfold ./app.log --top 5 --text

# Pipe from stdin
cat /var/log/app.log | logfold --json

# Fit into a token budget and pipe to an agent
logfold ./crash.log --max-tokens 1000 --json | some-agent-cli
```

### Sample output (--stats)

```
logfold [node]: digest ~420 tokens | raw ~15,800 tokens | 97% smaller | 83 occurrences -> 4 groups
```

### Sample output (--text, trimmed)

```
LOGFOLD [node]
STATS: digest ~420 tokens | raw ~15,800 tokens | 97% smaller
OCCURRENCES: 83 raw -> 4 groups

[1] TypeError x47 | sig: TypeError@src/server.ts:128
    msg: Cannot read properties of undefined (reading 'id')
    when: 2024-01-15T12:30:01Z -> 2024-01-15T13:45:22Z
    at Object.getUser (src/services/user.ts:45)
    at async Router.handle (src/routes/api.ts:128)
    ... 11 noise frames folded

[2] RangeError x12 | sig: RangeError@src/utils/paginate.ts:22
    msg: Invalid offset: must be >= 0
    at paginate (src/utils/paginate.ts:22)
    ... 8 noise frames folded
```

---

## Library Usage

```ts
import { getLogDigest } from 'logfold';

// from a file
const digest = await getLogDigest('./app.log');

// from a string (pass null for source and pipe via stdin, or use the raw text directly)
// digest.language    — "node" | "python" | "java" | "generic"
// digest.groups      — deduplicated error groups, sorted by count desc
// digest.stats       — token savings breakdown
console.log(digest.stats);
// { tokenEstimate: 420, rawEstimate: 15800, savedPercent: 97, totalOccurrences: 83, uniqueGroups: 4, language: 'node' }
```

### With options

```ts
import { getLogDigest, formatMarkdown } from 'logfold';

const digest = await getLogDigest('./crash.log', {
  top: 5,           // only the 5 most frequent errors
  maxTokens: 1000,  // trim to budget
});

console.log(formatMarkdown(digest));
```

---

## Output schema

```ts
interface LogDigest {
  language:    LogLanguage;   // "node" | "python" | "java" | "generic"
  groups:      ErrorGroup[];  // deduplicated groups, sorted by count desc
  stats:       LogFoldStats;  // token savings
  generatedAt: string;        // ISO 8601
}

interface ErrorGroup {
  signature:      string;           // stable dedup key (errorType + top frame)
  count:          number;           // occurrences seen
  representative: ErrorOccurrence;  // first/canonical occurrence
  firstSeen?:     string;           // timestamp
  lastSeen?:      string;           // timestamp
}

interface ErrorOccurrence {
  errorType:        string;        // e.g. "TypeError"
  message:          string;        // error message (≤200 chars)
  timestamp?:       string;
  frames:           StackFrame[];  // app-code frames only (noise folded)
  foldedFrameCount: number;        // how many noise frames were collapsed
}
```

---

## Supported log formats

| Format | Detection | Stack frame pattern |
|--------|-----------|---------------------|
| **Node.js** | `at fn (file:line:col)` frames | `    at <identifier> (<file>:<line>:<col>)` |
| **Python** | `Traceback (most recent call last):` | `  File "foo.py", line N, in fn` |
| **Java** | `at pkg.Class.method(File.java:N)` | `\tat pkg.Class.method(File.java:42)` |
| **Generic** | Fallback | Indented lines after `Error:` / `Exception:` |

---

## Frame folding rules

Frames from the following are always folded (collapsed into a count):

- **Node.js**: `node_modules/`, `node:internal`, `node:*`, `processTicksAndRejections`
- **Python**: `site-packages`, `dist-packages`, `lib/python*`, stdlib paths
- **Java**: `java.*`, `javax.*`, `org.springframework.*`, `io.netty.*`, `reactor.*`, `org.apache.*`
- **Generic**: anything matching the above patterns

---

## Token savings

Typical CI failure log (15,000 tokens raw) → digest ~400 tokens = **97% reduction**.

---

## License

MIT — see [LICENSE](./LICENSE)
