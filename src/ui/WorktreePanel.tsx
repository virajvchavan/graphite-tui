import React from "react";
import { Box, Text } from "ink";
import type { WorkingFile } from "../data/status.js";
import { colors, worktreeStatusColor } from "./theme.js";
import { DiffCount, FilePath, countWidths } from "./fileRow.js";

interface Props {
  /** Current checked-out branch (working tree acts on this branch). */
  branchName: string | null;
  files: WorkingFile[];
  focused: boolean;
  /** Index of the highlighted file when focused. */
  cursor: number;
  /** First visible file index. */
  scrollOffset: number;
  /** Number of file rows this panel can show. */
  visible: number;
  width: number;
}

/**
 * Staged-state marker, by fill level so it reads without relying on color:
 *   ● fully staged · ◐ partially staged (staged + more unstaged) · ○ not staged.
 */
function stagedMarker(f: WorkingFile): { ch: string; color: string } {
  if (f.staged && f.unstaged) return { ch: "◐", color: colors.modified };
  if (f.staged) return { ch: "●", color: colors.added };
  return { ch: "○", color: colors.dim };
}

/** The change-type letter (M/A/D/R/?), colored by kind, not by staged-ness. */
function changeLetter(f: WorkingFile): { ch: string; color: string } {
  if (f.untracked) return { ch: "?", color: colors.dim };
  const ch = f.index !== " " && f.index !== "?" ? f.index : f.worktree;
  return { ch, color: worktreeStatusColor(ch) };
}

/** Marker (staged state) + change-type letter for one working-tree file. */
function StatusCell({ file }: { file: WorkingFile }) {
  const marker = stagedMarker(file);
  const letter = changeLetter(file);
  return (
    <Text>
      <Text color={marker.color}>{marker.ch}</Text>
      <Text> </Text>
      <Text color={letter.color}>{letter.ch}</Text>
    </Text>
  );
}

export function WorktreePanel({
  branchName,
  files,
  focused,
  cursor,
  scrollOffset,
  visible,
  width,
}: Props) {
  const caret = focused ? "▾" : "▸";
  const count = files.length;
  const window = files.slice(scrollOffset, scrollOffset + visible);
  const hiddenAbove = scrollOffset;
  const hiddenBelow = Math.max(0, count - (scrollOffset + visible));

  const stagedCount = files.filter((f) => f.staged).length;
  const unstagedCount = files.filter((f) => f.unstaged || f.untracked).length;

  // Working-tree-wide totals, GitHub-style, mirroring the branch-diff header.
  const totalAdd = files.reduce((n, f) => n + f.additions, 0);
  const totalDel = files.reduce((n, f) => n + f.deletions, 0);
  const showTotals = totalAdd > 0 || totalDel > 0;
  const fileCountText = `${count} file${count === 1 ? "" : "s"}`;

  // The header is one line: caret + "working tree" + staged/unstaged + the
  // branch name + a trailing metadata block (file count, +/- totals). The name
  // is the only elastic part, so we measure everything else and truncate the
  // name in JS — Ink's flex truncation is unreliable inside a row and lets a
  // long name wrap the whole header to a second line. Truncating the name fills
  // the slack, pushing the trailing block flush right like the branch diff.
  const statusText =
    count > 0
      ? `  ● ${stagedCount} staged · ○ ${unstagedCount} unstaged`
      : "";
  const totalsText = showTotals
    ? `${totalAdd > 0 ? `+${totalAdd}` : ""}${
        totalAdd > 0 && totalDel > 0 ? " " : ""
      }${totalDel > 0 ? `-${totalDel}` : ""}`
    : "";
  const trailingText =
    count > 0 ? `  ${fileCountText}${showTotals ? `  ${totalsText}` : ""}` : "";
  const onText = branchName ? "  on " : "";
  const nameBudget = Math.max(
    0,
    width - 2 - "working tree".length - statusText.length - onText.length - trailingText.length
  );
  const nameShown = !branchName
    ? ""
    : branchName.length > nameBudget
      ? nameBudget <= 1
        ? "…"
        : branchName.slice(0, nameBudget - 1) + "…"
      : branchName;

  const { addW, delW, countCol } = countWidths(window);
  // 4 leading cols for the "● M " marker+letter; the path column fills the rest
  // so the row (and its selection highlight) spans the full width up to the
  // count block.
  const pathWidth = Math.max(10, width - 4 - countCol);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box width={width}>
        {/* Single Text node, truncate-end as a safety net; the name is already
            JS-truncated above so the trailing totals block lands flush right. */}
        <Text wrap="truncate-end">
          <Text color={focused ? colors.current : colors.dim}>{caret} </Text>
          <Text bold color={focused ? colors.current : undefined}>
            working tree
          </Text>
          {count > 0 && (
            <>
              <Text color={colors.dim}>{"  "}</Text>
              <Text color={colors.added}>●</Text>
              <Text color={colors.dim}> {stagedCount} staged · </Text>
              <Text color={colors.dim}>○</Text>
              <Text color={colors.dim}> {unstagedCount} unstaged</Text>
            </>
          )}
          {branchName && (
            <Text color={colors.dim}>
              {"  on "}
              {nameShown}
            </Text>
          )}
          {count > 0 && (
            <>
              <Text color={colors.dim}>
                {"  "}
                {fileCountText}
              </Text>
              {showTotals && (
                <Text>
                  {"  "}
                  <DiffCount
                    additions={totalAdd}
                    deletions={totalDel}
                    addW={totalAdd > 0 ? `+${totalAdd}`.length : 0}
                    delW={totalDel > 0 ? `-${totalDel}`.length : 0}
                  />
                </Text>
              )}
            </>
          )}
        </Text>
      </Box>

      {count === 0 && <Text color={colors.dim}> No changes</Text>}

      {hiddenAbove > 0 && <Text color={colors.dim}>{`  ↑ ${hiddenAbove} more`}</Text>}

      {window.map((f, i) => {
        const idx = scrollOffset + i;
        // Only the focused panel highlights a row — the working tree doesn't
        // keep a breadcrumb when you leave it.
        const bg = focused && idx === cursor ? colors.selectedBg : undefined;
        return (
          <Box key={f.path} width={width}>
            <Text backgroundColor={bg} wrap="truncate-end">
              <StatusCell file={f} />
              <Text> </Text>
              <FilePath path={f.path} width={pathWidth} />
            </Text>
            <Text backgroundColor={bg}>
              <DiffCount
                additions={f.additions}
                deletions={f.deletions}
                addW={addW}
                delW={delW}
              />
            </Text>
          </Box>
        );
      })}

      {hiddenBelow > 0 && <Text color={colors.dim}>{`  ↓ ${hiddenBelow} more`}</Text>}
    </Box>
  );
}
