import { execa } from "execa";

/**
 * Predict whether restacking `branch` onto its `parent` would hit merge
 * conflicts, using `git merge-tree` (an in-memory merge that never touches the
 * working tree). Exit code 1 means the merge has conflicts; 0 means clean.
 *
 * This is a heuristic: it merges the branch with its parent's current tip
 * (their merge-base is where the branch was last based), which mirrors what a
 * restack replays. For deep stacks whose ancestors will also move it is an
 * approximation, but a reliable signal for the common case.
 *
 * Returns false on any error (e.g. parent ref missing, old git) — we never
 * want a detection failure to masquerade as a conflict.
 */
export async function branchConflictsWithParent(
  repoRoot: string,
  parent: string | null,
  branch: string
): Promise<boolean> {
  if (!parent) return false;
  try {
    const { exitCode } = await execa(
      "git",
      ["merge-tree", "--write-tree", parent, branch],
      { cwd: repoRoot, reject: false }
    );
    return exitCode === 1;
  } catch {
    return false;
  }
}
