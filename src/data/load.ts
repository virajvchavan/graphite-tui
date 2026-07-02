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
 * Load the full repo data model: branch tree + PR info + ages + current branch.
 * Pure read; never mutates the repo.
 */
export function loadRepoData(cwd: string): { data: RepoData; paths: RepoPaths } {
  const paths = resolveRepoPaths(cwd);
  const config = readRepoConfig(paths);
  const meta = readBranchMetadata(paths);
  const prs = readPrInfo(paths);
  const ages = getBranchAges(paths.repoRoot);
  const tracking = getBranchTracking(paths.repoRoot);
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
