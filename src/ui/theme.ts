import type { PrInfo } from "../types.js";

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
  prNumber: "gray",
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
