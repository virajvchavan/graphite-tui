import type { CiStatus, PrInfo } from "../types.js";

export const colors = {
  trunk: "gray",
  current: "cyanBright",
  selectedBg: "blue",
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
  /** Replaces dim/gray text on a selected row so it stays readable on blue. */
  selectedDim: "whiteBright",
  age: "gray",
  dim: "gray",
  // changed-files panel
  modified: "yellow",
  added: "green",
  deleted: "red",
  renamed: "cyan",
  fileDir: "gray",
  fileName: "white",
} as const;

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

/** Short colored badge text for a PR's status. Returns null when no PR. */
export function prBadge(
  pr: PrInfo | null
): { text: string; color: string } | null {
  if (!pr) return null;
  if (pr.state === "MERGED") return { text: "merged", color: colors.merged };
  if (pr.state === "CLOSED") return { text: "closed", color: colors.closed };
  if (pr.isDraft) return { text: "draft", color: colors.draft };
  switch (pr.reviewDecision) {
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
