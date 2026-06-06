/**
 * GitHub REST API client for the devpulse library.
 *
 * - Uses opts.token || GITHUB_TOKEN env var when available (5000 req/hr).
 * - Without a token: 60 req/hr unauthenticated.
 * - Sets User-Agent: devpulse on every request.
 * - Maps error codes to typed DigestError.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type DigestErrorCode = "REPO_NOT_FOUND" | "RATE_LIMITED" | "UPSTREAM_ERROR";

export class DigestError extends Error {
  constructor(
    public readonly code: DigestErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DigestError";
  }
}

// ---------------------------------------------------------------------------
// Raw GitHub shapes (minimal — only fields we consume)
// ---------------------------------------------------------------------------

export interface GHRepoInfo {
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  license: { spdx_id: string } | null;
  topics: string[];
  pushed_at: string;
  open_issues_count: number;
}

export interface GHTreeItem {
  path: string;
  type: string; // "blob" | "tree" | "commit"
  sha: string;
  /** Byte size of the blob (only present for type === "blob"). */
  size?: number;
}

export interface GHTreeResponse {
  tree: GHTreeItem[];
  truncated: boolean;
}

export interface GHCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function buildHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "devpulse",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function ghFetch(url: string, token: string | null): Promise<Response> {
  const res = await fetch(url, { headers: buildHeaders(token) });
  return res;
}

function handleError(res: Response, context: string): never {
  if (res.status === 404) {
    throw new DigestError("REPO_NOT_FOUND", `${context} not found (404).`);
  }
  if (
    res.status === 403 ||
    res.status === 429 ||
    res.headers.get("x-ratelimit-remaining") === "0"
  ) {
    throw new DigestError(
      "RATE_LIMITED",
      "GitHub API rate limit exceeded. Set GITHUB_TOKEN for 5000 req/hr."
    );
  }
  throw new DigestError(
    "UPSTREAM_ERROR",
    `GitHub API returned status ${res.status} for ${context}.`
  );
}

// ---------------------------------------------------------------------------
// Public fetch functions
// ---------------------------------------------------------------------------

export async function fetchRepoInfo(
  owner: string,
  name: string,
  token: string | null
): Promise<GHRepoInfo> {
  const res = await ghFetch(
    `https://api.github.com/repos/${owner}/${name}`,
    token
  );
  if (!res.ok) handleError(res, `repo ${owner}/${name}`);
  const data = (await res.json()) as GHRepoInfo;
  // Ensure topics array exists (sometimes absent on unauthenticated calls)
  if (!Array.isArray(data.topics)) data.topics = [];
  return data;
}

export async function fetchRepoLanguages(
  owner: string,
  name: string,
  token: string | null
): Promise<Record<string, number>> {
  const res = await ghFetch(
    `https://api.github.com/repos/${owner}/${name}/languages`,
    token
  );
  if (!res.ok) return {};
  return (await res.json()) as Record<string, number>;
}

export async function fetchRepoTree(
  owner: string,
  name: string,
  token: string | null
): Promise<GHTreeResponse> {
  // Get default branch first (already in GHRepoInfo but we fetch it separately
  // so this function stays self-contained)
  const res = await ghFetch(
    `https://api.github.com/repos/${owner}/${name}/git/trees/HEAD?recursive=1`,
    token
  );
  if (!res.ok) {
    // Non-fatal: return empty tree
    return { tree: [], truncated: false };
  }
  return (await res.json()) as GHTreeResponse;
}

export async function fetchReadme(
  owner: string,
  name: string,
  token: string | null
): Promise<string> {
  const res = await ghFetch(
    `https://api.github.com/repos/${owner}/${name}/readme`,
    token
  );
  if (!res.ok) return "";
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== "base64") return "";
  // GitHub returns base64 with newlines
  const raw = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  return raw;
}

export async function fetchCommits(
  owner: string,
  name: string,
  token: string | null,
  count = 5
): Promise<GHCommit[]> {
  const res = await ghFetch(
    `https://api.github.com/repos/${owner}/${name}/commits?per_page=${count}`,
    token
  );
  if (!res.ok) return [];
  return (await res.json()) as GHCommit[];
}

export async function fetchFileContent(
  owner: string,
  name: string,
  path: string,
  token: string | null
): Promise<string | null> {
  const res = await ghFetch(
    `https://api.github.com/repos/${owner}/${name}/contents/${path}`,
    token
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== "base64") return null;
  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
}
