/**
 * apiscout public type definitions.
 */

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ApiScoutOptions {
  format?: "json" | "md" | "text";
  maxTokens?: number;
  /** Drill into a single endpoint path, e.g. "/users/{id}". */
  endpoint?: string;
}

// ---------------------------------------------------------------------------
// Sub-shapes
// ---------------------------------------------------------------------------

export interface ApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface ServerEntry {
  url: string;
  description?: string;
}

export interface AuthScheme {
  name: string;
  type: string;
  /** e.g. "bearer", "basic", "apiKey" */
  scheme?: string;
  in?: string; // where the key goes: header, query, cookie
}

export interface ParamEntry {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  type?: string;
}

export interface EndpointEntry {
  method: string;
  path: string;
  summary?: string;
  operationId?: string;
  tags: string[];
  params: ParamEntry[];
  /** e.g. ["200", "400", "404"] */
  responseCodes: string[];
  /** Security requirements on this specific operation, if overridden */
  security?: string[];
  deprecated?: boolean;
}

export interface SchemaEntry {
  name: string;
  fields: string[];
}

export interface ApiScoutStats {
  tokenEstimate: number;
  rawEstimate: number;
  savedPercent: number;
  endpointCount: number;
  tagCount: number;
}

// ---------------------------------------------------------------------------
// Top-level result
// ---------------------------------------------------------------------------

export interface ApiDigest {
  info: ApiInfo;
  servers: ServerEntry[];
  auth: AuthScheme[];
  tags: string[];
  endpoints: EndpointEntry[];
  schemas: SchemaEntry[];
  stats: ApiScoutStats;
  generatedAt: string;
}
