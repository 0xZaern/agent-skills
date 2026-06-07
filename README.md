# agent-skills

A collection of small, focused skills that help AI agents and LLMs work with code and repos efficiently.

---

## Skills

| Skill | Description |
|------|-------------|
| [**devpulse**](./skills/devpulse) | Token-efficient GitHub repo context for AI agents — fetches a repo and returns a compact structured digest (metadata, file tree, key files, recent commits) at a fraction of the raw token cost. |
| [**codemap**](./skills/codemap) | Token-efficient local codebase map for AI agents — walks a directory, extracts exported symbols and one-line signatures from TypeScript/JavaScript files, and produces a compact structured overview so an LLM understands the project without reading every file. |

---

## MCP Server

[**skills/mcp**](./skills/mcp) is an MCP (Model Context Protocol) server that exposes both skills above as native MCP tools for MCP-compatible editors and AI workflows.

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
