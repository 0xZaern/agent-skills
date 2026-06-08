#!/usr/bin/env node
/**
 * agent-skills MCP server
 *
 * Exposes the agent-skills collection (devpulse, codemap) as native MCP tools
 * for MCP-compatible editors and AI workflows.
 *
 * Transport: stdio (reads from stdin, writes to stdout).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getRepoDigest, formatJson as digestJson, formatMarkdown as digestMd, formatText as digestText } from "devpulse";
import { getCodemap, formatJson as mapJson, formatMarkdown as mapMd, formatText as mapText } from "codemap";
import { getApiDigest, formatJson as apiJson, formatMarkdown as apiMd, formatText as apiText } from "apiscout";
import { getAuditDigest, formatJson as auditJson, formatMarkdown as auditMd, formatText as auditText } from "auditsnap";

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: "agent-skills", version: "1.0.0" },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ---------------------------------------------------------------------------
// Tool: repo_digest
// ---------------------------------------------------------------------------

server.tool(
  "repo_digest",
  "Produce a token-efficient digest of a GitHub repository. Returns structured metadata, pruned file tree, key file summaries, language breakdown, and recent commits — at a fraction of the raw token cost of reading the repo directly.",
  {
    repo: z.string().describe("GitHub repository slug in owner/name format, e.g. facebook/react"),
    format: z
      .enum(["json", "md", "text"])
      .optional()
      .describe("Output format: json (default, compact), md (markdown), text (plain)"),
    maxTokens: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Soft token budget — trims the digest to approximately this many tokens"),
    noCache: z
      .boolean()
      .optional()
      .describe("When true, skip the 60-minute disk cache and fetch fresh from GitHub"),
    token: z
      .string()
      .optional()
      .describe("GitHub personal access token. Increases rate limit from 60 to 5000 req/hr"),
  },
  async (args) => {
    const { repo, format = "json", maxTokens, noCache, token } = args;

    const digest = await getRepoDigest(repo, {
      format,
      maxTokens,
      noCache,
      token,
    });

    let output: string;
    switch (format) {
      case "md":
        output = digestMd(digest);
        break;
      case "text":
        output = digestText(digest);
        break;
      default:
        output = digestJson(digest);
    }

    return {
      content: [{ type: "text" as const, text: output }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: codemap
// ---------------------------------------------------------------------------

server.tool(
  "codemap",
  "Produce a token-efficient map of a local codebase. Walks the directory, extracts exported symbols and signatures from TypeScript/JavaScript files (using the TS compiler API), and returns a compact structured overview — so an AI agent can understand the project without reading every file.",
  {
    path: z
      .string()
      .optional()
      .describe("Absolute or relative path to the root directory to map. Defaults to current working directory."),
    format: z
      .enum(["json", "md", "text"])
      .optional()
      .describe("Output format: json (default, compact), md (markdown), text (plain)"),
    maxTokens: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Soft token budget — trims the map to approximately this many tokens"),
  },
  async (args) => {
    const { path: rootPath = ".", format = "json", maxTokens } = args;

    const codemap = await getCodemap(rootPath, { format, maxTokens });

    let output: string;
    switch (format) {
      case "md":
        output = mapMd(codemap);
        break;
      case "text":
        output = mapText(codemap);
        break;
      default:
        output = mapJson(codemap);
    }

    return {
      content: [{ type: "text" as const, text: output }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: apiscout
// ---------------------------------------------------------------------------

server.tool(
  "apiscout",
  "Produce a token-efficient digest of an OpenAPI or Swagger spec. Returns endpoint summaries grouped by tag, auth schemes, parameter tables, and schema field lists — at a fraction of the raw spec token cost. Accepts a local file path or a URL.",
  {
    source: z
      .string()
      .describe("Path to a local OpenAPI/Swagger file, or a URL (http/https)"),
    format: z
      .enum(["json", "md", "text"])
      .optional()
      .describe("Output format: json (default, compact), md (markdown), text (plain)"),
    maxTokens: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Soft token budget — trims the digest to approximately this many tokens"),
    endpoint: z
      .string()
      .optional()
      .describe("Drill into a single path, e.g. /users/{id}. Returns only operations for that path."),
  },
  async (args) => {
    const { source, format = "json", maxTokens, endpoint } = args;

    const digest = await getApiDigest(source, { format, maxTokens, endpoint });

    let output: string;
    switch (format) {
      case "md":
        output = apiMd(digest);
        break;
      case "text":
        output = apiText(digest);
        break;
      default:
        output = apiJson(digest);
    }

    return {
      content: [{ type: "text" as const, text: output }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: auditsnap
// ---------------------------------------------------------------------------

server.tool(
  "auditsnap",
  "Produce a token-efficient digest of npm audit output. Runs npm audit --json in the target directory and returns a ranked vulnerability list sorted by severity with fix-available flags and direct/transitive labels — at a fraction of the raw audit output token cost.",
  {
    dir: z
      .string()
      .optional()
      .describe("Absolute path to the directory to run npm audit in. Defaults to current working directory."),
    format: z
      .enum(["json", "md", "text"])
      .optional()
      .describe("Output format: json (default, compact), md (markdown), text (plain)"),
    maxTokens: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Soft token budget — trims the digest to approximately this many tokens"),
  },
  async (args) => {
    const { dir = ".", format = "json", maxTokens } = args;

    const digest = await getAuditDigest({ dir, format, maxTokens });

    let output: string;
    switch (format) {
      case "md":
        output = auditMd(digest);
        break;
      case "text":
        output = auditText(digest);
        break;
      default:
        output = auditJson(digest);
    }

    return {
      content: [{ type: "text" as const, text: output }],
    };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now running — stdio transport keeps the process alive
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
