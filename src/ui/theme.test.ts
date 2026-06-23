import { describe, expect, it } from "vitest";
import {
  applyTheme,
  ciBadge,
  colors,
  darkColors,
  fileStatusColor,
  prBadge,
  selectionBg,
  worktreeStatusColor,
} from "./theme.js";
import type { PrInfo } from "../types.js";

// Tests assume the default dark palette; reset after any applyTheme call so
// the live `colors` binding doesn't leak into other tests.
function pr(over: Partial<PrInfo>): PrInfo {
  return {
    prNumber: 1,
    title: "t",
    state: "OPEN",
    reviewDecision: null,
    isDraft: false,
    url: "u",
    headRefName: "h",
    baseRefName: "b",
    ...over,
  };
}

describe("selectionBg", () => {
  it("is undefined when the row isn't selected", () => {
    expect(selectionBg(false, true)).toBeUndefined();
    expect(selectionBg(false, false)).toBeUndefined();
  });

  it("uses the bright background when the panel is focused and the dim one otherwise", () => {
    expect(selectionBg(true, true)).toBe(darkColors.selectedBg);
    expect(selectionBg(true, false)).toBe(darkColors.selectedBgInactive);
  });
});

describe("ciBadge", () => {
  it("maps each CI state to its glyph and color", () => {
    expect(ciBadge("passed")).toEqual({ text: "✓", color: colors.ciPassed });
    expect(ciBadge("failed")).toEqual({ text: "✗", color: colors.ciFailed });
    expect(ciBadge("pending")).toEqual({ text: "●", color: colors.ciPending });
  });

  it("returns null when there are no checks", () => {
    expect(ciBadge(null)).toBeNull();
  });
});

describe("fileStatusColor", () => {
  it("colors added/deleted/renamed/copied distinctly and everything else as modified", () => {
    expect(fileStatusColor("A")).toBe(colors.added);
    expect(fileStatusColor("D")).toBe(colors.deleted);
    expect(fileStatusColor("R")).toBe(colors.renamed);
    expect(fileStatusColor("C")).toBe(colors.renamed);
    expect(fileStatusColor("M")).toBe(colors.modified);
    expect(fileStatusColor("T")).toBe(colors.modified);
  });
});

describe("worktreeStatusColor", () => {
  it("treats untracked and blank as dim", () => {
    expect(worktreeStatusColor("?")).toBe(colors.dim);
    expect(worktreeStatusColor(" ")).toBe(colors.dim);
  });

  it("colors added/deleted/renamed and falls back to modified", () => {
    expect(worktreeStatusColor("A")).toBe(colors.added);
    expect(worktreeStatusColor("D")).toBe(colors.deleted);
    expect(worktreeStatusColor("R")).toBe(colors.renamed);
    expect(worktreeStatusColor("C")).toBe(colors.renamed);
    expect(worktreeStatusColor("M")).toBe(colors.modified);
  });
});

describe("prBadge", () => {
  it("returns null without a PR", () => {
    expect(prBadge(null)).toBeNull();
  });

  it("ranks merged/closed/draft above the review decision", () => {
    expect(prBadge(pr({ state: "MERGED" }))).toEqual({
      text: "merged",
      color: colors.merged,
    });
    expect(prBadge(pr({ state: "CLOSED" }))).toEqual({
      text: "closed",
      color: colors.closed,
    });
    // a draft that is also approved still shows as draft
    expect(prBadge(pr({ isDraft: true, reviewDecision: "APPROVED" }))).toEqual({
      text: "draft",
      color: colors.draft,
    });
  });

  it("maps the review decision for an open, non-draft PR", () => {
    expect(prBadge(pr({ reviewDecision: "APPROVED" }))).toEqual({
      text: "approved",
      color: colors.approved,
    });
    expect(prBadge(pr({ reviewDecision: "CHANGES_REQUESTED" }))).toEqual({
      text: "changes",
      color: colors.changesRequested,
    });
    expect(prBadge(pr({ reviewDecision: "REVIEW_REQUIRED" }))).toEqual({
      text: "review",
      color: colors.reviewRequired,
    });
  });

  it("shows a plain open badge when there is no review decision", () => {
    expect(prBadge(pr({ reviewDecision: null }))).toEqual({
      text: "open",
      color: colors.dim,
    });
  });
});

describe("applyTheme", () => {
  it("swaps the live colors binding and is reversible", () => {
    applyTheme("light");
    expect(colors.text).toBe("black");
    applyTheme("dark");
    expect(colors.text).toBe("white");
  });
});
