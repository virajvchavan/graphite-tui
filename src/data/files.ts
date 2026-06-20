import { execa } from "execa";
import type { ChangedFile } from "../types.js";

/**
 * Parse `git diff --name-status` output into ChangedFile entries.
 *
 * Lines are tab-separated. Renames/copies look like:
 *   R100\told/path\tnew/path   ->  status "R", path = new path
 * Everything else:
 *   M\tpath
 *
 * Additions/deletions default to 0; they're filled in from numstat by
 * `getChangedFiles`.
 */
export function parseNameStatus(stdout: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const code = parts[0];
    const status = code[0]; // R100 -> R, C75 -> C
    // For rename/copy the last field is the destination path.
    const path = parts.length >= 3 ? parts[parts.length - 1] : parts[1];
    if (path) files.push({ status, path, additions: 0, deletions: 0 });
  }
  return files;
}

/**
 * Parse `git diff --numstat -z` output into per-path line counts.
 *
 * Records are NUL-separated. A normal record is one token:
 *   "<add>\t<del>\t<path>"
 * A rename/copy splits the path across the next two tokens (old, new):
 *   "<add>\t<del>\t" , "<oldpath>" , "<newpath>"
 * Binary files report "-" for both counts.
 *
 * Keyed by the destination path so it matches name-status entries.
 */
export function parseNumstat(
  stdout: string
): Map<string, { additions: number; deletions: number }> {
  const map = new Map<string, { additions: number; deletions: number }>();
  const tokens = stdout.split("\0");
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (!tok) {
      i++;
      continue;
    }
    const parts = tok.split("\t");
    if (parts.length < 3) {
      i++;
      continue;
    }
    const additions = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
    const deletions = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
    let path = parts[2];
    if (path === "") {
      // Rename/copy: the old and new paths are the next two tokens.
      const newPath = tokens[i + 2];
      const oldPath = tokens[i + 1];
      path = newPath ?? oldPath ?? "";
      i += 3;
    } else {
      i += 1;
    }
    if (path) map.set(path, { additions, deletions });
  }
  return map;
}

/**
 * Files changed in `branch` relative to its `parent`, using the GitHub-PR
 * (merge-base) three-dot semantic, including per-file line counts. Returns []
 * for a branch with no parent (e.g. trunk) or on any git error.
 */
export async function getChangedFiles(
  repoRoot: string,
  parent: string | null,
  branch: string
): Promise<ChangedFile[]> {
  if (!parent) return [];
  const range = `${parent}...${branch}`;
  try {
    const [nameStatus, numstat] = await Promise.all([
      execa("git", ["diff", "--name-status", range], { cwd: repoRoot }),
      execa("git", ["diff", "--numstat", "-z", range], { cwd: repoRoot }),
    ]);
    const files = parseNameStatus(nameStatus.stdout);
    const counts = parseNumstat(numstat.stdout);
    for (const f of files) {
      const c = counts.get(f.path);
      if (c) {
        f.additions = c.additions;
        f.deletions = c.deletions;
      }
    }
    return files;
  } catch {
    return [];
  }
}
