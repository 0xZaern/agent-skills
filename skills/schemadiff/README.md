# schemadiff

Hand an AI agent a compact entity-relationship digest instead of making it read raw schema files.

`schemadiff` reads a Prisma schema, SQL DDL file, or Drizzle TypeScript schema and produces a structured digest of entities, fields (name, type, nullable, PK/unique flags), foreign-key relationships, and indexes — stripping all verbose comments, whitespace, and defaults. The result is a fraction of the raw token cost while containing everything an agent needs to write queries or migrations.

---

## Install

```sh
npx schemadiff
```

Or as a library:

```sh
npm install schemadiff
```

---

## CLI Usage

```
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
  -h, --help        Show help
  --version         Show version
```

### Examples

```sh
# Digest a Prisma schema as compact JSON (default)
schemadiff ./schema.prisma

# Markdown output
schemadiff ./schema.prisma --md

# Just the token savings summary
schemadiff ./migrations/ --stats

# Drizzle schema directory
schemadiff ./db/schema.ts --parser drizzle --text

# Drill into one table
schemadiff ./schema.sql --model users --md

# Fit into a token budget and pipe to an agent
schemadiff ./schema.prisma --max-tokens 2000 --json | some-agent-cli
```

### Sample output (--stats)

```
schemadiff: digest ~1,240 tokens | raw ~18,400 tokens | 93% smaller | 12 entities, 87 fields, 14 relations
```

### Sample output (--text, trimmed)

```
SCHEMA: schema.prisma [prisma]
STATS: digest ~1,240 tokens | raw ~18,400 tokens | 93% smaller
ENTITIES: 12 | FIELDS: 87 | RELATIONS: 14

ENTITY: User
  id: String [PK,NOT NULL]
  email: String [UNIQUE,NOT NULL]
  name: String
  createdAt: DateTime [NOT NULL]
  RELATIONS:
    (userId) -> Post(authorId)

ENTITY: Post
  id: String [PK,NOT NULL]
  title: String [NOT NULL]
  authorId: String [NOT NULL]
  ...
```

---

## Library Usage

```ts
import { getSchemaDigest } from 'schemadiff';

const digest = await getSchemaDigest('./schema.prisma');

// digest.format      — "prisma" | "sql" | "drizzle"
// digest.entities    — list of entities with fields, relations, indexes
// digest.relations   — global FK edge list
// digest.stats       — token savings breakdown
console.log(digest.stats);
// { tokenEstimate: 1240, rawEstimate: 18400, savedPercent: 93, entityCount: 12, fieldCount: 87, relationCount: 14 }
```

### With options

```ts
import { getSchemaDigest, formatMarkdown } from 'schemadiff';

const digest = await getSchemaDigest('./schema.sql', {
  model: 'users',      // only include the users table
  maxTokens: 1000,     // trim to budget
  parser: 'sql',       // force parser (auto-detected otherwise)
});

console.log(formatMarkdown(digest));
```

---

## Output schema

```ts
interface SchemaDigest {
  format:      SchemaFormat;    // "prisma" | "sql" | "drizzle"
  source:      string;          // resolved file/directory path
  entities:    EntityEntry[];   // tables/models with fields, relations, indexes
  relations:   RelationEntry[]; // global FK edge list (de-duplicated)
  stats:       SchemaDiffStats; // token savings
  generatedAt: string;          // ISO 8601
}

interface EntityEntry {
  name:      string;
  fields:    FieldEntry[];
  relations: RelationEntry[];
  indexes:   IndexEntry[];
}

interface FieldEntry {
  name:     string;
  type:     string;    // compact type string
  nullable: boolean;
  pk:       boolean;
  unique:   boolean;
  default?: string;   // truncated to 40 chars
}
```

---

## Supported formats

| Format | Auto-detection | What is parsed |
|--------|---------------|----------------|
| **Prisma** | `.prisma` extension or `model {}` + `datasource {}` blocks | `model`, `@id`, `@unique`, `@default`, `@relation`, `@@index`, `@@unique` |
| **SQL DDL** | `.sql`, `.ddl`, `.psql`, `.mysql` or `CREATE TABLE` in content | `CREATE TABLE`, `PRIMARY KEY`, `UNIQUE`, `FOREIGN KEY`, `NOT NULL`, `DEFAULT`, `CREATE INDEX`, `ALTER TABLE ADD CONSTRAINT` |
| **Drizzle** | `drizzle-orm` import or `pgTable`/`mysqlTable`/`sqliteTable` call | Table definitions, column helpers (text, integer, uuid, timestamp, …), `.notNull()`, `.primaryKey()`, `.unique()`, `.default()`, `relations()` |

---

## Token savings

Mid-size Prisma schema (15 models, 20 migrations): raw files ~40,000 tokens → digest ~1,800 tokens = **95% reduction**.

---

## License

MIT — see [LICENSE](./LICENSE)
