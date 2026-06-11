# agent-skills

A collection of small, focused skills that help AI agents and LLMs work with code and repos efficiently.

---

## Skills

| Skill | Description |
|------|-------------|
| [**devpulse**](./skills/devpulse) | Token-efficient GitHub repo context for AI agents — fetches a repo and returns a compact structured digest (metadata, file tree, key files, recent commits) at a fraction of the raw token cost. |
| [**codemap**](./skills/codemap) | Token-efficient local codebase map for AI agents — walks a directory, extracts exported symbols and one-line signatures from TypeScript/JavaScript files, and produces a compact structured overview so an LLM understands the project without reading every file. |
| [**apiscout**](./skills/apiscout) | Token-efficient OpenAPI/Swagger spec digest for AI agents — loads a local file or URL and returns endpoint summaries grouped by tag, auth schemes, and schema field lists so an agent understands an API without consuming the full spec. |
| [**auditsnap**](./skills/auditsnap) | Token-efficient npm audit digest for AI agents — runs npm audit and returns a ranked vulnerability summary sorted by severity with fix-available flags and direct/transitive labels at a fraction of the raw audit output token cost. |
| [**schemadiff**](./skills/schemadiff) | Token-efficient database schema digest for AI agents — reads Prisma, SQL DDL, or Drizzle schemas and returns a compact ERD-style digest with entities, fields, foreign-key relations, and indexes at a fraction of the raw schema token cost. |
| [**logfold**](./skills/logfold) | Token-efficient error log digest for AI agents — deduplicates repeated errors, folds stack-trace noise (node_modules, stdlib, site-packages), groups by error signature, counts occurrences, and records first/last timestamps at a fraction of the raw log token cost. |

---

## MCP Server

[**skills/mcp**](./skills/mcp) is an MCP (Model Context Protocol) server that exposes the skills above as native MCP tools for MCP-compatible editors and AI workflows.

Register it once in your MCP client config:

```json
{
  "mcpServers": {
    "agent-skills": {
      "command": "node",
      "args": ["/absolute/path/to/agent-skills/skills/mcp/dist/server.js"]
    }
  }
}
```

See [skills/mcp/README.md](./skills/mcp/README.md) for full setup instructions.

---

## License

MIT
