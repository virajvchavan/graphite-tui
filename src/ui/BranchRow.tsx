import React from "react";
import { Box, Text } from "ink";
import type { RenderRow } from "../types.js";
import { buildGutter } from "./graph.js";
import { colors, prBadge } from "./theme.js";

interface Props {
  row: RenderRow;
  columnCount: number;
  selected: boolean;
  /** Max width available for the title column. */
  titleWidth: number;
}

export function BranchRow({ row, columnCount, selected, titleWidth }: Props) {
  const cells = buildGutter(row, columnCount);
  const { branch } = row;
  const badge = prBadge(branch.pr);

  const titleColor = branch.isTrunk
    ? colors.trunk
    : row.isCurrent
      ? colors.current
      : undefined;

  return (
    <Box>
      {/* current-branch arrow gutter */}
      <Text color={colors.current}>{row.isCurrent ? "› " : "  "}</Text>

      {/* graph gutter */}
      <Text>
        {cells.map((cell, i) => (
          <Text key={i}>
            <Text
              color={cell.isNode ? (row.isCurrent ? colors.current : colors.node) : colors.graphLine}
              bold={cell.isNode && row.isCurrent}
            >
              {cell.glyph}
            </Text>
            <Text color={colors.graphLine}>{cell.after}</Text>
          </Text>
        ))}
      </Text>

      <Text> </Text>

      {/* title + badges + age, highlighted when selected */}
      <Box width={titleWidth} flexDirection="column">
        <Box>
          <Text
            color={selected ? undefined : titleColor}
            backgroundColor={selected ? colors.selectedBg : undefined}
            bold={row.isCurrent || branch.isTrunk}
            wrap="truncate-end"
          >
            {branch.displayTitle}
          </Text>
        </Box>
      </Box>

      <Box flexGrow={1} />

      {/* right-aligned metadata */}
      {branch.needsRestack && (
        <Text color={colors.needsRestack} bold> ⇈ restack</Text>
      )}
      {branch.pr && (
        <Text color={colors.prNumber}> #{branch.pr.prNumber}</Text>
      )}
      {badge && <Text color={badge.color}> {badge.text}</Text>}
      {branch.age && <Text color={colors.age}> {branch.age}</Text>}
    </Box>
  );
}
