# codemap

Hand an AI agent a map of a codebase instead of making it read every file.

`codemap` walks a local directory, uses the TypeScript compiler API to extract exported symbols and their one-line signatures from source files, and produces a compact structured output that gives an LLM a complete picture of the project — at a fraction of the raw token cost.

---

## Install

```sh
# Run without installing
npx codemap

# Install globally
npm install -g codemap
```

Or as a library:

```sh
npm install codemap
```

---

## CLI Usage

```
codemap [path] [options]

ARGUMENTS
  path              Root directory to map (defaults to current directory)

OPTIONS
  --json            Output as compact JSON (default, agent-friendly)
  --md              Output as human-readable Markdown
  --text            Output as plain text
  --stats           Print only the token-savings summary line
  --max-tokens N    Trim the map to approximately N tokens
  --no-color        Suppress ANSI color output
  -h, --help        Show help
  --version         Show version
```

### Examples

```sh
# Map the current directory as JSON (default)
codemap

# Map a specific project as Markdown
codemap ./my-project --md

# Print just the savings summary
codemap . --stats

# Fit the map into a 4000-token budget
codemap ./src --max-tokens 4000

# Pipe into an LLM workflow
codemap ./my-project --json | some-agent-cli
```

### Sample output (--stats)

```
my-project: map ~1,030 tokens | raw ~9,055 tokens | 89% smaller | 12 files (10 source)
```

### Sample output (--md, trimmed)

```markdown
# codemap: my-project

> digest ~1,030 tokens · raw would be ~9,055 tokens · **89% smaller**
> 12 files analysed · 10 source files

## File Tree

```
d src
d src/lib
d src/lib/format
  src/cli.ts
  src/lib/codemap.ts
  src/lib/extractor.ts
  src/lib/index.ts
  src/lib/types.ts
  src/lib/walker.ts
```

## Exports by File

### `src/lib/codemap.ts`

- **function** `async function getCodemap(rootDir: string, opts: CodemapOptions): Promise<Codemap>`
  - _imports: node:fs, node:path, ./walker.js, ./extractor.js, ./types.js_

### `src/lib/types.ts`

- **interface** `interface CodemapOptions { format?: "json" | "md" | "text"; maxTokens?: number; noColor?: boolean }`
- **interface** `interface Codemap { projectName: string; tree: TreeNode[]; files: FileAnalysis[]; ... }`
```

---

## Library Usage

```ts
import { getCodemap } from 'codemap';

const map = await getCodemap('./my-project');

// map.projectName  — from package.json or dir basename
// map.tree         — pruned file tree (dirs + files)
// map.files        — per-file analyses with exported symbols
// map.stats        — token savings breakdown
console.log(map.stats);
// { tokenEstimate: 1030, rawEstimate: 9055, savedPercent: 89, fileCount: 12, sourceFileCount: 10 }

// Format for output
import { formatJson, formatMarkdown, formatText } from 'codemap';

const json = formatJson(map);     // compact JSON
const md   = formatMarkdown(map); // human-readable
const txt  = formatText(map);     // plain text
```

### With options

```ts
import { getCodemap } from 'codemap';

const map = await getCodemap('./my-project', {
  format: 'md',        // hint for callers (does not affect the returned Codemap object)
  maxTokens: 4000,     // trims output to fit this budget
  noColor: true,
});
```

---

## Output Schema

```ts
interface Codemap {
  projectName: string;       // from package.json name, or directory basename
  tree: TreeNode[];          // pruned file/dir tree
  files: FileAnalysis[];     // per-file details
  stats: CodemapStats;       // token savings
  generatedAt: string;       // ISO 8601 timestamp
}

interface TreeNode {
  path: string;              // relative to rootDir
  type: 'file' | 'dir';
}

interface FileAnalysis {
  path: string;              // relative to rootDir
  sizeBytes: number;
  exports?: SymbolSignature[]; // only for TS/JS source files
  imports?: string[];          // module specifiers imported by this file
}

interface SymbolSignature {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'variable';
  signature: string;         // one-line signature (no body)
}

interface CodemapStats {
  tokenEstimate: number;     // size of codemap output / 4
  rawEstimate: number;       // sum of source file bytes / 4
  savedPercent: number;      // reduction vs. reading raw (clamped >= 0)
  fileCount: number;
  sourceFileCount: number;
}
```

---

## What gets excluded

- `node_modules`, `dist`, `build`, `.git`, `.next`, `coverage`, `vendor`
- Lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, etc.
- Binary/image files: `.png`, `.jpg`, `.woff`, `.wasm`, `.db`, `.map`, etc.
- Files larger than 500 KB
- Paths matched by `.gitignore` (if present in rootDir)

---

## License

MIT — see [LICENSE](./LICENSE)
