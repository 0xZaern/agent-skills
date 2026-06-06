# agent-tools

A collection of small, focused tools that help AI agents and LLMs work with code and repos efficiently.

---

## Tools

| Tool | Description |
|------|-------------|
| [**devpulse**](./tools/devpulse) | Token-efficient GitHub repo context for AI agents — fetches a repo and returns a compact structured digest (metadata, file tree, key files, recent commits) at a fraction of the raw token cost. |
| [**codemap**](./tools/codemap) | Token-efficient local codebase map for AI agents — walks a directory, extracts exported symbols and one-line signatures from TypeScript/JavaScript files, and produces a compact structured overview so an LLM understands the project without reading every file. |

---

## MCP Server

[**tools/mcp**](./tools/mcp) is an MCP (Model Context Protocol) server that exposes both tools above as native MCP tools for MCP-compatible editors and AI workflows.

Register it once in your MCP client config:

```json
{
  "mcpServers": {
    "agent-tools": {
      "command": "node",
      "args": ["/absolute/path/to/agent-tools/tools/mcp/dist/server.js"]
    }
  }
}
```

See [tools/mcp/README.md](./tools/mcp/README.md) for full setup instructions.

---

## License

MIT
