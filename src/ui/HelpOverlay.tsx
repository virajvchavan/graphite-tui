import React from "react";
import { Box, Text } from "ink";
import { colors } from "./theme.js";

// Keys handled from every panel (movement, panel cycling, and the repo-wide
// actions), as opposed to the branch-list-only keys below.
const GLOBAL_KEYS: [string, string][] = [
  ["↑/k ↓/j", "move selection"],
  ["Tab", "cycle panels (worktree / files / logs)"],
  ["s", "sync with trunk"],
  ["R", "refresh"],
  ["t", "toggle light / dark theme"],
  ["?", "toggle this help"],
  ["Q", "quit"],
];

const KEYS: [string, string][] = [
  ["↵ or c", "checkout branch"],
  ["o / O", "open PR / stack on Graphite"],
  ["g", "open PR on GitHub"],
  ["G", "get a remote branch/stack (gt get)"],
  ["r", "restack"],
  ["S", "submit stack"],
  ["d", "delete branch (confirm)"],
  ["/", "fuzzy filter"],
  ["y", "copy PR url / branch name"],
  ["e", "view last command's full error output"],
];

const WORKTREE_KEYS: [string, string][] = [
  ["● ◐ ○", "staged · partially staged · not staged"],
  ["a / A", "stage file / all"],
  ["u / U", "unstage file / all"],
  ["space", "toggle stage of file"],
  ["x / X", "discard file / all (confirm)"],
  ["↵", "view file diff"],
  ["m", "amend staged into current branch (gt modify)"],
  ["c", "new commit with a message (gt modify -c)"],
  ["m / c", "on trunk: create a branch from staged changes"],
];

const FILES_KEYS: [string, string][] = [
  ["↑/↓", "scroll the changed-files list"],
  ["↵", "view file diff"],
  ["space", "expand/collapse the changed-files list"],
];

const DIFF_KEYS: [string, string][] = [
  ["←/→ or h/l", "previous / next file"],
  ["↑/↓ or j/k", "scroll the diff"],
  ["space", "jump down a half-page"],
  ["esc / q", "close the diff view"],
];

type HelpLine =
  | { kind: "header"; text: string }
  | { kind: "key"; k: string; desc: string }
  | { kind: "blank" };

/** Flatten the keybinding sections into a single list of renderable lines so
 * the overlay can window/scroll them when the terminal is too short to show
 * everything at once. */
function buildHelpLines(): HelpLine[] {
  const lines: HelpLine[] = [];
  const keys = (rows: [string, string][]) => {
    for (const [k, desc] of rows) lines.push({ kind: "key", k, desc });
  };
  lines.push({ kind: "header", text: "Global" });
  lines.push({ kind: "blank" });
  keys(GLOBAL_KEYS);
  for (const [title, rows] of [
    ["Branches", KEYS],
    ["Working tree", WORKTREE_KEYS],
    ["Files panel", FILES_KEYS],
    ["Diff view", DIFF_KEYS],
  ] as const) {
    lines.push({ kind: "blank" });
    lines.push({ kind: "header", text: title });
    keys(rows);
  }
  return lines;
}

const HELP_LINES = buildHelpLines();

/** Total number of help body lines — used by the caller to clamp scrolling. */
export const helpLineCount = HELP_LINES.length;

// Fixed vertical chrome inside the frame: border(2) + paddingY(2) + footer(1) +
// the two ↑/↓ "more" indicator rows (2). Reserved so the body height is stable
// whether or not the indicators show.
const CHROME = 7;
/** How many body lines fit for a given frame height. */
export function helpVisibleRows(frameHeight: number): number {
  return Math.max(3, frameHeight - CHROME);
}

function HelpLineView({ line }: { line: HelpLine }) {
  if (line.kind === "blank") return <Text> </Text>;
  if (line.kind === "header")
    return (
      <Text bold color={colors.heading}>
        {line.text}
      </Text>
    );
  return (
    <Box>
      <Box width={12}>
        <Text color={colors.keyHint}>{line.k}</Text>
      </Box>
      <Text color={colors.dim}>{line.desc}</Text>
    </Box>
  );
}

/**
 * Inset, floating dialog (like the diff view) rather than a full-screen
 * takeover. The body is windowed and scrolled with ↑/↓ so nothing is hidden on
 * a short terminal; when everything fits it renders as a content-sized box.
 * The frame-sized wrapper clips overflow so the frame can never exceed the
 * viewport (which would make Ink flicker).
 */
export function HelpOverlay({
  width,
  height,
  scrollOffset,
}: {
  width: number;
  height: number;
  scrollOffset: number;
}) {
  const visible = helpVisibleRows(height);
  const maxOffset = Math.max(0, HELP_LINES.length - visible);
  const start = Math.max(0, Math.min(scrollOffset, maxOffset));
  const window = HELP_LINES.slice(start, start + visible);
  const above = start;
  const below = HELP_LINES.length - (start + window.length);
  const scrollable = above > 0 || below > 0;

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
        overflow="hidden"
        borderStyle="round"
        borderColor={colors.heading}
        paddingX={2}
        paddingY={1}
      >
        {above > 0 && <Text color={colors.dim}>↑ {above} more</Text>}
        {window.map((line, i) => (
          <HelpLineView key={start + i} line={line} />
        ))}
        {below > 0 && <Text color={colors.dim}>↓ {below} more</Text>}
        <Box height={1} />
        <Text color={colors.dim}>
          {scrollable ? "↑/↓ scroll · " : ""}press ? or esc to close
        </Text>
      </Box>
    </Box>
  );
}
