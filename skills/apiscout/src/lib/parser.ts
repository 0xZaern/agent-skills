/**
 * Loads an OpenAPI/Swagger spec from a file path or URL, returns a raw object.
 * Supports YAML and JSON, OpenAPI 3.x and Swagger 2.x.
 */

import fs from "node:fs";
import yaml from "js-yaml";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

export async function loadSpec(source: string): Promise<AnyObj> {
  let raw: string;

  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }
    raw = await res.text();
  } else {
    if (!fs.existsSync(source)) {
      throw new Error(`File not found: ${source}`);
    }
    raw = fs.readFileSync(source, "utf8");
  }

  // Detect YAML vs JSON by first non-whitespace character
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(raw) as AnyObj;
  }
  return yaml.load(raw) as AnyObj;
}
