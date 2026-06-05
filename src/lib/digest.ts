/**
 * Core orchestrator: fetches all GitHub data and assembles a RepoDigest.
 */

import { DigestOptions, RepoDigest } from "./types.js";
import {
  fetchRepoInfo,
  fetchRepoLanguages,
  fetchRepoTree,
  fetchReadme,
  fetchCommits,
  fetchFileContent,
  DigestError,
} from "./github/client.js";
import {
  toFileTree,
  normalizeReadme,
  toLanguageBreakdown,
  toRepoMetadata,
  toCommitEntries,
  detectKeyFiles,
  computeStats,
  trimToTokenBudget,
} from "./transform.js";
import { cacheGet, cacheSet } from "./cache/disk.js";

// Files whose content we fetch to build key file summaries.
// Keep this list short — each entry is one extra API call.
const KEY_FILES_TO_FETCH = [
  "package.json",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
];

export async function getRepoDigest(
  repo: string,
  opts: DigestOptions = {}
): Promise<RepoDigest> {
  // Validate repo slug
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new DigestError(
      "REPO_NOT_FOUND",
      `Invalid repo format "${repo}". Expected "owner/name".`
    );
  }
  const [owner, name] = parts;

  const token = opts.token ?? process.env["GITHUB_TOKEN"] ?? null;

  // Check disk cache first
  if (!opts.noCache) {
    const cached = cacheGet(owner, name);
    if (cached) {
      const result = opts.maxTokens
        ? trimToTokenBudget({ ...cached, cached: true }, opts.maxTokens)
        : { ...cached, cached: true };
      return result;
    }
  }

  // Parallel: repo info + languages + readme + commits + file tree
  const [repoInfo, langMap, readmeRaw, commitsRaw, treeResponse] =
    await Promise.all([
      fetchRepoInfo(owner, name, token),
      fetchRepoLanguages(owner, name, token),
      fetchReadme(owner, name, token),
      fetchCommits(owner, name, token, 5),
      fetchRepoTree(owner, name, token),
    ]);

  const metadata = toRepoMetadata(repoInfo);
  const languages = toLanguageBreakdown(langMap);
  const readme = normalizeReadme(readmeRaw);
  const recentActivity = toCommitEntries(commitsRaw);
  const fileTree = toFileTree(treeResponse.tree);

  // Fetch key file contents (only for files present in the tree)
  const treePathSet = new Set(fileTree.map((e) => e.path));
  const filesToFetch = KEY_FILES_TO_FETCH.filter((f) => treePathSet.has(f));

  const fileContentEntries = await Promise.all(
    filesToFetch.map(async (f): Promise<[string, string]> => {
      const content = await fetchFileContent(owner, name, f, token);
      return [f, content ?? ""];
    })
  );
  const fileContents = new Map<string, string>(fileContentEntries);

  const keyFiles = detectKeyFiles(fileTree, fileContents);

  // Build a preliminary digest to compute stats
  const prelimDigest: RepoDigest = {
    metadata,
    languages,
    fileTree,
    readme,
    keyFiles,
    recentActivity,
    stats: { tokenEstimate: 0, rawEstimate: 0, savedPercent: 0 },
    generatedAt: new Date().toISOString(),
    cached: false,
  };

  const stats = computeStats(
    JSON.stringify(prelimDigest),
    treeResponse.tree
  );

  const digest: RepoDigest = { ...prelimDigest, stats };

  // Cache before trimming (cache the full digest; trimming is per-call)
  if (!opts.noCache) {
    cacheSet(owner, name, digest);
  }

  if (opts.maxTokens) {
    return trimToTokenBudget(digest, opts.maxTokens);
  }

  return digest;
}
