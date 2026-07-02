import React from "react";
import { Box, Text } from "ink";
import type {
  CiStatus,
  PrLiveStatus,
  RenderRow,
  ReviewThreadCounts,
} from "../types.js";
import { buildGutter } from "./graph.js";
import { ciBadge, colors, prBadge, selectionBg } from "./theme.js";

interface Props {
  row: RenderRow;
  columnCount: number;
  selected: boolean;
  /** Whether the branch list currently has focus (selection is bright if so). */
  focused: boolean;
  /** Total row width; bounds where the right-aligned metadata sits. */
  width: number;
  /** Max width available for the title column. */
  titleWidth: number;
  /** Fixed widths for the right-aligned CI, PR#, status, and age columns. */
  prW: number;
  statusW: number;
  ageW: number;
  ciW: number;
  /** True when restacking this branch is predicted to conflict. */
  conflicted?: boolean;
  /** True when GitHub reports this branch's PR as conflicting with its base. */
  mergeConflict?: boolean;
  /** Resolved/total review threads for this branch's PR, if fetched. */
  threadCounts?: ReviewThreadCounts;
  /** Rolled-up CI status for this branch's PR, if fetched. */
  ci?: CiStatus;
  /** Live GitHub status for this branch's PR; overrides the stale cache. */
  live?: PrLiveStatus;
}

interface Segment {
  text: string;
  color?: string;
  bold?: boolean;
}

/** Display width: each emoji (💬) renders two columns; everything else one. */
function segWidth(text: string): number {
  return [...text].length + (text.includes("💬") ? 1 : 0);
}

/** Truncate or right-pad `text` to exactly `w` display columns. */
function fit(text: string, w: number): string {
  const chars = [...text];
  if (chars.length > w) return chars.slice(0, w).join("");
  return text + " ".repeat(w - chars.length);
}

export function BranchRow({
  row,
  columnCount,
  selected,
  focused,
  width,
  titleWidth,
  prW,
  statusW,
  ageW,
  ciW,
  conflicted,
  mergeConflict,
  threadCounts,
  ci,
  live,
}: Props) {
  const cells = buildGutter(row, columnCount);
  const { branch } = row;
  const badge = prBadge(branch.pr, live);
  const bg = selectionBg(selected, focused);
  // Gray text is low-contrast on the blue selection bg; brighten it when selected.
  const lit = (c?: string) =>
    selected && c === "gray" ? colors.selectedDim : c;

  const titleColor = branch.isTrunk
    ? colors.trunk
    : row.isCurrent
      ? colors.current
      : undefined;

  // Right-aligned metadata, built as measurable segments so the gap before it
  // can be filled with spaces (needed for a full-width selection highlight,
  // since Ink only paints background on Text, not on an empty flex spacer).
  //
  // The three rightmost columns (PR#, status, age) are fixed width so they line
  // up vertically across rows; variable indicators (comments, restack,
  // ahead/behind) sit to their left.
  const meta: Segment[] = [];
  if (row.detached) {
    // Not part of any stack — gt has no parent for it. Flag it so it's clear
    // this row is a checked-out branch outside the graph, not a stack tip.
    meta.push({ text: " ○ not in stack", color: colors.warning });
  }
  if (threadCounts && threadCounts.total > 0) {
    meta.push({
      text: ` 💬 ${threadCounts.resolved}/${threadCounts.total}`,
      color:
        threadCounts.resolved === threadCounts.total
          ? colors.commentsResolved
          : colors.commentsUnresolved,
    });
  }
  if (conflicted) {
    meta.push({ text: " ⚠ conflict", color: colors.conflict, bold: true });
  } else if (mergeConflict) {
    meta.push({ text: " ⊗ conflicts", color: colors.mergeConflict, bold: true });
  } else if (branch.needsRestack) {
    meta.push({ text: " ⇈ restack", color: colors.needsRestack, bold: true });
  }
  if (branch.unpushed) {
    meta.push({ text: " ⇡ unpushed", color: colors.unpushed });
  } else if (branch.upstreamGone) {
    meta.push({ text: " ⊘ gone", color: colors.upstreamGone });
  } else {
    if (branch.ahead > 0)
      meta.push({ text: ` ↑${branch.ahead}`, color: colors.ahead });
    if (branch.behind > 0)
      meta.push({ text: ` ↓${branch.behind}`, color: colors.behind });
  }
  // Fixed columns: render an empty placeholder when a value is absent so the
  // remaining columns stay aligned (e.g. the trunk row has no PR or status).
  if (ciW > 0) {
    // Only show CI for live (open/draft) PRs; merged/closed get a blank cell.
    const open = branch.pr && (live ? live.state : branch.pr.state) === "OPEN";
    const badge = open ? ciBadge(ci ?? null) : null;
    meta.push({
      text: ` ${(badge?.text ?? "").padEnd(ciW)}`,
      color: badge?.color,
    });
  }
  if (prW > 0) {
    const pr = branch.pr ? `#${branch.pr.prNumber}` : "";
    meta.push({ text: ` ${pr.padStart(prW)}`, color: colors.prNumber });
  }
  if (statusW > 0) {
    meta.push({
      text: ` ${(badge?.text ?? "").padEnd(statusW)}`,
      color: badge?.color,
    });
  }
  if (ageW > 0) {
    meta.push({ text: ` ${(branch.age ?? "").padStart(ageW)}`, color: colors.age });
  }

  const metaWidth = meta.reduce((n, s) => n + segWidth(s.text), 0);
  // arrow(2) + gutter(columnCount*2) + 1 space + title + spacer + metadata = width.
  const spacerWidth = Math.max(
    0,
    width - 2 - columnCount * 2 - 1 - titleWidth - metaWidth
  );

  const title = fit(
    `${branch.displayTitle}${branch.isTrunk ? " (trunk)" : ""}`,
    titleWidth
  );

  return (
    <Box width={width}>
      {/* current-branch arrow gutter */}
      <Text color={colors.current} backgroundColor={bg}>
        {row.isCurrent ? "› " : "  "}
      </Text>

      {/* graph gutter */}
      <Text>
        {cells.map((cell, i) => (
          <Text key={i}>
            <Text
              color={cell.isNode ? (row.isCurrent ? colors.current : colors.node) : lit(colors.graphLine)}
              backgroundColor={bg}
              bold={cell.isNode && row.isCurrent}
            >
              {cell.glyph}
            </Text>
            <Text color={lit(colors.graphLine)} backgroundColor={bg}>
              {cell.after}
            </Text>
          </Text>
        ))}
      </Text>

      <Text backgroundColor={bg}> </Text>

      {/* title (padded to fill its column so the highlight spans it) */}
      <Text
        color={selected ? undefined : titleColor}
        backgroundColor={bg}
        bold={row.isCurrent || branch.isTrunk}
        wrap="truncate-end"
      >
        {title}
      </Text>

      {/* gap filler so the selection highlight reaches the metadata */}
      <Text backgroundColor={bg}>{" ".repeat(spacerWidth)}</Text>

      {/* right-aligned metadata */}
      {meta.map((s, i) => (
        <Text key={i} color={lit(s.color)} backgroundColor={bg} bold={s.bold}>
          {s.text}
        </Text>
      ))}
    </Box>
  );
}
