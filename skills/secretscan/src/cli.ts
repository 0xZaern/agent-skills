#!/usr/bin/env node
/**
 * secretscan CLI
 *
 * Usage:
 *   secretscan [dir] [--staged|--tracked|--all] [--json|--md|--text] [--entropy] [--entropy-threshold N]
 *   secretscan --version
 *   secretscan --help
 */

import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { getSecretScanDigest } from "./lib/digest.js";
import { formatJson, formatMarkdown, formatText } from "./lib/format/index.js";
import { SecretScanOptions } from "./lib/types.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pkg = require("../package.json") as { version: string; name: string };

const HELP = `
secretscan v${pkg.version} — pre-commit secret scanner for AI agents

USAGE
  secretscan [dir] [options]

ARGUMENTS
  dir               Git repo directory to scan (defaults to current directory)

SOURCE (which files to scan)
  --staged          Only staged files — best for pre-commit hooks (default)
  --tracked         All files tracked by git
  --all             All files in the tree, respecting .gitignore

FORMAT
  --json            Output as compact JSON (default)
  --md              Output as human-readable Markdown
  --text            Output as plain text

DETECTION
  --entropy              Enable Shannon entropy check for high-entropy strings
  --entropy-threshold N  Minimum entropy (bits/char) to flag (default: 4.5)

OTHER
  -h, --help        Show this help message
  --version         Show version

EXAMPLES
  secretscan
  secretscan ./my-project --text
  secretscan --staged --md
  secretscan --tracked --entropy --entropy-threshold 4.8
  secretscan --all --json | some-agent-cli

EXIT CODES
  0   No secrets found — safe to commit.
  1   One or more secrets detected.
  2   Error (not a git repo, I/O failure, etc.)

NOTES
  - Full secret values are never printed. Output shows first/last 4 chars only.
  - Binary files, files > 1 MB, and lock files are skipped automatically.
  - stdout carries the digest; stderr carries progress messages.
`.trim();

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      json: { type: "boolean" },
      md: { type: "boolean" },
      text: { type: "boolean" },
      staged: { type: "boolean" },
      tracked: { type: "boolean" },
      all: { type: "boolean" },
      entropy: { type: "boolean" },
      "entropy-threshold": { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values["version"]) {
    process.stdout.write(`secretscan ${pkg.version}\n`);
    process.exit(0);
  }

  if (values["help"]) {
    process.stdout.write(HELP + "\n");
    process.exit(0);
  }

  // Format
  let format: SecretScanOptions["format"] = "json";
  if (values["md"]) format = "md";
  else if (values["text"]) format = "text";
  else if (values["json"]) format = "json";

  // Source
  let source: SecretScanOptions["source"] = "staged";
  if (values["all"]) source = "all";
  else if (values["tracked"]) source = "tracked";
  else if (values["staged"]) source = "staged";

  // Entropy threshold
  const thresholdRaw =
    typeof values["entropy-threshold"] === "string"
      ? values["entropy-threshold"]
      : undefined;
  const entropyThreshold = thresholdRaw ? parseFloat(thresholdRaw) : undefined;
  if (thresholdRaw && (isNaN(entropyThreshold!) || entropyThreshold! <= 0)) {
    process.stderr.write(
      `Error: --entropy-threshold must be a positive number, got "${thresholdRaw}"\n`
    );
    process.exit(2);
  }

  const dir = positionals[0] ?? ".";

  const opts: SecretScanOptions = {
    format,
    source,
    dir,
    entropy: values["entropy"] === true,
    entropyThreshold,
  };

  try {
    process.stderr.write(`Scanning ${source} files in "${dir}"...\n`);

    const digest = await getSecretScanDigest(opts);

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

    if (digest.clean) {
      process.stderr.write(
        `No secrets found. ${digest.stats.filesScanned} file(s) scanned.\n`
      );
      process.exit(0);
    } else {
      process.stderr.write(
        `Found ${digest.stats.findingsCount} potential secret(s) in ${digest.stats.filesScanned} file(s). Review and remediate before committing.\n`
      );
      process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(2);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(2);
});
