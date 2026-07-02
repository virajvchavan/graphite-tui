import { execa } from "execa";
import { getRemoteOwnerRepo } from "./git.js";
import { normalizeReview, normalizeState } from "./prInfo.js";
import type { CiStatus, Mergeable, PrInfo, PrLiveStatus } from "../types.js";

/** Map GitHub's StatusState enum to our coarse CI status. */
export function mapCiState(state: unknown): CiStatus {
  switch (state) {
    case "SUCCESS":
      return "passed";
    case "FAILURE":
    case "ERROR":
      return "failed";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return null; // no checks configured / unknown
  }
}

/** Map GitHub's MergeableState enum (MERGEABLE | CONFLICTING | UNKNOWN). */
export function mapMergeable(state: unknown): Mergeable {
  return state === "CONFLICTING"
    ? "conflicting"
    : state === "MERGEABLE"
      ? "mergeable"
      : "unknown"; // UNKNOWN (still computing) / unmapped
}

/**
 * Live per-PR status (review-comment thread counts + rolled-up CI state),
 * fetched from GitHub in a single batched GraphQL call via `gh`. Best-effort:
 * returns an empty map (never throws) when `gh` is missing, unauthenticated,
 * offline, or the remote isn't on GitHub. Threads are capped at the first 100
 * per PR (plenty in practice). CI status is read from the last commit's
 * statusCheckRollup. Also pulls live `state`/`reviewDecision` so a refresh can
 * show a PR merged or approved elsewhere without waiting for `gt` to rewrite
 * its `.graphite_pr_info` cache.
 */
/**
 * Run one `gh api graphql` query against the origin's repository, wrapping the
 * caller's aliased `fields` in the `repository(owner,name)` selection. Returns
 * the parsed `data.repository` object (keyed by the caller's aliases), or null
 * — best-effort — when there's no GitHub remote or gh is missing/unauthed/
 * offline/errors. Shared by every GitHub-backed lookup here so the execa +
 * owner/repo + parse + swallow-errors boilerplate lives in one place.
 */
async function queryRepoGraphql(
  repoRoot: string,
  fields: string
): Promise<Record<string, unknown> | null> {
  const repo = getRemoteOwnerRepo(repoRoot);
  if (!repo) return null;
  const query =
    `query($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ ${fields} } }`;
  try {
    const { stdout } = await execa(
      "gh",
      ["api", "graphql", "-f", `query=${query}`, "-F", `owner=${repo.owner}`, "-F", `name=${repo.name}`],
      { cwd: repoRoot }
    );
    return (JSON.parse(stdout)?.data?.repository as Record<string, unknown>) ?? null;
  } catch {
    return null; // gh missing / not authed / offline / not a GitHub remote
  }
}

export async function fetchPrStatus(
  repoRoot: string,
  prNumbers: number[]
): Promise<Map<number, PrLiveStatus>> {
  const result = new Map<number, PrLiveStatus>();
  if (prNumbers.length === 0) return result;

  // One aliased field per PR (alias can't start with a digit -> "p<number>").
  const fields = prNumbers
    .map(
      (n) =>
        `p${n}: pullRequest(number: ${n}) { ` +
        `state reviewDecision mergeable ` +
        `reviewThreads(first: 100) { nodes { isResolved } } ` +
        `commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }`
    )
    .join("\n");
  const repoData = await queryRepoGraphql(repoRoot, fields);
  if (!repoData) return result;

  for (const n of prNumbers) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pr = repoData[`p${n}`] as any;
    if (!pr) continue;
    const nodes = pr.reviewThreads?.nodes;
    const threads = Array.isArray(nodes)
      ? {
          total: nodes.length,
          resolved: nodes.filter((t: { isResolved?: boolean }) => t.isResolved)
            .length,
        }
      : { total: 0, resolved: 0 };
    const ci = mapCiState(pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state);
    result.set(n, {
      threads,
      ci,
      mergeable: mapMergeable(pr.mergeable),
      state: normalizeState(pr.state),
      reviewDecision: normalizeReview(pr.reviewDecision),
    });
  }
  return result;
}

/**
 * Discover PRs from GitHub by head-branch name, for branches gt hasn't cached
 * in `.graphite_pr_info`. gt only records PRs it has synced/submitted, so a
 * freshly `gt track`ed branch (e.g. one fetched with plain git) has an open PR
 * on GitHub that never appears locally. One batched GraphQL call via `gh`,
 * aliasing a `pullRequests(headRefName:)` field per branch (newest first, any
 * state). Best-effort: returns an empty map (never throws) when gh is
 * missing/unauthed/offline or the remote isn't GitHub. Keyed by branch name;
 * only branches with a matching PR are present.
 */
export async function fetchPrsByBranch(
  repoRoot: string,
  branchNames: string[]
): Promise<Map<string, PrInfo>> {
  const result = new Map<string, PrInfo>();
  if (branchNames.length === 0) return result;

  // One aliased field per branch (alias can't start with a digit -> "b<i>").
  const fields = branchNames
    .map(
      (name, i) =>
        `b${i}: pullRequests(headRefName: ${JSON.stringify(name)}, first: 1, ` +
        `states: [OPEN, MERGED, CLOSED], ` +
        `orderBy: {field: CREATED_AT, direction: DESC}) { nodes { ` +
        `number title state url isDraft headRefName baseRefName reviewDecision ` +
        `author { login } } }`
    )
    .join("\n");
  const repoData = await queryRepoGraphql(repoRoot, fields);
  if (!repoData) return result;

  branchNames.forEach((name, i) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (repoData[`b${i}`] as any)?.nodes?.[0];
    if (!node) return;
    result.set(name, {
      prNumber: node.number,
      title: node.title,
      state: normalizeState(node.state),
      reviewDecision: normalizeReview(node.reviewDecision),
      isDraft: Boolean(node.isDraft),
      url: node.url,
      headRefName: node.headRefName,
      baseRefName: node.baseRefName,
      authorGithubHandle: node.author?.login,
    });
  });
  return result;
}
