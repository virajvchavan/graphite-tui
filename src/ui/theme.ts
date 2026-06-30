import type { CiStatus, PrInfo, PrLiveStatus } from "../types.js";

export type ThemeMode = "light" | "dark";

/** A full set of semantic UI colors. Both the dark and light palettes provide
 * every key, so any `colors.*` reference is valid regardless of mode. */
export interface Palette {
  trunk: string;
  current: string;
  selectedBg: string;
  /** Selection background for a panel that doesn't have focus — a subdued
   * marker so the cursor position is remembered without competing with the
   * focused panel's bright highlight. */
  selectedBgInactive: string;
  graphLine: string;
  node: string;
  merged: string;
  draft: string;
  closed: string;
  approved: string;
  changesRequested: string;
  reviewRequired: string;
  needsRestack: string;
  conflict: string;
  mergeConflict: string;
  ahead: string;
  behind: string;
  upstreamGone: string;
  unpushed: string;
  prNumber: string;
  commentsResolved: string;
  commentsUnresolved: string;
  ciPassed: string;
  ciFailed: string;
  ciPending: string;
  /** Replaces dim/gray text on a selected row so it stays readable on the
   * selection background. */
  selectedDim: string;
  age: string;
  dim: string;
  // changed-files panel
  modified: string;
  added: string;
  deleted: string;
  renamed: string;
  // diff viewer: full-width line backgrounds plus a brighter line-number gutter
  diffAddBg: string;
  diffAddGutterBg: string;
  diffDelBg: string;
  diffDelGutterBg: string;
  fileDir: string;
  fileName: string;
  // semantic roles for chrome that was previously hardcoded in components
  /** Default emphasized foreground text (was a bare `white`). */
  text: string;
  /** Titles, section headers, and informational borders (was `cyan`). */
  heading: string;
  /** Highlighted keyboard keys in hints/overlays (was `yellow`). */
  keyHint: string;
  /** Cautionary text such as search/rebase hints (was `yellow`). */
  warning: string;
  /** A finished (non-running, non-failed) command in the command log. */
  commandDone: string;
}

/** Dark palette — the original values, unchanged, so dark mode looks exactly as
 * it always has. */
export const darkColors: Palette = {
  trunk: "gray",
  current: "cyanBright",
  selectedBg: "blue",
  selectedBgInactive: "#3a3a3a",
  graphLine: "gray",
  node: "white",
  merged: "magenta",
  draft: "gray",
  closed: "red",
  approved: "green",
  changesRequested: "red",
  reviewRequired: "yellow",
  needsRestack: "yellow",
  conflict: "red",
  mergeConflict: "red",
  ahead: "green",
  behind: "magenta",
  upstreamGone: "red",
  unpushed: "green",
  prNumber: "gray",
  commentsResolved: "green",
  commentsUnresolved: "#ff8700",
  ciPassed: "green",
  ciFailed: "red",
  ciPending: "yellow",
  selectedDim: "whiteBright",
  age: "gray",
  dim: "gray",
  modified: "yellow",
  added: "green",
  deleted: "red",
  renamed: "cyan",
  diffAddBg: "#14321b",
  diffAddGutterBg: "#1d4a27",
  diffDelBg: "#3a1a1d",
  diffDelGutterBg: "#52232a",
  fileDir: "gray",
  fileName: "white",
  text: "white",
  heading: "cyan",
  keyHint: "yellow",
  warning: "yellow",
  commandDone: "#9e9e9e",
};

/** Light palette — overrides the values that go unreadable on a light
 * background (whites/brights, dark-gray backgrounds, low-contrast yellow/cyan).
 * Standard ANSI red/green/blue/magenta render fine on light, so they stay. */
