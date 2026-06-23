import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { LogEntry } from "../actions/commandLog.js";
import { colors } from "./theme.js";

interface Props {
  /** Pre-flattened lines (computed by the caller so it shares one collapsed view). */
  lines: Line[];
  /** Number of command entries (for the header count). */
  entryCount: number;
  focused: boolean;
  /** Highlighted line index when focused, else null. */
  cursor: number | null;
  /** First visible line index. */
  scrollOffset: number;
  /** Number of log lines this panel can show. */
  visible: number;
  width: number;
}

type LineKind = "command" | "command-running" | "command-error" | "output";
export interface Line {
  /** Command text (with a collapsed "(N lines)" suffix) or an output line. */
  text: string;
  kind: LineKind;
  /** The entry this line belongs to (header or output) — the collapse target. */
  entryId: number;
  /** Command lines only: collapsed view + whether there's any output to hide. */
  collapsed: boolean;
  hasOutput: boolean;
}

/**
 * Flatten log entries into a single styled-line array: each command becomes a
 * header line followed by one line per output line (skipped when collapsed).
 * The leading marker (spinner / ▾ / ▸ / ❯) is chosen at render time, not baked
 * into `text`. This is what the panel windows, scrolls, and moves a cursor over.
 */
export function flattenLog(
  entries: LogEntry[],
  collapsed: ReadonlySet<number> = new Set()
): Line[] {
  const lines: Line[] = [];
  for (const e of entries) {
    const out = e.output ? e.output.replace(/\n$/, "").split("\n") : [];
    const isCollapsed = collapsed.has(e.id);
    const suffix =
      isCollapsed && out.length
        ? `  (${out.length} line${out.length === 1 ? "" : "s"})`
        : "";
    lines.push({
      text: `${e.command}${suffix}`,
      kind:
        e.status === "error"
          ? "command-error"
          : e.status === "running"
            ? "command-running"
            : "command",
      entryId: e.id,
      collapsed: isCollapsed,
      hasOutput: out.length > 0,
    });
    if (!isCollapsed) {
      for (const l of out)
        lines.push({
          text: l,
          kind: "output",
          entryId: e.id,
          collapsed: false,
          hasOutput: false,
        });
    }
  }
  return lines;
}

function lineColor(kind: LineKind): string | undefined {
  switch (kind) {
    case "command":
      // Subtle: a finished command is just a log anchor. A muted gray — lighter
      // than its dim output but dimmer than the white panel title — keeps the
      // hierarchy without competing with the header.
      return colors.commandDone;
    case "command-running":
      return colors.dim;
    case "command-error":
      return colors.conflict;
    default:
      return colors.dim;
  }
}

/** The glyph (or spinner) shown before a command line, indicating its state. */
function Marker({ line }: { line: Line }) {
  if (line.kind === "command-running")
    return (
      <Text color={colors.current}>
        <Spinner type="dots" />
      </Text>
    );
  if (!line.hasOutput) return <Text>❯</Text>;
  return <Text>{line.collapsed ? "▸" : "▾"}</Text>;
}

export function CommandLog({
  lines,
  entryCount,
  focused,
  cursor,
  scrollOffset,
  visible,
  width,
}: Props) {
  const caret = focused ? "▾" : "▸";
  const maxOffset = Math.max(0, lines.length - visible);
  const start = Math.max(0, Math.min(scrollOffset, maxOffset));
  const window = lines.slice(start, start + visible);
  const hiddenAbove = start;
  const hiddenBelow = Math.max(0, lines.length - (start + window.length));

  return (
    <Box flexDirection="column" marginTop={1} width={width}>
      <Box>
        <Text color={focused ? colors.current : colors.dim}>{caret} </Text>
        <Text bold color={focused ? colors.current : undefined}>
          logs
        </Text>
        <Text color={colors.dim}>
          {"  "}
          {entryCount} command{entryCount === 1 ? "" : "s"}
        </Text>
        {hiddenAbove > 0 && <Text color={colors.dim}>{`  ↑ ${hiddenAbove} more`}</Text>}
        {hiddenBelow > 0 && <Text color={colors.dim}>{`  ↓ ${hiddenBelow} more`}</Text>}
      </Box>

      {window.map((line, i) => {
        const idx = start + i;
        const isCommand = line.kind !== "output";
        const isCursor = focused && idx === cursor;
        const bg = isCursor ? colors.selectedBg : undefined;
        if (isCommand) {
          return (
            <Text
              key={idx}
              color={lineColor(line.kind)}
              bold={line.kind === "command-error"}
              backgroundColor={bg}
              wrap="truncate-end"
            >
              <Marker line={line} /> {line.text}
            </Text>
          );
        }
        return (
          <Text
            key={idx}
            color={lineColor(line.kind)}
            backgroundColor={bg}
            wrap="truncate-end"
          >
            {`  ${line.text}`}
          </Text>
        );
      })}
    </Box>
  );
}
