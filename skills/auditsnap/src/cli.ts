#!/usr/bin/env node
/**
 * auditsnap CLI
 *
 * Usage:
 *   auditsnap [dir] [--json|--md|--text] [--stats] [--max-tokens N]
 *   npm audit --json | auditsnap [--json|--md|--text] [--stats]
 *   auditsnap --version
 *   auditsnap --help
 */

import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { getAuditDigest } from "./lib/digest.js";
import { formatJson, formatMarkdown, formatText } from "./lib/format/index.js";
import { AuditSnapOptions } from "./lib/types.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pkg = require("../package.json") as { version: string; name: string };

const HELP = `
auditsnap v${pkg.version} — token-efficient npm audit digest for AI agents

USAGE
  auditsnap [dir] [options]
  npm audit --json | auditsnap [options]

ARGUMENTS
  dir               Directory to run npm audit in (defaults to current directory)

OPTIONS
  --json            Output as compact JSON (default)
  --md              Output as human-readable Markdown
  --text            Output as plain text
  --stats           Print only the token-savings summary line
  --max-tokens N    Trim the digest to approximately N tokens
  -h, --help        Show this help message
  --version         Show version

EXAMPLES
  auditsnap
  auditsnap ./my-project --md
  auditsnap . --stats
  npm audit --json | auditsnap --text
  auditsnap ./my-project --max-tokens 500 --json | some-agent-cli

NOTES
  - When stdin is piped, reads npm audit --json output directly (no child process spawned).
  - When running from a directory, spawns npm audit --json internally.
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
      "max-tokens": { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values["version"]) {
    process.stdout.write(`auditsnap ${pkg.version}\n`);
    process.exit(0);
  }

  if (values["help"]) {
    process.stdout.write(HELP + "\n");
    process.exit(0);
  }

  let format: AuditSnapOptions["format"] = "json";
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

  const dir = positionals[0] ?? ".";

  const opts: AuditSnapOptions = { format, maxTokens, dir };

  try {
    process.stderr.write(`Running audit...\n`);

    const digest = await getAuditDigest(opts);

    if (values["stats"]) {
      const { stats, counts } = digest;
      process.stdout.write(
        `audit: digest ~${stats.tokenEstimate.toLocaleString()} tokens | ` +
          `raw ~${stats.rawEstimate.toLocaleString()} tokens | ` +
          `${stats.savedPercent}% smaller | ` +
          `${counts.total} total (${counts.critical}c/${counts.high}h/${counts.moderate}m/${counts.low}l)\n`
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
