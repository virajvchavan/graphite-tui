import React from "react";
import { Text } from "ink";
import { colors } from "./theme.js";

/** Left-truncate a string to `max` chars, prefixing "…" when cut. */
export function truncStart(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return "…";
  return "…" + s.slice(s.length - (max - 1));
}

/**
 * Render `+N -M` line counts in two fixed-width, right-aligned columns so the
 * `+` and `-` figures line up vertically across rows. Zero values render as
 * blank padding (omitting the sign). `addW`/`delW` are the column widths
 * (including the sign char); 0 disables that column entirely.
 */
export function DiffCount({
  additions,
  deletions,
  addW,
  delW,
}: {
  additions: number;
  deletions: number;
  addW: number;
  delW: number;
}) {
  const add = additions > 0 ? `+${additions}` : "";
  const del = deletions > 0 ? `-${deletions}` : "";
  return (
    <Text>
      {addW > 0 && <Text color={colors.added}>{add.padStart(addW)}</Text>}
      {addW > 0 && delW > 0 ? " " : ""}
      {delW > 0 && <Text color={colors.deleted}>{del.padStart(delW)}</Text>}
    </Text>
  );
}

/**
 * Show a path as dimmed directory + bright basename, left-truncated to fit.
 * Right-padded with spaces to exactly `width` columns so a selected row's
 * background spans the whole path column (no mid-row gap).
 */
export function FilePath({ path, width }: { path: string; width: number }) {
  // Truncate the whole path first (keeps the basename visible), then split
  // the visible remainder into directory + basename for coloring.
  const shown = truncStart(path, width);
  const slash = shown.lastIndexOf("/");
  const dir = slash >= 0 ? shown.slice(0, slash + 1) : "";
  const base = slash >= 0 ? shown.slice(slash + 1) : shown;
  const pad = " ".repeat(Math.max(0, width - shown.length));
  return (
    <Text wrap="truncate-start">
      <Text color={colors.fileDir}>{dir}</Text>
      <Text color={colors.fileName}>{base}</Text>
      {pad}
    </Text>
  );
}

/** Widths of the `+`/`-` count columns sized to the widest value in `window`. */
export function countWidths(window: { additions: number; deletions: number }[]) {
  const addW = window.reduce(
    (m, f) => Math.max(m, f.additions > 0 ? `+${f.additions}`.length : 0),
    0
  );
  const delW = window.reduce(
    (m, f) => Math.max(m, f.deletions > 0 ? `-${f.deletions}`.length : 0),
    0
  );
  // Total width of the count block (both columns + the gap between them).
  const countCol = addW + delW + (addW && delW ? 1 : 0);
  return { addW, delW, countCol };
}
