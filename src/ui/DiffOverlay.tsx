import React from "react";
import { Box, Text } from "ink";
import { colors } from "./theme.js";
import { parseUnifiedDiff, type DiffRow } from "../data/diff.js";

interface Props {
  /** Repo-relative path of the file being shown. */
  path: string;
  /** 0-based index of this file and the total count, for the "file 2 / 7" hint. */
  position: { index: number; total: number };
  /** Where the diff comes from, e.g. "working tree" or "parent…branch". */
  sourceLabel: string;
  /** Unified-diff text; null while it's still being fetched. */
  text: string | null;
  /** First visible line index. */
  scrollOffset: number;
  /** Full frame width/height; the popup is inset within it. */
  width: number;
  height: number;
}

// Fixed vertical chrome: border(2) + paddingY(2) + header(1) + source(1) +
// spacer(1) + spacer(1) + footer(1) + the two ↑/↓ "more" indicator rows (2).
// Reserved always so the body height stays stable whether or not they show.
const CHROME = 11;
// Inset the popup from the frame edges so it reads as a floating dialog, not a
// full takeover. Kept in sync with the scroll-clamp math in App.tsx.
export const DIFF_INSET_X = 4;
export const DIFF_INSET_Y = 2;
/** Visible diff rows for a given frame height (matches the layout below). */
export function diffVisibleRows(frameHeight: number): number {
  return Math.max(3, frameHeight - DIFF_INSET_Y * 2 - CHROME);
}

// Footer keybinding hints as [key, label] pairs, styled like the StatusBar.
const FOOTER_HINT: Array<[string, string]> = [
  ["←/→", "prev/next file"],
  ["↑/↓", "scroll"],
  ["space", "page"],
  ["esc", "close"],
];

/** Pad `s` with spaces to exactly `w` columns, truncating if it overflows, so a
 * background fills the row's full width without wrapping to the next line. */
function fit(s: string, w: number): string {
  if (w <= 0) return "";
  return s.length > w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}

/** Render one parsed diff row: a brighter line-number gutter followed by the
 * full-width-tinted content for add/del rows, a plain row for context, and a
 * dim section separator for hunk boundaries. */
function DiffLine({ row, gutterW, width }: { row: DiffRow; gutterW: number; width: number }) {
  if (row.kind === "hunk") {
    return (
      <Text color={colors.dim} wrap="truncate-end">
        {fit(" ".repeat(gutterW + 2) + "⋯" + (row.text ? " " + row.text : ""), width)}
      </Text>
    );
  }
  const no = row.kind === "del" ? row.oldNo : row.newNo;
  const gutter = ` ${String(no ?? "").padStart(gutterW)} `;
  const sign = row.kind === "add" ? "+" : row.kind === "del" ? "-" : " ";
  const body = fit(`${sign} ${row.text}`, width - gutter.length);

  if (row.kind === "context") {
    return (
      <Text wrap="truncate-end">
        <Text color={colors.dim}>{gutter}</Text>
        <Text color={colors.text}>{body}</Text>
      </Text>
    );
  }
  const add = row.kind === "add";
  return (
    <Text wrap="truncate-end">
      <Text
        color={add ? colors.added : colors.deleted}
        backgroundColor={add ? colors.diffAddGutterBg : colors.diffDelGutterBg}
      >
        {gutter}
      </Text>
      <Text color={colors.text} backgroundColor={add ? colors.diffAddBg : colors.diffDelBg}>
        {body}
      </Text>
    </Text>
  );
}

/**
 * Inset, scrollable popup showing a single file's diff. Left/right walk through
 * the surrounding file list (handled by the caller); up/down scroll the patch.
 * The popup floats inside the frame with a margin so it reads as a dialog.
 */
export function DiffOverlay({
  path,
  position,
  sourceLabel,
  text,
  scrollOffset,
  width,
  height,
}: Props) {
  const popupWidth = Math.max(40, width - DIFF_INSET_X * 2);
  const popupHeight = Math.max(8, height - DIFF_INSET_Y * 2);
  const visible = diffVisibleRows(height);
  // Inner content width: popup minus the round border (1 each side) and the
  // paddingX={2} (2 each side). Backgrounds are padded to this so they fill.
  const contentWidth = Math.max(10, popupWidth - 6);
  const rows = text === null ? [] : parseUnifiedDiff(text);
  const additions = rows.reduce((n, r) => n + (r.kind === "add" ? 1 : 0), 0);
  const deletions = rows.reduce((n, r) => n + (r.kind === "del" ? 1 : 0), 0);
  const maxNo = rows.reduce((m, r) => Math.max(m, r.oldNo ?? 0, r.newNo ?? 0), 0);
  const gutterW = Math.max(2, String(maxNo).length);
  const start = Math.max(
    0,
    Math.min(scrollOffset, Math.max(0, rows.length - visible))
  );
  const window = rows.slice(start, start + visible);
  const more = rows.length - (start + window.length);

  return (
    <Box
      width={width}
      height={height}
      justifyContent="center"
      alignItems="center"
      overflow="hidden"
    >
    <Box
      flexDirection="column"
      width={popupWidth}
      height={popupHeight}
      overflow="hidden"
      borderStyle="round"
      borderColor={colors.current}
      paddingX={2}
      paddingY={1}
    >
      <Box justifyContent="space-between">
        <Text wrap="truncate-middle">
          <Text bold color={colors.current}>
            {path}
          </Text>
          {text !== null && (additions > 0 || deletions > 0) && (
            <Text>
              {"  "}
              <Text color={colors.added}>+{additions}</Text>
              {" "}
              <Text color={colors.deleted}>-{deletions}</Text>
            </Text>
          )}
        </Text>
        <Text bold color={colors.text}>
          {" "}
          file {position.index + 1} / {position.total}
        </Text>
      </Box>
      <Text color={colors.dim} wrap="truncate-end">
        {sourceLabel}
      </Text>
      <Box height={1} />
      {text === null ? (
        <Text color={colors.dim}>Loading diff…</Text>
      ) : rows.length === 0 ? (
        <Text color={colors.dim}>No textual changes (empty or binary file).</Text>
      ) : (
        <>
          {start > 0 && <Text color={colors.dim}>↑ {start} more</Text>}
          {window.map((row, i) => (
            <DiffLine key={start + i} row={row} gutterW={gutterW} width={contentWidth} />
          ))}
          {more > 0 && <Text color={colors.dim}>↓ {more} more</Text>}
        </>
      )}
      <Box height={1} />
      <Text wrap="truncate-end">
        {FOOTER_HINT.map(([key, label], i) => (
          <Text key={key}>
            {i > 0 && <Text color={colors.dim}>{" · "}</Text>}
            <Text color={colors.text} bold>
              {key}
            </Text>
            <Text color={colors.dim}>{" " + label}</Text>
          </Text>
        ))}
      </Text>
    </Box>
    </Box>
  );
}
