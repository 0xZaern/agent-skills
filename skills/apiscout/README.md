# apiscout

Hand an AI agent a summary of an API instead of making it read the whole spec.

`apiscout` loads an OpenAPI 3.x or Swagger 2.x spec (local file or URL), extracts endpoints grouped by tag with params and response codes, auth schemes, and schema field lists, and outputs a compact digest that gives an agent a complete picture of what an API can do — without the full token cost of the raw spec.

---

## Install

```sh
npx apiscout
```

Or as a library:

```sh
npm install apiscout
```

---

## CLI Usage

```
apiscout <spec> [options]

ARGUMENTS
  spec              Path to a local file, or a URL

OPTIONS
  --json            Output as compact JSON (default, agent-friendly)
  --md              Output as human-readable Markdown
  --text            Output as plain text
  --stats           Print only the token-savings summary line
  --max-tokens N    Trim the digest to approximately N tokens
  --endpoint PATH   Drill into one path, e.g. --endpoint /users/{id}
  -h, --help        Show help
  --version         Show version
```

### Examples

```sh
# Digest a local spec as JSON (default)
apiscout ./openapi.yaml

# Remote spec as Markdown
apiscout https://petstore3.swagger.io/api/v3/openapi.json --md

# Just the savings summary
apiscout ./stripe.yaml --stats

# Drill into one endpoint
apiscout ./api.json --endpoint /v1/charges --md

# Fit into a 3000-token budget and pipe to an agent
apiscout ./openapi.yaml --max-tokens 3000 --json | some-agent-cli
```

### Sample output (--stats)

```
Petstore: digest ~1,840 tokens | raw ~52,310 tokens | 96% smaller | 20 endpoints
```

### Sample output (--md, trimmed)

```markdown
# apiscout: Petstore

> digest ~1,840 tokens · raw ~52,310 tokens · **96% smaller**
> 20 endpoints · 3 tags

## Servers

- `https://petstore3.swagger.io/api/v3`

## Auth

- petstore_auth / oauth2

## Endpoints

### pet

- **POST** `/pet` — Add a new pet to the store
  - responses: 200, 405

- **GET** `/pet/findByStatus` — Finds pets by status
  - params: status:string
  - responses: 200, 400
```

---

## Library Usage

```ts
import { getApiDigest } from 'apiscout';

const digest = await getApiDigest('./openapi.yaml');

// digest.info       — title, version, description
// digest.servers    — base URLs
// digest.auth       — security scheme names and types
// digest.tags       — all tag names (sorted)
// digest.endpoints  — per-endpoint: method, path, summary, params, response codes
// digest.schemas    — schema names and field lists
// digest.stats      — token savings breakdown
console.log(digest.stats);
// { tokenEstimate: 1840, rawEstimate: 52310, savedPercent: 96, endpointCount: 20, tagCount: 3 }
```

### With options

```ts
import { getApiDigest, formatMarkdown } from 'apiscout';

const digest = await getApiDigest('https://api.example.com/openapi.json', {
  maxTokens: 3000,
  endpoint: '/users/{id}', // only include this path
});

console.log(formatMarkdown(digest));
```

---

## Output schema

```ts
interface ApiDigest {
  info:        ApiInfo;         // title, version, description
  servers:     ServerEntry[];   // base URLs
  auth:        AuthScheme[];    // security schemes
  tags:        string[];        // sorted tag list
  endpoints:   EndpointEntry[]; // per-operation entries
  schemas:     SchemaEntry[];   // model names + field lists
  stats:       ApiScoutStats;   // token savings
  generatedAt: string;          // ISO 8601
}
```

---

## Token savings

Real Stripe OpenAPI spec (~280k tokens raw) → ~3k token digest = **98% reduction**.

---

## License

MIT — see [LICENSE](./LICENSE)
