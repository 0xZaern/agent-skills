#!/usr/bin/env node
/**
 * schemadiff CLI
 *
 * Usage:
 *   schemadiff <path> [--json|--md|--text] [--stats] [--max-tokens N] [--model ModelName] [--parser prisma|sql|drizzle]
 *   schemadiff --version
 *   schemadiff --help
 */

import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { getSchemaDigest } from "./lib/digest.js";
import { formatJson, formatMarkdown, formatText } from "./lib/format/index.js";
import { SchemaDiffOptions } from "./lib/types.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pkg = require("../package.json") as { version: string; name: string };

const HELP = `
schemadiff v${pkg.version} — token-efficient database schema digest for AI agents

USAGE
  schemadiff <path> [options]

ARGUMENTS
  path              Path to a schema file or directory
                    (schema.prisma | *.sql | drizzle *.ts | migrations/)

OPTIONS
  --json            Output as compact JSON (default, agent-friendly)
  --md              Output as human-readable Markdown
  --text            Output as plain text
  --stats           Print only the token-savings summary line
  --max-tokens N    Trim the digest to approximately N tokens
  --model NAME      Drill into one entity/table by name
  --parser FORMAT   Force parser: prisma | sql | drizzle (auto-detected by default)
  -h, --help        Show this help message
  --version         Show version

EXAMPLES
  schemadiff ./schema.prisma
  schemadiff ./schema.prisma --md
  schemadiff ./migrations/ --stats
  schemadiff ./db/schema.ts --parser drizzle --text
  schemadiff ./schema.sql --model users --md
  schemadiff ./schema.prisma --max-tokens 2000 --json | some-agent-cli

NOTES
  - Auto-detects format by file extension and content.
  - Prisma: model blocks, @id, @unique, @relation, @@index.
  - SQL DDL: CREATE TABLE, PRIMARY KEY, FOREIGN KEY, CREATE INDEX, ALTER TABLE ADD CONSTRAINT.
  - Drizzle: pgTable/mysqlTable/sqliteTable, column helpers, relations().
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
      model: { type: "string" },
      parser: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values["version"]) {
    process.stdout.write(`schemadiff ${pkg.version}\n`);
    process.exit(0);
  }

  if (values["help"] || positionals.length === 0) {
    process.stdout.write(HELP + "\n");
    process.exit(0);
  }

  const source = positionals[0]!;

  let format: SchemaDiffOptions["format"] = "json";
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

  const rawParser = typeof values["parser"] === "string" ? values["parser"] : undefined;
  if (rawParser && rawParser !== "prisma" && rawParser !== "sql" && rawParser !== "drizzle") {
    process.stderr.write(
      `Error: --parser must be one of: prisma, sql, drizzle. Got "${rawParser}"\n`
    );
    process.exit(1);
  }

  const opts: SchemaDiffOptions = {
    format,
    maxTokens,
    model: typeof values["model"] === "string" ? values["model"] : undefined,
    parser: rawParser as SchemaDiffOptions["parser"],
  };

  try {
    process.stderr.write(`Reading schema from ${source}...\n`);
    const digest = await getSchemaDigest(source, opts);

    if (values["stats"]) {
      const { stats } = digest;
      process.stdout.write(
        `schemadiff: digest ~${stats.tokenEstimate.toLocaleString()} tokens | ` +
          `raw ~${stats.rawEstimate.toLocaleString()} tokens | ` +
          `${stats.savedPercent}% smaller | ` +
          `${stats.entityCount} entities, ${stats.fieldCount} fields, ${stats.relationCount} relations\n`
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
