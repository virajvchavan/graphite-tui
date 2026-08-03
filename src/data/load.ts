import type { Branch, BranchMeta, RepoData } from "../types.js";
import {
  type BranchTracking,
  getBranchAges,
  getBranchTracking,
  getCurrentBranch,
  getRemoteWebUrl,
} from "./git.js";
import { readBranchMetadata } from "./metadata.js";
import { readPrInfo } from "./prInfo.js";
import {
  readRebaseState,
  readRepoConfig,
  resolveRepoPaths,
  type RepoPaths,
} from "./repo.js";

function isTrunkRow(validationResult: string | null, name: string, trunk: string): boolean {
  return validationResult === "TRUNK" || name === trunk;
}

/**
 * A branch needs a restack when the parent revision it was last rebased onto
 * no longer matches the parent's current tip (the parent moved). Falls back to
 * the recorded parent head revision when the parent row isn't tracked, and to
 * the BAD_PARENT_NAME validation result as a last resort.
 */
export function computeNeedsRestack(
  m: BranchMeta,
  isTrunk: boolean,
  meta: Map<string, BranchMeta>
): boolean {
  if (isTrunk) return false;
  const parentMeta = m.parentBranchName ? meta.get(m.parentBranchName) : undefined;
  const parentTip = parentMeta?.branchRevision ?? m.parentHeadRevision;
  if (
    m.parentBranchRevision != null &&
    parentTip != null &&
    m.parentBranchRevision !== parentTip
  ) {
    return true;
  }
  return m.validationResult === "BAD_PARENT_NAME";
}

/**
 * Drop metadata rows whose local git ref is gone. Graphite's SQLite cache keeps
 * a row after the branch itself is deleted outside gt — a plain `git branch -D`,
 * or a sync that pruned the ref but left the row behind — and `gt ls` hides
 * those because it reconciles against real refs. Rendering them is worse than
 * useless: the row looks actionable but every gt command on it fails with
 * "Could not find branch <name>".
 *
 * Children of a pruned branch are spliced onto its nearest surviving ancestor,
 * so a ghost in the middle of a stack doesn't take the live branches above it
 * out of the tree (they're only reachable from trunk via `children`).
 */
export function pruneMissingBranches(
  meta: Map<string, BranchMeta>,
  localBranches: Set<string>
): Map<string, BranchMeta> {
  // An empty set means the ref listing failed, not that every branch is gone.
  if (localBranches.size === 0) return meta;
  const survives = (name: string): boolean => localBranches.has(name);
  if ([...meta.keys()].every(survives)) return meta;

  // Nearest ancestor that still exists, following recorded parent links.
  const survivingAncestor = (name: string | null): string | null => {
    const seen = new Set<string>();
    let cur = name;
    while (cur && !seen.has(cur)) {
      if (survives(cur)) return cur;
      seen.add(cur);
      cur = meta.get(cur)?.parentBranchName ?? null;
    }
    return null;
  };

  // The surviving branches to attach in place of a pruned one: its own live
  // children, plus (recursively) those of any pruned children.
  const survivingDescendants = (name: string, seen: Set<string>): string[] => {
    if (seen.has(name)) return [];
    seen.add(name);
    const children = meta.get(name)?.children ?? [];
    return children.flatMap((c) =>
      survives(c) ? [c] : survivingDescendants(c, seen)
    );
  };

  const pruned = new Map<string, BranchMeta>();
  for (const [name, m] of meta) {
    if (!survives(name)) continue;
    const children = m.children.flatMap((c) =>
      survives(c) ? [c] : survivingDescendants(c, new Set([name]))
    );
    pruned.set(name, {
      ...m,
      parentBranchName: survivingAncestor(m.parentBranchName),
      children: [...new Set(children)],
    });
  }
  return pruned;
}

/**
 * Load the full repo data model: branch tree + PR info + ages + current branch.
 * Pure read; never mutates the repo.
 */
export function loadRepoData(cwd: string): { data: RepoData; paths: RepoPaths } {
  const paths = resolveRepoPaths(cwd);
  const config = readRepoConfig(paths);
  const tracking = getBranchTracking(paths.repoRoot);
  // `tracking` covers every local ref under refs/heads, so its keys double as
  // the set of branches that actually exist.
  const meta = pruneMissingBranches(
    readBranchMetadata(paths),
    new Set(tracking.keys())
  );
  const prs = readPrInfo(paths);
  const ages = getBranchAges(paths.repoRoot);
  const hasRemote = getRemoteWebUrl(paths.repoRoot) != null;
  const currentBranch = getCurrentBranch(paths.repoRoot);
  const rebase = readRebaseState(paths);

  // Build a Branch from its git-derived fields (age, tracking, PR) plus the
  // caller-supplied structural fields. Both the metadata-backed branches and
  // the synthesized current-branch entry below share this, so the derived
  // fields stay defined in one place.
  const makeBranch = (
    name: string,
    t: BranchTracking | undefined,
    structural: Pick<
      Branch,
      "parent" | "children" | "revision" | "isTrunk" | "needsRestack" | "state"
    >
  ): Branch => {
    const pr = prs.get(name) ?? null;
    return {
      name,
      ...structural,
      age: ages.get(name) ?? "",
      ahead: t?.ahead ?? 0,
      behind: t?.behind ?? 0,
      upstreamGone: t?.gone ?? false,
      unpushed: hasRemote && !structural.isTrunk && t != null && !t.hasUpstream,
      pr,
      displayTitle: pr?.title ?? name,
    };
  };

  const branches = new Map<string, Branch>();
  for (const [name, m] of meta) {
    const trunk = isTrunkRow(m.validationResult, name, config.trunk);
    branches.set(
      name,
      makeBranch(name, tracking.get(name), {
        parent: m.parentBranchName,
        children: m.children,
        revision: m.branchRevision,
        isTrunk: trunk,
        needsRestack: computeNeedsRestack(m, trunk, meta),
        state: m.state,
      })
    );
  }

  // The current branch may not be in Graphite's metadata at all — e.g. one
  // fetched/checked out with plain git that gt has never tracked. Synthesize a
  // minimal entry so the tree builder can still surface it (see the detached
  // handling in buildRenderRows); without this it would be invisible even in
  // the working-tree-vs-stack sense. Scoped to the current branch only, so we
  // don't flood the view with every stale local branch gt isn't tracking.
  if (
    currentBranch &&
    currentBranch !== config.trunk &&
    !branches.has(currentBranch) &&
    tracking.has(currentBranch)
  ) {
    branches.set(
      currentBranch,
      makeBranch(currentBranch, tracking.get(currentBranch), {
        parent: null,
        children: [],
        revision: null,
        isTrunk: false,
        needsRestack: false,
        state: null,
      })
    );
  }

  return {
    data: {
      repoRoot: paths.repoRoot,
      trunk: config.trunk,
      branches,
      currentBranch,
      rebase,
      lastFetchedPrInfoMs: config.lastFetchedPrInfoMs,
    },
    paths,
  };
}
