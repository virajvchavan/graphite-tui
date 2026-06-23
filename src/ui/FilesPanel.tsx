import React from "react";
import { Box, Text } from "ink";
import type { ChangedFile } from "../types.js";
import { colors, fileStatusColor } from "./theme.js";
import { DiffCount, FilePath, countWidths } from "./fileRow.js";

interface Props {
  branchName: string;
  /** Parent branch this diff is computed against (null for trunk). */
  parentName: string | null;
  files: ChangedFile[];
  loading: boolean;
  /** True when no parent diff is possible (e.g. trunk). */
  noParent: boolean;
  /** Render header only (space is tight); the user can expand it. */
  collapsed?: boolean;
  focused: boolean;
  /** Index of the highlighted file when focused. */
  cursor: number;
  /** First visible file index. */
  scrollOffset: number;
  /** Number of file rows this panel can show. */
  visible: number;
  width: number;
}

export function FilesPanel({
  branchName,
  parentName,
  files,
  loading,
  noParent,
  collapsed = false,
  focused,
  cursor,
  scrollOffset,
  visible,
  width,
}: Props) {
  const caret = collapsed ? "▸" : focused ? "▾" : "▸";
  const count = files.length;
  const window = files.slice(scrollOffset, scrollOffset + visible);
  const hiddenAbove = scrollOffset;
  const hiddenBelow = Math.max(0, count - (scrollOffset + visible));

  // Branch-wide totals, GitHub-style.
  const totalAdd = files.reduce((n, f) => n + f.additions, 0);
  const totalDel = files.reduce((n, f) => n + f.deletions, 0);

  // Size the `+` and `-` columns to the widest value in view so the counts
  // line up vertically; a column with no values anywhere collapses to 0.
  const { addW, delW, countCol } = countWidths(window);
  // 2 leading cols for the "M " status letter; the path column fills the rest so
  // the row (and its selection highlight) spans the full width up to the counts.
  const pathWidth = Math.max(10, width - 2 - countCol);

  // The header is one line with: caret + "branch diff" + the branch name + a
  // block of trailing metadata (file count, +/- totals, collapsed marker). The
  // name is the only elastic part, so we measure everything else and truncate
  // the name in JS — Ink's flex truncation is unreliable inside a row and lets
  // a long name wrap the whole header to a second line.
  const fileCountText = loading
    ? "loading…"
    : noParent
      ? "trunk (no diff)"
      : `${count} file${count === 1 ? "" : "s"}`;
  const showTotals = !loading && !noParent && (totalAdd > 0 || totalDel > 0);
  const totalsText = showTotals
    ? `${totalAdd > 0 ? `+${totalAdd}` : ""}${
        totalAdd > 0 && totalDel > 0 ? " " : ""
      }${totalDel > 0 ? `-${totalDel}` : ""}`
    : "";
  const collapsedText = collapsed ? (focused ? "↵ expand" : "collapsed") : "";
  // Each metadata segment is preceded by a 2-space gap. On trunk the count
  // ("trunk (no diff)") moves to its own line, so it doesn't reserve header room.
  const trailingWidth =
    (noParent ? 0 : 2 + fileCountText.length) +
    (showTotals ? 2 + totalsText.length : 0) +
    (collapsed ? 2 + collapsedText.length : 0);
  const fullName = noParent ? branchName : `${branchName} vs ${parentName}`;
  // Budget for the name itself (after the caret, "branch diff", its own 2-space
  // gap, and the trailing metadata).
  const nameBudget = Math.max(0, width - 2 - "branch diff".length - 2 - trailingWidth);
  const nameShown =
    fullName.length > nameBudget
      ? nameBudget <= 1
        ? "…"
        : fullName.slice(0, nameBudget - 1) + "…"
      : fullName;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box width={width}>
        <Text color={focused ? colors.current : colors.dim}>{caret} </Text>
        <Text bold color={focused ? colors.current : undefined}>
          branch diff
        </Text>
        <Text color={colors.dim}>
          {"  "}
          {nameShown}
        </Text>
        {!noParent && (
          <Text color={colors.dim}>
            {"  "}
            {fileCountText}
          </Text>
        )}
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
        {collapsed && (
          <Text color={colors.dim}>
            {"  "}
            {collapsedText}
          </Text>
        )}
      </Box>

      {noParent && <Text color={colors.dim}> trunk (no diff)</Text>}

      {!collapsed && hiddenAbove > 0 && (
        <Text color={colors.dim}>{`  ↑ ${hiddenAbove} more`}</Text>
      )}

      {!collapsed && !loading && !noParent && count === 0 && (
        <Text color={colors.dim}> no files</Text>
      )}

      {!collapsed &&
        window.map((f, i) => {
          const idx = scrollOffset + i;
          // Only the focused panel highlights a row — the diff doesn't keep a
          // breadcrumb when you leave it.
          const bg = focused && idx === cursor ? colors.selectedBg : undefined;
          return (
            <Box key={f.path} width={width}>
              <Text backgroundColor={bg} wrap="truncate-end">
                <Text color={fileStatusColor(f.status)}>{f.status[0]} </Text>
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

      {!collapsed && hiddenBelow > 0 && (
        <Text color={colors.dim}>{`  ↓ ${hiddenBelow} more`}</Text>
      )}
    </Box>
  );
}
