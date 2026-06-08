/**
 * Walks a raw OpenAPI/Swagger object and produces an ApiDigest.
 */

import {
  ApiDigest,
  ApiInfo,
  ApiScoutOptions,
  ApiScoutStats,
  AuthScheme,
  EndpointEntry,
  ParamEntry,
  SchemaEntry,
  ServerEntry,
} from "./types.js";
import { loadSpec } from "./parser.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

// ---------------------------------------------------------------------------
// Info
// ---------------------------------------------------------------------------

function extractInfo(spec: AnyObj): ApiInfo {
  const info = (spec["info"] as AnyObj) ?? {};
  return {
    title: String(info["title"] ?? "Untitled"),
    version: String(info["version"] ?? "unknown"),
    description: info["description"] ? String(info["description"]).slice(0, 200) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------

function extractServers(spec: AnyObj): ServerEntry[] {
  // OAS3
  const servers = spec["servers"] as AnyObj[] | undefined;
  if (Array.isArray(servers)) {
    return servers.slice(0, 4).map((s) => ({
      url: String(s["url"] ?? ""),
      description: s["description"] ? String(s["description"]) : undefined,
    }));
  }
  // Swagger 2 — build a synthetic server entry
  const host = spec["host"] as string | undefined;
  if (host) {
    const basePath = (spec["basePath"] as string) ?? "/";
    const schemes = spec["schemes"] as string[] | undefined;
    const scheme = (schemes && schemes[0]) ?? "https";
    return [{ url: `${scheme}://${host}${basePath}` }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Auth schemes
// ---------------------------------------------------------------------------

function extractAuth(spec: AnyObj): AuthScheme[] {
  const result: AuthScheme[] = [];

  // OAS3: components.securitySchemes
  const components = spec["components"] as AnyObj | undefined;
  const oas3Schemes = components?.["securitySchemes"] as AnyObj | undefined;
  if (oas3Schemes) {
    for (const [name, def] of Object.entries(oas3Schemes)) {
      const d = def as AnyObj;
      result.push({
        name,
        type: String(d["type"] ?? ""),
        scheme: d["scheme"] ? String(d["scheme"]) : undefined,
        in: d["in"] ? String(d["in"]) : undefined,
      });
    }
    return result;
  }

  // Swagger 2: securityDefinitions
  const sw2Defs = spec["securityDefinitions"] as AnyObj | undefined;
  if (sw2Defs) {
    for (const [name, def] of Object.entries(sw2Defs)) {
      const d = def as AnyObj;
      result.push({
        name,
        type: String(d["type"] ?? ""),
        in: d["in"] ? String(d["in"]) : undefined,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Schemas (just names + field list, no descriptions)
// ---------------------------------------------------------------------------

function extractSchemas(spec: AnyObj): SchemaEntry[] {
  const entries: SchemaEntry[] = [];

  // OAS3
  const components = spec["components"] as AnyObj | undefined;
  const oas3Schemas = components?.["schemas"] as AnyObj | undefined;
  const schemaSource = oas3Schemas ?? (spec["definitions"] as AnyObj | undefined);

  if (!schemaSource) return entries;

  for (const [name, def] of Object.entries(schemaSource)) {
    const d = def as AnyObj;
    const props = d["properties"] as AnyObj | undefined;
    const fields: string[] = props ? Object.keys(props).slice(0, 20) : [];
    entries.push({ name, fields });
    if (entries.length >= 60) break; // cap to keep output manageable
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

function extractParams(params: AnyObj[] | undefined): ParamEntry[] {
  if (!Array.isArray(params)) return [];
  return params.slice(0, 15).map((p) => {
    // handle $ref — just extract name from ref string
    if (p["$ref"]) {
      const ref = String(p["$ref"]);
      const name = ref.split("/").pop() ?? ref;
      return { name, in: "query" as const, required: false };
    }
    const schema = p["schema"] as AnyObj | undefined;
    const type =
      p["type"] ?? schema?.["type"] ?? schema?.["$ref"]?.split("/").pop();
    return {
      name: String(p["name"] ?? ""),
      in: (p["in"] as ParamEntry["in"]) ?? "query",
      required: Boolean(p["required"]),
      type: type ? String(type) : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

function extractEndpoints(spec: AnyObj, filterPath?: string): EndpointEntry[] {
  const paths = spec["paths"] as AnyObj | undefined;
  if (!paths) return [];

  const entries: EndpointEntry[] = [];

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (filterPath && pathKey !== filterPath) continue;
    const pi = pathItem as AnyObj;
    // path-level params (inherited by operations)
    const pathParams = extractParams(pi["parameters"] as AnyObj[]);

    for (const method of HTTP_METHODS) {
      const op = pi[method] as AnyObj | undefined;
      if (!op) continue;

      const opParams = extractParams(op["parameters"] as AnyObj[]);
      // merge: operation params override path params by name
      const paramMap = new Map<string, ParamEntry>();
      for (const p of pathParams) paramMap.set(p.name, p);
      for (const p of opParams) paramMap.set(p.name, p);

      const tags = Array.isArray(op["tags"])
        ? (op["tags"] as string[]).map(String)
        : [];

      const responses = op["responses"] as AnyObj | undefined;
      const responseCodes = responses ? Object.keys(responses) : [];

      const security = op["security"] as AnyObj[] | undefined;
      let secNames: string[] | undefined;
      if (security !== undefined) {
        secNames = security.flatMap((s) => Object.keys(s));
      }

      entries.push({
        method: method.toUpperCase(),
        path: pathKey,
        summary: op["summary"] ? String(op["summary"]).slice(0, 120) : undefined,
        operationId: op["operationId"] ? String(op["operationId"]) : undefined,
        tags,
        params: [...paramMap.values()],
        responseCodes,
        security: secNames,
        deprecated: op["deprecated"] === true ? true : undefined,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function computeStats(
  output: string,
  rawSize: number,
  endpointCount: number,
  tagCount: number
): ApiScoutStats {
  const tokenEstimate = Math.ceil(output.length / 4);
  const rawEstimate = Math.max(1, Math.ceil(rawSize / 4));
  const savedPercent = Math.max(0, Math.round((1 - tokenEstimate / rawEstimate) * 100));
  return { tokenEstimate, rawEstimate, savedPercent, endpointCount, tagCount };
}

// ---------------------------------------------------------------------------
// Token budget trimming
// ---------------------------------------------------------------------------

function trimToTokenBudget(digest: ApiDigest, maxTokens: number): ApiDigest {
  const estimate = () => Math.ceil(JSON.stringify(digest).length / 4);
  if (estimate() <= maxTokens) return digest;

  // drop schema fields first, then schemas, then endpoint params
  digest = { ...digest, schemas: digest.schemas.map((s) => ({ ...s, fields: [] })) };
  if (estimate() <= maxTokens) return digest;

  digest = { ...digest, schemas: [] };
  if (estimate() <= maxTokens) return digest;

  // trim endpoint params
  digest = {
    ...digest,
    endpoints: digest.endpoints.map((e) => ({ ...e, params: [] })),
  };
  if (estimate() <= maxTokens) return digest;

  // truncate endpoint list
  const keep = Math.max(1, Math.floor((maxTokens / estimate()) * digest.endpoints.length));
  digest = { ...digest, endpoints: digest.endpoints.slice(0, keep) };

  return digest;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getApiDigest(
  source: string,
  opts: ApiScoutOptions = {}
): Promise<ApiDigest> {
  const spec = await loadSpec(source);

  // rough raw size — length of the loaded text (re-serialised to be consistent)
  const rawSize = JSON.stringify(spec).length;

  const info = extractInfo(spec);
  const servers = extractServers(spec);
  const auth = extractAuth(spec);
  const schemas = extractSchemas(spec);
  const endpoints = extractEndpoints(spec, opts.endpoint);

  const tagSet = new Set(endpoints.flatMap((e) => e.tags));
  const tags = [...tagSet].sort();

  const prelim: ApiDigest = {
    info,
    servers,
    auth,
    tags,
    endpoints,
    schemas,
    stats: { tokenEstimate: 0, rawEstimate: 0, savedPercent: 0, endpointCount: 0, tagCount: 0 },
    generatedAt: new Date().toISOString(),
  };

  const stats = computeStats(JSON.stringify(prelim), rawSize, endpoints.length, tags.length);
  let digest: ApiDigest = { ...prelim, stats };

  if (opts.maxTokens) {
    digest = trimToTokenBudget(digest, opts.maxTokens);
    const trimmedStats = computeStats(
      JSON.stringify(digest),
      rawSize,
      endpoints.length,
      tags.length
    );
    digest = { ...digest, stats: trimmedStats };
  }

  return digest;
}
