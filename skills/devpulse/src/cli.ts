#!/usr/bin/env node
/**
 * devpulse CLI
 *
 * Usage:
 *   devpulse repo <owner/name> [--json|--md|--text] [--max-tokens N] [--no-cache] [--token X]
 *   devpulse repo <owner/name> --stats
 *   devpulse --version
 *   devpulse --help
 */

import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { getRepoDigest } from "./lib/digest.js";
import { formatJson, formatMarkdown, formatText } from "./lib/format/index.js";
import { DigestError } from "./lib/github/client.js";
import { DigestOptions } from "./lib/types.js";

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
devpulse v${pkg.version} — token-efficient GitHub repo context for AI agents & CLIs

USAGE
  devpulse repo <owner/name> [options]

OPTIONS
  --json            Output as compact JSON (default)
  --md              Output as human-readable Markdown
  --text            Output as plain text
  --stats           Print only the token-savings summary, not the full digest
  --max-tokens N    Trim the digest to approximately N tokens
  --no-cache        Skip disk cache, always fetch fresh from GitHub
  --token X         GitHub personal access token (overrides GITHUB_TOKEN env var)
  -h, --help        Show this help message
  --version         Show version

EXAMPLES
  devpulse repo facebook/react
  devpulse repo facebook/react --md
  devpulse repo facebook/react --stats
  devpulse repo facebook/react --max-tokens 2000
  devpulse repo facebook/react --no-cache --json
  GITHUB_TOKEN=ghp_xxx devpulse repo torvalds/linux

NOTES
  - Set GITHUB_TOKEN to increase rate limit from 60 to 5000 req/hr.
  - Digests are cached at ~/.cache/devpulse (TTL: 60 minutes).
  - JSON output is ideal for piping into AI agents.
  - stdout carries the digest; stderr carries errors and progress.
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
      "no-cache": { type: "boolean" },
      token: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
    allowPositionals: true,
    strict: false,
  });

  // --version
  if (values["version"]) {
    process.stdout.write(`devpulse ${pkg.version}\n`);
    process.exit(0);
  }

  // --help / -h / no args
  if (values["help"] || positionals.length === 0) {
    process.stdout.write(HELP + "\n");
    process.exit(0);
  }

  const subcommand = positionals[0];
  if (subcommand !== "repo") {
    process.stderr.write(`Unknown command "${subcommand}". Did you mean: devpulse repo <owner/name>\n`);
    process.exit(1);
  }

  const repoArg = positionals[1];
  if (!repoArg) {
    process.stderr.write("Error: missing repo argument. Usage: devpulse repo <owner/name>\n");
    process.exit(1);
  }

  // Determine format
  let format: DigestOptions["format"] = "json";
  if (values["md"]) format = "md";
  else if (values["text"]) format = "text";
  else if (values["json"]) format = "json";

  const maxTokensRaw = typeof values["max-tokens"] === "string" ? values["max-tokens"] : undefined;
  const maxTokens = maxTokensRaw ? parseInt(maxTokensRaw, 10) : undefined;
  if (maxTokensRaw && (isNaN(maxTokens!) || maxTokens! <= 0)) {
    process.stderr.write(`Error: --max-tokens must be a positive integer, got "${maxTokensRaw}"\n`);
    process.exit(1);
  }

  const opts: DigestOptions = {
    format,
    maxTokens,
    noCache: values["no-cache"] === true,
    token: typeof values["token"] === "string" ? values["token"] : undefined,
  };

  try {
    process.stderr.write(`Fetching digest for ${repoArg}...\n`);
    const digest = await getRepoDigest(repoArg, opts);

    // --stats mode: print only savings summary
    if (values["stats"]) {
      const { stats } = digest;
      process.stdout.write(
        `${repoArg}: digest ~${stats.tokenEstimate.toLocaleString()} tokens | ` +
          `raw ~${stats.rawEstimate.toLocaleString()} tokens | ` +
          `${stats.savedPercent}% smaller${digest.cached ? " (cached)" : ""}\n`
      );
      process.exit(0);
    }

    // Format and write to stdout
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
    if (err instanceof DigestError) {
      process.stderr.write(`Error [${err.code}]: ${err.message}\n`);
      process.exit(1);
    }
    // Unexpected error
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Unexpected error: ${message}\n`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
