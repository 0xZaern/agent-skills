# agent-skills-mcp

An MCP (Model Context Protocol) server that exposes the [agent-skills](../../README.md) collection as native tools for MCP-compatible editors and AI workflows.

Connect it once, and any MCP-compatible client gets direct access to `repo_digest` and `codemap` — no extra scripts, no shell commands.

---

## Available tools

| Tool | Description |
|------|-------------|
| `repo_digest` | Produce a token-efficient digest of a GitHub repository (metadata, file tree, key files, language breakdown, recent commits). |
| `codemap` | Produce a token-efficient map of a local codebase — exported symbols with one-line signatures, pruned file tree, import graph. |

---

## Installation

```sh
# Clone the repo
git clone https://github.com/0xZaern/agent-skills.git
cd agent-skills

# Build codemap (dependency)
cd skills/codemap && npm install && npm run build && cd ../..

# Build devpulse (dependency)
cd skills/devpulse && npm install && npm run build && cd ../..

# Build the MCP server
cd skills/mcp && npm install && npm run build && cd ../..
```

---

## Register in your MCP client

Add this to your MCP client's config (works with any MCP-compatible editor or workflow tool):

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

Replace `/absolute/path/to/agent-skills` with the actual path where you cloned the repo.

After restarting your client, the `repo_digest` and `codemap` tools will be available natively.

---

## Tool reference

### `repo_digest`

Fetches a GitHub repository and returns a compact digest.

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `repo` | `string` | yes | GitHub slug: `owner/name` (e.g. `facebook/react`) |
| `format` | `"json" \| "md" \| "text"` | no | Output format. Default: `json` |
| `maxTokens` | `number` | no | Trim to approximately this many tokens |
| `noCache` | `boolean` | no | Skip the 60-minute disk cache |
| `token` | `string` | no | GitHub personal access token (5000 req/hr vs. 60 unauthenticated) |

**Output:** Structured digest as a text content block (JSON, Markdown, or plain text).

---

### `codemap`

Maps a local directory and extracts exported symbols from source files.

**Inputs:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | `string` | no | Path to root directory. Default: `.` (current working directory) |
| `format` | `"json" \| "md" \| "text"` | no | Output format. Default: `json` |
| `maxTokens` | `number` | no | Trim to approximately this many tokens |

**Output:** Codemap as a text content block — project name, file tree, per-file exported symbols with one-line signatures, and token savings stats.

---

## License

MIT — see [LICENSE](./LICENSE)
