import React from "react";
import { Box, Text } from "ink";
import type { PrLiveStatus, RenderRow } from "../types.js";
import { BranchRow } from "./BranchRow.js";
import { colors, prBadge } from "./theme.js";

interface Props {
  rows: RenderRow[];
  columnCount: number;
  selectedIndex: number;
  /** Whether the branch list has focus (its selection is bright if so). */
  focused: boolean;
  /** Max width of the rows; bounds where right-aligned metadata sits. */
  width: number;
  titleWidth: number;
  /** First visible branch row. */
  scrollOffset: number;
  /** Number of branch rows that fit. */
  visible: number;
  /** Names of branches predicted to conflict on restack. */
  conflictedBranches: Set<string>;
  /** Live per-PR status (comment counts + CI) keyed by PR number. */
  prStatus: Map<number, PrLiveStatus>;
}

export function StackGraph({
  rows,
  columnCount,
  selectedIndex,
  focused,
  width,
  titleWidth,
  scrollOffset,
  visible,
  conflictedBranches,
  prStatus,
}: Props) {
  if (rows.length === 0) {
    return <Text color={colors.dim}>No tracked branches. Create one with `gt create`.</Text>;
  }
  const window = rows.slice(scrollOffset, scrollOffset + visible);
  const hiddenAbove = scrollOffset;
  const hiddenBelow = Math.max(0, rows.length - (scrollOffset + visible));

  // Fixed widths for the three rightmost columns (PR#, status, age) so they
  // line up vertically across rows regardless of each row's values. Computed
  // over all rows for stability (no shift while scrolling).
  let prW = 0;
  let statusW = 0;
  let ageW = 0;
  // CI column is present (1 col, a single-width glyph) only if some PR has a
  // CI status; otherwise it collapses to nothing.
  let ciW = 0;
  for (const { branch } of rows) {
    if (branch.pr) prW = Math.max(prW, `#${branch.pr.prNumber}`.length);
    const b = prBadge(branch.pr);
    if (b) statusW = Math.max(statusW, b.text.length);
    if (branch.age) ageW = Math.max(ageW, branch.age.length);
    if (branch.pr && prStatus.get(branch.pr.prNumber)?.ci) ciW = 1;
  }
  return (
    <Box flexDirection="column" width={width}>
      {hiddenAbove > 0 ? (
        <Text color={colors.dim}>{`     ↑ ${hiddenAbove} more`}</Text>
      ) : null}
      {window.map((row, i) => {
        const absolute = scrollOffset + i;
        const status = row.branch.pr
          ? prStatus.get(row.branch.pr.prNumber)
          : undefined;
        return (
          <BranchRow
            key={row.branch.name}
            row={row}
            columnCount={columnCount}
            selected={absolute === selectedIndex}
            focused={focused}
            width={width}
            titleWidth={titleWidth}
            prW={prW}
            statusW={statusW}
            ageW={ageW}
            ciW={ciW}
            conflicted={conflictedBranches.has(row.branch.name)}
            mergeConflict={
              row.branch.pr?.state === "OPEN" &&
              status?.mergeable === "conflicting"
            }
            threadCounts={status?.threads}
            ci={status?.ci}
          />
        );
      })}
      {hiddenBelow > 0 ? (
        <Text color={colors.dim}>{`     ↓ ${hiddenBelow} more`}</Text>
      ) : null}
    </Box>
  );
}
