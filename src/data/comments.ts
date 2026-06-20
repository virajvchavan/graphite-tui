import { execa } from "execa";
import { getRemoteOwnerRepo } from "./git.js";
import type { CiStatus, PrLiveStatus } from "../types.js";

/** Map GitHub's StatusState enum to our coarse CI status. */
function mapCiState(state: unknown): CiStatus {
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

/**
 * Live per-PR status (review-comment thread counts + rolled-up CI state),
 * fetched from GitHub in a single batched GraphQL call via `gh`. Best-effort:
 * returns an empty map (never throws) when `gh` is missing, unauthenticated,
 * offline, or the remote isn't on GitHub. Threads are capped at the first 100
 * per PR (plenty in practice). CI status is read from the last commit's
 * statusCheckRollup.
 */
export async function fetchPrStatus(
  repoRoot: string,
  prNumbers: number[]
): Promise<Map<number, PrLiveStatus>> {
  const result = new Map<number, PrLiveStatus>();
  if (prNumbers.length === 0) return result;
  const repo = getRemoteOwnerRepo(repoRoot);
  if (!repo) return result;

  // One aliased field per PR (alias can't start with a digit -> "p<number>").
  const fields = prNumbers
    .map(
      (n) =>
        `p${n}: pullRequest(number: ${n}) { ` +
        `reviewThreads(first: 100) { nodes { isResolved } } ` +
        `commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }`
    )
    .join("\n");
  const query =
    `query($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ ${fields} } }`;

  try {
    const { stdout } = await execa(
      "gh",
      [
        "api",
        "graphql",
        "-f",
        `query=${query}`,
        "-F",
        `owner=${repo.owner}`,
        "-F",
        `name=${repo.name}`,
      ],
      { cwd: repoRoot }
    );
    const repoData = JSON.parse(stdout)?.data?.repository ?? {};
    for (const n of prNumbers) {
      const pr = repoData[`p${n}`];
      if (!pr) continue;
      const nodes = pr.reviewThreads?.nodes;
      const threads = Array.isArray(nodes)
        ? {
            total: nodes.length,
            resolved: nodes.filter((t: { isResolved?: boolean }) => t.isResolved)
              .length,
          }
        : { total: 0, resolved: 0 };
      const ci = mapCiState(
        pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state
      );
      result.set(n, { threads, ci });
    }
  } catch {
    /* gh missing / not authed / offline / not a GitHub remote -> show nothing */
  }
  return result;
}
