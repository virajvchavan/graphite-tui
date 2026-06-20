import React from "react";
import { Box, Text } from "ink";
import type { RenderRow } from "../types.js";
import { BranchRow } from "./BranchRow.js";

interface Props {
  rows: RenderRow[];
  columnCount: number;
  selectedIndex: number;
  titleWidth: number;
  /** First visible branch row. */
  scrollOffset: number;
  /** Number of branch rows that fit. */
  visible: number;
  /** Names of branches predicted to conflict on restack. */
  conflictedBranches: Set<string>;
}

export function StackGraph({
  rows,
  columnCount,
  selectedIndex,
  titleWidth,
  scrollOffset,
  visible,
  conflictedBranches,
}: Props) {
  if (rows.length === 0) {
    return <Text color="gray">No tracked branches. Create one with `gt create`.</Text>;
  }
  const window = rows.slice(scrollOffset, scrollOffset + visible);
  const hiddenAbove = scrollOffset;
  const hiddenBelow = Math.max(0, rows.length - (scrollOffset + visible));
  return (
    <Box flexDirection="column">
      {hiddenAbove > 0 ? (
        <Text color="gray">{`     ↑ ${hiddenAbove} more`}</Text>
      ) : null}
      {window.map((row, i) => {
        const absolute = scrollOffset + i;
        return (
          <BranchRow
            key={row.branch.name}
            row={row}
            columnCount={columnCount}
            selected={absolute === selectedIndex}
            titleWidth={titleWidth}
            conflicted={conflictedBranches.has(row.branch.name)}
          />
        );
      })}
      {hiddenBelow > 0 ? (
        <Text color="gray">{`     ↓ ${hiddenBelow} more`}</Text>
      ) : null}
    </Box>
  );
}
