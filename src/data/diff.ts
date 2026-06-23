import { execa } from "execa";
import type { WorkingFile } from "./status.js";

/** A single rendered line of a unified diff, with the surrounding `@@` hunk
 * headers resolved into running old/new line numbers. */
export interface DiffRow {
  kind: "add" | "del" | "context" | "hunk";
  /** Old-file line number (set for `del`/`context`), else null. */
  oldNo: number | null;
  /** New-file line number (set for `add`/`context`), else null. */
  newNo: number | null;
  /** Line content with the leading +/-/space stripped; for a `hunk` row this
   * is the section heading (the text after the second `@@`), possibly empty. */
  text: string;
}

/** Expand tabs to two spaces so the full-width background and gutter stay
 * column-aligned (a literal tab measures as one column but renders wider). */
function expandTabs(s: string): string {
  return s.replace(/\t/g, "  ");
}

/**
 * Parse unified-diff text into renderable rows, tracking old/new line numbers
 * from each `@@` hunk header. File-level metadata (`diff --git`, `index`, the
 * `---`/`+++` paths, mode/rename lines) lives before the first hunk and is
 * dropped — the viewer already shows the path in its header. Each non-leading
 * hunk yields a `hunk` separator row carrying the section heading.
 */
export function parseUnifiedDiff(text: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;
  for (const raw of text.replace(/\n$/, "").split("\n")) {
    if (raw.startsWith("@@")) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/.exec(raw);
      if (m) {
        oldNo = parseInt(m[1], 10);
        newNo = parseInt(m[2], 10);
        if (inHunk)
          rows.push({ kind: "hunk", oldNo: null, newNo: null, text: m[3].trim() });
      }
      inHunk = true;
      continue;
    }
    if (!inHunk) continue; // file-level header metadata
    if (raw.startsWith("\\")) continue; // "\ No newline at end of file"
    if (raw.startsWith("+")) {
      rows.push({ kind: "add", oldNo: null, newNo, text: expandTabs(raw.slice(1)) });
      newNo++;
    } else if (raw.startsWith("-")) {
      rows.push({ kind: "del", oldNo, newNo: null, text: expandTabs(raw.slice(1)) });
      oldNo++;
    } else {
      const content = raw.startsWith(" ") ? raw.slice(1) : raw;
      rows.push({ kind: "context", oldNo, newNo, text: expandTabs(content) });
      oldNo++;
      newNo++;
    }
  }
  return rows;
}

/**
 * The unified-diff text for a single file in `branch` relative to its `parent`,
 * using the same GitHub-PR (merge-base) three-dot semantic as `getChangedFiles`.
 * Returns "" for a branch with no parent or on any git error.
 */
export async function getBranchFileDiff(
  repoRoot: string,
  parent: string | null,
  branch: string,
  path: string
): Promise<string> {
  if (!parent) return "";
  const range = `${parent}...${branch}`;
  try {
    const { stdout } = await execa(
      "git",
      ["diff", "--no-color", range, "--", path],
      { cwd: repoRoot }
    );
    return stdout;
  } catch {
    return "";
  }
}

/**
 * The unified-diff text for a single working-tree file. Untracked files are
 * diffed against /dev/null so the whole file shows as added; everything else is
 * the combined staged+unstaged diff vs HEAD (matching the vs-HEAD line counts in
 * `getWorkingStatus`). Returns "" on any git error.
 */
export async function getWorktreeFileDiff(
  repoRoot: string,
  file: WorkingFile
): Promise<string> {
  if (file.untracked) {
    try {
      // `--no-index` exits non-zero when there's a difference (which is always,
      // here), so a populated stdout is the success signal — not the exit code.
      const { stdout } = await execa(
        "git",
        ["diff", "--no-color", "--no-index", "--", "/dev/null", file.path],
        { cwd: repoRoot, reject: false }
      );
      return stdout;
    } catch {
      return "";
    }
  }
  // Include the original path too so a rename's old side shows up.
  const paths = file.origPath ? [file.origPath, file.path] : [file.path];
  try {
    const { stdout } = await execa(
      "git",
      ["diff", "--no-color", "HEAD", "--", ...paths],
      { cwd: repoRoot }
    );
    return stdout;
  } catch {
    return "";
  }
}
