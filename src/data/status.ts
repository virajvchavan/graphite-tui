import { execa } from "execa";
import { parseNumstat } from "./files.js";

/** A single entry from the working tree (`git status`). */
export interface WorkingFile {
  /** Index (staged) status char; " " when there's no staged change. */
  index: string;
  /** Worktree (unstaged) status char; " " when there's no unstaged change. */
  worktree: string;
  /** Repo-relative path (the new path for renames/copies). */
  path: string;
  /** Original path for renames/copies, if any. */
  origPath?: string;
  /** Has a staged change (index is not " " and not "?"). */
  staged: boolean;
  /** Has an unstaged worktree change (worktree is not " "). */
  unstaged: boolean;
  /** Untracked ("??") — not yet known to git. */
  untracked: boolean;
  /** Lines added vs HEAD (0 for untracked/binary or when unknown). */
  additions: number;
  /** Lines removed vs HEAD (0 for untracked/binary or when unknown). */
  deletions: number;
}

/**
 * Parse `git status --porcelain=v1 -z` output into WorkingFile entries.
 *
 * Records are NUL-separated. A normal record is one token:
 *   "XY␠<path>"            (XY = two status chars, then a space, then the path)
 * A rename/copy (X is "R" or "C") spans two tokens — the destination path is in
 * the first token after "XY ", and the source path is the *next* token:
 *   "R␠<newpath>" , "<oldpath>"
 * Untracked files report "??"; ignored "!!".
 */
export function parseStatus(stdout: string): WorkingFile[] {
  const files: WorkingFile[] = [];
  const tokens = stdout.split("\0");
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (!tok) {
      i++;
      continue;
    }
    const index = tok[0];
    const worktree = tok[1];
    const path = tok.slice(3); // skip "XY "
    let origPath: string | undefined;
    if (index === "R" || index === "C" || worktree === "R" || worktree === "C") {
      // The source path is the following NUL-separated token.
      origPath = tokens[i + 1];
      i += 2;
    } else {
      i += 1;
    }
    if (!path) continue;
    files.push({
      index,
      worktree,
      path,
      origPath,
      staged: index !== " " && index !== "?",
      unstaged: worktree !== " " && worktree !== "?",
      untracked: index === "?" && worktree === "?",
      additions: 0,
      deletions: 0,
    });
  }
  return files;
}

/**
 * The current working-tree status (staged + unstaged + untracked files),
 * including best-effort per-file line counts vs HEAD. Returns [] on any git
 * error (e.g. mid-rebase index lock); the next refresh will retry.
 */
export async function getWorkingStatus(repoRoot: string): Promise<WorkingFile[]> {
  try {
    const status = await execa(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd: repoRoot }
    );
    const files = parseStatus(status.stdout);
    if (files.length === 0) return files;
    // Best-effort line counts vs HEAD (covers tracked staged+unstaged changes;
    // untracked files have none). Non-essential — ignore failures.
    try {
      const numstat = await execa(
        "git",
        ["diff", "--numstat", "-z", "HEAD"],
        { cwd: repoRoot }
      );
      const counts = parseNumstat(numstat.stdout);
      for (const f of files) {
        const c = counts.get(f.path);
        if (c) {
          f.additions = c.additions;
          f.deletions = c.deletions;
        }
      }
    } catch {
      /* counts are optional */
    }
    return files;
  } catch {
    return [];
  }
}
