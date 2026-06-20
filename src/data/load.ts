import type { Branch, BranchMeta, RepoData } from "../types.js";
import { getBranchAges, getCurrentBranch } from "./git.js";
import { readBranchMetadata } from "./metadata.js";
import { readPrInfo } from "./prInfo.js";
import { readRepoConfig, resolveRepoPaths, type RepoPaths } from "./repo.js";

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
  const currentBranch = getCurrentBranch(paths.repoRoot);

  const branches = new Map<string, Branch>();
  for (const [name, m] of meta) {
    const trunk = isTrunkRow(m.validationResult, name, config.trunk);
    const pr = prs.get(name) ?? null;
    const needsRestack = computeNeedsRestack(m, trunk, meta);
    branches.set(name, {
      name,
      parent: m.parentBranchName,
      children: m.children,
      isTrunk: trunk,
      needsRestack,
      state: m.state,
      age: ages.get(name) ?? "",
      pr,
      displayTitle: pr?.title ?? name,
    });
  }

  return {
    data: {
      repoRoot: paths.repoRoot,
      trunk: config.trunk,
      branches,
      currentBranch,
      lastFetchedPrInfoMs: config.lastFetchedPrInfoMs,
    },
    paths,
  };
}
