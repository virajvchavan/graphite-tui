import React from "react";
import { Box, Text } from "ink";
import type { RenderRow } from "../types.js";
import { BranchRow } from "./BranchRow.js";

interface Props {
  rows: RenderRow[];
  columnCount: number;
  selectedIndex: number;
  titleWidth: number;
}

export function StackGraph({ rows, columnCount, selectedIndex, titleWidth }: Props) {
  if (rows.length === 0) {
    return <Text color="gray">No tracked branches. Create one with `gt create`.</Text>;
  }
  return (
    <Box flexDirection="column">
      {rows.map((row, i) => (
        <BranchRow
          key={row.branch.name}
          row={row}
          columnCount={columnCount}
          selected={i === selectedIndex}
          titleWidth={titleWidth}
        />
      ))}
    </Box>
  );
}
