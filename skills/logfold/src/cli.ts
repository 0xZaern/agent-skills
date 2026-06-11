#!/usr/bin/env node
/**
 * logfold CLI
 *
 * Usage:
 *   logfold [file] [--json|--md|--text] [--stats] [--top N] [--max-tokens N]
 *   cat app.log | logfold [--json|--md|--text] [--stats]
 *   logfold --version
 *   logfold --help
 */

import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { getLogDigest } from "./lib/digest.js";
import { formatJson, formatMarkdown, formatText } from "./lib/format/index.js";
import { LogFoldOptions } from "./lib/types.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pkg = require("../package.json") as { version: string; name: string };

const HELP = `
logfold v${pkg.version} — token-efficient error log digest for AI agents

USAGE
  logfold [file] [options]
  cat app.log | logfold [options]

ARGUMENTS
  file              Path to a log file (or "-" to read stdin explicitly)

OPTIONS
  --json            Output as compact JSON (default, agent-friendly)
  --md              Output as human-readable Markdown
  --text            Output as plain text
  --stats           Print only the token-savings summary line
  --top N           Show only the top N most-frequent error groups
  --max-tokens N    Trim the digest to approximately N tokens
  -h, --help        Show this help message
  --version         Show version

EXAMPLES
  logfold ./app.log
  logfold ./app.log --md
  logfold ./app.log --stats
  logfold ./app.log --top 5 --text
  cat /var/log/app.log | logfold --json
  logfold ./crash.log --max-tokens 1000 --json | some-agent-cli

NOTES
  - Auto-detects Node.js, Python, Java, or generic log format.
  - Deduplicates repeated identical errors and counts occurrences.
  - Folds node_modules / stdlib / site-packages frames to keep only app frames.
  - stdout carries the digest; stderr carries progress messages.
`.trim();

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      json: { type: "boolean" },
      md: { type: "boolean" },
      text: { type: "boolean" },
      stats: { type: "boolean" },
      top: { type: "string" },
      "max-tokens": { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values["version"]) {
    process.stdout.write(`logfold ${pkg.version}\n`);
    process.exit(0);
  }

  if (values["help"]) {
    process.stdout.write(HELP + "\n");
    process.exit(0);
  }

  let format: LogFoldOptions["format"] = "json";
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

  const topRaw = typeof values["top"] === "string" ? values["top"] : undefined;
  const top = topRaw ? parseInt(topRaw, 10) : undefined;
  if (topRaw && (isNaN(top!) || top! <= 0)) {
    process.stderr.write(
      `Error: --top must be a positive integer, got "${topRaw}"\n`
    );
    process.exit(1);
  }

  // Positional arg is optional — fall back to stdin
  const source = positionals[0] ?? null;

  const opts: LogFoldOptions = { format, maxTokens, top };

  try {
    if (source) {
      process.stderr.write(`Reading log from ${source}...\n`);
    } else {
      process.stderr.write("Reading from stdin...\n");
    }

    const digest = await getLogDigest(source, opts);

    if (values["stats"]) {
      const { stats } = digest;
      process.stdout.write(
        `logfold [${stats.language}]: digest ~${stats.tokenEstimate.toLocaleString()} tokens | ` +
          `raw ~${stats.rawEstimate.toLocaleString()} tokens | ` +
          `${stats.savedPercent}% smaller | ` +
          `${stats.totalOccurrences} occurrences -> ${stats.uniqueGroups} groups\n`
      );
      process.exit(0);
    }

    let output: string;
    switch (format) {
      case "md":
        output = formatMarkdown(digest);
        break;
      case "text":
        output = formatText(digest);
        break;
      default:
        output = formatJson(digest);
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
