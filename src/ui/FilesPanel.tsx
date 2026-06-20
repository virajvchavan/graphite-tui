import React from "react";
import { Box, Text } from "ink";
import type { ChangedFile } from "../types.js";
import { colors, fileStatusColor } from "./theme.js";

interface Props {
  branchName: string;
  files: ChangedFile[];
  loading: boolean;
  /** True when no parent diff is possible (e.g. trunk). */
  noParent: boolean;
  focused: boolean;
  /** Index of the highlighted file when focused. */
  cursor: number;
  /** First visible file index. */
  scrollOffset: number;
  /** Number of file rows this panel can show. */
  visible: number;
  width: number;
}

/** Left-truncate a string to `max` chars, prefixing "…" when cut. */
function truncStart(s: string, max: number): string {
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
function DiffCount({
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
      {addW > 0 && (
        <Text color={colors.added}>{add.padStart(addW)}</Text>
      )}
      {addW > 0 && delW > 0 ? " " : ""}
      {delW > 0 && (
        <Text color={colors.deleted}>{del.padStart(delW)}</Text>
      )}
    </Text>
  );
}

/** Show a path as dimmed directory + bright basename, left-truncated to fit. */
function FilePath({ path, width }: { path: string; width: number }) {
  // Truncate the whole path first (keeps the basename visible), then split
  // the visible remainder into directory + basename for coloring.
  const shown = truncStart(path, width);
  const slash = shown.lastIndexOf("/");
  const dir = slash >= 0 ? shown.slice(0, slash + 1) : "";
  const base = slash >= 0 ? shown.slice(slash + 1) : shown;
  return (
    <Text wrap="truncate-start">
      <Text color={colors.fileDir}>{dir}</Text>
      <Text color={colors.fileName}>{base}</Text>
    </Text>
  );
}

export function FilesPanel({
  branchName,
  files,
  loading,
  noParent,
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

  // Branch-wide totals, GitHub-style.
  const totalAdd = files.reduce((n, f) => n + f.additions, 0);
  const totalDel = files.reduce((n, f) => n + f.deletions, 0);

  // Size the `+` and `-` columns to the widest value in view so the counts
  // line up vertically; a column with no values anywhere collapses to 0.
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
  const pathWidth = Math.max(10, width - 4 - (countCol ? countCol + 1 : 0));

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={focused ? colors.current : "gray"}>{caret} </Text>
        <Text bold color={focused ? colors.current : undefined} wrap="truncate-end">
          {branchName}
        </Text>
        <Text color="gray">
          {"  "}
          {loading
            ? "loading…"
            : noParent
              ? "trunk"
              : `${count} file${count === 1 ? "" : "s"}`}
        </Text>
        {!loading && !noParent && (totalAdd > 0 || totalDel > 0) && (
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
      </Box>

      {hiddenAbove > 0 && (
        <Text color="gray">{`  ↑ ${hiddenAbove} more`}</Text>
      )}

      {!loading && !noParent && count === 0 && (
        <Text color="gray"> no files</Text>
      )}

      {window.map((f, i) => {
        const idx = scrollOffset + i;
        const isCursor = focused && idx === cursor;
        return (
          <Box key={f.path} width={width} justifyContent="space-between">
            <Text
              backgroundColor={isCursor ? colors.selectedBg : undefined}
              wrap="truncate-end"
            >
              <Text color={fileStatusColor(f.status)}>{f.status[0]} </Text>
              <FilePath path={f.path} width={pathWidth} />
            </Text>
            <Text backgroundColor={isCursor ? colors.selectedBg : undefined}>
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

      {hiddenBelow > 0 && (
        <Text color="gray">{`  ↓ ${hiddenBelow} more`}</Text>
      )}
    </Box>
  );
}
