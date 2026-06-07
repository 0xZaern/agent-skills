#!/usr/bin/env node
/**
 * codemap CLI
 *
 * Usage:
 *   codemap [path] [--json|--md|--text] [--max-tokens N] [--stats]
 *   codemap --version
 *   codemap --help
 */

import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { getCodemap } from "./lib/codemap.js";
import { formatJson, formatMarkdown, formatText } from "./lib/format/index.js";
import { CodemapOptions } from "./lib/types.js";

// ---------------------------------------------------------------------------
// Version from package.json
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pkg = require("../package.json") as { version: string; name: string };

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `
codemap v${pkg.version} — token-efficient local codebase map for AI agents & LLMs

USAGE
  codemap [path] [options]

ARGUMENTS
  path              Root directory to map (defaults to current directory)

OPTIONS
  --json            Output as compact JSON (default)
  --md              Output as human-readable Markdown
  --text            Output as plain text
  --stats           Print only the token-savings summary line
  --max-tokens N    Trim the map to approximately N tokens
  --no-color        Suppress ANSI color output
  -h, --help        Show this help message
  --version         Show version

EXAMPLES
  codemap
  codemap ./my-project --md
  codemap . --stats
  codemap ./src --max-tokens 4000
  codemap ./my-project --json | some-agent-cli

NOTES
  - Respects .gitignore if present in the root directory.
  - Excludes: node_modules, dist, build, .git, .next, coverage, lockfiles,
    binaries, and files >500 KB.
  - For TypeScript/JavaScript files, extracts exported symbols with one-line
    signatures (function params + return type, class public methods, etc.)
  - JSON output is ideal for piping into AI agents and LLM workflows.
  - stdout carries the map; stderr carries progress messages.
`.trim();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      json: { type: "boolean" },
      md: { type: "boolean" },
      text: { type: "boolean" },
      stats: { type: "boolean" },
      "max-tokens": { type: "string" },
      "no-color": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
    allowPositionals: true,
    strict: false,
  });

  // --version
  if (values["version"]) {
    process.stdout.write(`codemap ${pkg.version}\n`);
    process.exit(0);
  }

  // --help
  if (values["help"]) {
    process.stdout.write(HELP + "\n");
    process.exit(0);
  }

  const targetPath = positionals[0] ?? ".";

  // Determine format
  let format: CodemapOptions["format"] = "json";
  if (values["md"]) format = "md";
  else if (values["text"]) format = "text";
  else if (values["json"]) format = "json";

  const maxTokensRaw =
    typeof values["max-tokens"] === "string" ? values["max-tokens"] : undefined;
  const maxTokens = maxTokensRaw ? parseInt(maxTokensRaw, 10) : undefined;
  if (maxTokensRaw && (isNaN(maxTokens!) || maxTokens! <= 0)) {
    process.stderr.write(
      `Error: --max-tokens must be a positive integer, got "${maxTokensRaw}"\n`
    );
    process.exit(1);
  }

  const opts: CodemapOptions = {
    format,
    maxTokens,
    noColor: values["no-color"] === true,
  };

  try {
    process.stderr.write(`Building codemap for ${targetPath}...\n`);
    const codemap = await getCodemap(targetPath, opts);

    // --stats mode: print only savings summary
    if (values["stats"]) {
      const { stats } = codemap;
      process.stdout.write(
        `${codemap.projectName}: map ~${stats.tokenEstimate.toLocaleString()} tokens | ` +
          `raw ~${stats.rawEstimate.toLocaleString()} tokens | ` +
          `${stats.savedPercent}% smaller | ` +
          `${stats.fileCount} files (${stats.sourceFileCount} source)\n`
      );
      process.exit(0);
    }

    // Format and write to stdout
    let output: string;
    switch (format) {
      case "md":
        output = formatMarkdown(codemap);
        break;
      case "text":
        output = formatText(codemap);
        break;
      default:
        output = formatJson(codemap);
    }

    process.stdout.write(output + "\n");
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