export const lightColors: Palette = {
  ...darkColors,
  current: "blue",
  selectedBg: "#cfe8ff",
  selectedBgInactive: "#d0d0d0",
  diffAddBg: "#e6ffec",
  diffAddGutterBg: "#ccffd8",
  diffDelBg: "#ffebe9",
  diffDelGutterBg: "#ffd7d5",
  node: "black",
  selectedDim: "#444444",
  fileName: "black",
  text: "black",
  heading: "blue",
  keyHint: "#b8860b",
  warning: "#b8860b",
  commandDone: "#6c6c6c",
};

/** The active palette. Resolved once at startup via {@link applyTheme}; until
 * then it defaults to dark so behavior is unchanged when detection is skipped.
 * Exported as a live binding so `import { colors }` sees the chosen palette. */
export let colors: Palette = darkColors;

let currentMode: ThemeMode = "dark";

/** The palette currently in effect. */
export function getThemeMode(): ThemeMode {
  return currentMode;
}

/** Select the palette for the rest of the session. Safe to call at runtime —
 * components read `colors.*` at render time, so re-rendering after this swaps
 * the whole UI to the chosen palette. */
export function applyTheme(mode: ThemeMode): void {
  currentMode = mode;
  colors = mode === "light" ? lightColors : darkColors;
}

/**
 * Background for a row: the bright highlight when its panel is focused, a dim
 * marker when the selection lives in an unfocused panel (so only the active
 * panel reads as "live"), and none when the row isn't selected.
 */
export function selectionBg(
  selected: boolean,
  focused: boolean
): string | undefined {
  if (!selected) return undefined;
  return focused ? colors.selectedBg : colors.selectedBgInactive;
}

/**
 * Single-width colored glyph for a PR's rolled-up CI status, or null when there
 * are no checks. Glyphs (not emoji) so they occupy exactly one terminal column
 * and stay column-aligned — emoji render at terminal/font-dependent widths that
 * disagree with the layout engine's measurement.
 */
export function ciBadge(ci: CiStatus): { text: string; color: string } | null {
  switch (ci) {
    case "passed":
      return { text: "✓", color: colors.ciPassed };
    case "failed":
      return { text: "✗", color: colors.ciFailed };
    case "pending":
      return { text: "●", color: colors.ciPending };
    default:
      return null;
  }
}

/** Color for a git name-status letter. */
export function fileStatusColor(status: string): string {
  switch (status) {
    case "A":
      return colors.added;
    case "D":
      return colors.deleted;
    case "R":
    case "C":
      return colors.renamed;
    default:
      return colors.modified; // M, T, U, ...
  }
}

/** Color for a single working-tree status char (X or Y position). */
export function worktreeStatusColor(ch: string): string {
  switch (ch) {
    case "?":
      return colors.dim; // untracked
    case "A":
      return colors.added;
    case "D":
      return colors.deleted;
    case "R":
    case "C":
      return colors.renamed;
    case " ":
      return colors.dim;
    default:
      return colors.modified; // M, T, U, ...
  }
}

/**
 * Short colored badge text for a PR's status. Returns null when no PR.
 *
 * Graphite's cached `.graphite_pr_info` only updates on `gt` activity, so when
 * a live GitHub status is available it takes precedence — letting a refresh
 * surface a merge or approval that happened elsewhere.
 */
export function prBadge(
  pr: PrInfo | null,
  live?: PrLiveStatus
): { text: string; color: string } | null {
  if (!pr) return null;
  const state = live ? live.state : pr.state;
  const reviewDecision = live ? live.reviewDecision : pr.reviewDecision;
  if (state === "MERGED") return { text: "merged", color: colors.merged };
  if (state === "CLOSED") return { text: "closed", color: colors.closed };
  if (pr.isDraft) return { text: "draft", color: colors.draft };
  switch (reviewDecision) {
    case "APPROVED":
      return { text: "approved", color: colors.approved };
    case "CHANGES_REQUESTED":
      return { text: "changes", color: colors.changesRequested };
    case "REVIEW_REQUIRED":
      return { text: "review", color: colors.reviewRequired };
    default:
      return { text: "open", color: colors.dim };
  }
}
