import { execa } from "execa";
import type { ChangedFile } from "../types.js";

/**
 * Parse `git diff --name-status` output into ChangedFile entries.
 *
 * Lines are tab-separated. Renames/copies look like:
 *   R100\told/path\tnew/path   ->  status "R", path = new path
 * Everything else:
 *   M\tpath
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
    if (path) files.push({ status, path });
  }
  return files;
}

/**
 * Files changed in `branch` relative to its `parent`, using the GitHub-PR
 * (merge-base) three-dot semantic. Returns [] for a branch with no parent
 * (e.g. trunk) or on any git error.
 */
export async function getChangedFiles(
  repoRoot: string,
  parent: string | null,
  branch: string
): Promise<ChangedFile[]> {
  if (!parent) return [];
  try {
    const { stdout } = await execa(
      "git",
      ["diff", "--name-status", `${parent}...${branch}`],
      { cwd: repoRoot }
    );
    return parseNameStatus(stdout);
  } catch {
    return [];
  }
}
