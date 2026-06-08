#!/usr/bin/env node
/**
 * apiscout CLI
 *
 * Usage:
 *   apiscout <spec> [--json|--md|--text] [--stats] [--max-tokens N] [--endpoint /path]
 *   apiscout --version
 *   apiscout --help
 */

import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { getApiDigest } from "./lib/digest.js";
import { formatJson, formatMarkdown, formatText } from "./lib/format/index.js";
import { ApiScoutOptions } from "./lib/types.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pkg = require("../package.json") as { version: string; name: string };

const HELP = `
apiscout v${pkg.version} — token-efficient OpenAPI/Swagger spec digest for AI agents

USAGE
  apiscout <spec> [options]

ARGUMENTS
  spec              Path to a local OpenAPI/Swagger file, or a URL

OPTIONS
  --json            Output as compact JSON (default)
  --md              Output as human-readable Markdown
  --text            Output as plain text
  --stats           Print only the token-savings summary line
  --max-tokens N    Trim the digest to approximately N tokens
  --endpoint PATH   Drill into one path, e.g. --endpoint /users/{id}
  -h, --help        Show this help message
  --version         Show version

EXAMPLES
  apiscout ./openapi.yaml
  apiscout https://petstore3.swagger.io/api/v3/openapi.json --md
  apiscout ./stripe.yaml --stats
  apiscout ./api.json --endpoint /v1/charges --md
  apiscout ./openapi.yaml --max-tokens 3000 --json | some-agent-cli

NOTES
  - Supports OpenAPI 3.x (YAML/JSON) and Swagger 2.x.
  - Fetches remote specs via HTTPS if a URL is provided.
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
      endpoint: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values["version"]) {
    process.stdout.write(`apiscout ${pkg.version}\n`);
    process.exit(0);
  }

  if (values["help"] || positionals.length === 0) {
    process.stdout.write(HELP + "\n");
    process.exit(0);
  }

  const source = positionals[0]!;

  let format: ApiScoutOptions["format"] = "json";
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

  const opts: ApiScoutOptions = {
    format,
    maxTokens,
    endpoint: typeof values["endpoint"] === "string" ? values["endpoint"] : undefined,
  };

  try {
    process.stderr.write(`Reading spec from ${source}...\n`);
    const digest = await getApiDigest(source, opts);

    if (values["stats"]) {
      const { stats, info } = digest;
      process.stdout.write(
        `${info.title}: digest ~${stats.tokenEstimate.toLocaleString()} tokens | ` +
          `raw ~${stats.rawEstimate.toLocaleString()} tokens | ` +
          `${stats.savedPercent}% smaller | ` +
          `${stats.endpointCount} endpoints\n`
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
