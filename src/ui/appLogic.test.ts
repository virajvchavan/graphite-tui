import { describe, expect, it } from "vitest";
import {
  changedFilesKey,
  nextFocus,
  normalHint,
  prNumbersOf,
  worktreeHint,
} from "./appLogic.js";
import type { Branch, PrInfo, RepoData } from "../types.js";

function b(partial: Partial<Branch> & { name: string }): Branch {
  return {
    parent: null,
    children: [],
    revision: null,
    isTrunk: false,
    needsRestack: false,
    state: null,
    age: "",
    ahead: 0,
    behind: 0,
    upstreamGone: false,
    unpushed: false,
    pr: null,
    displayTitle: partial.name,
    ...partial,
  };
}

function pr(prNumber: number): PrInfo {
  return {
    prNumber,
    title: "t",
    state: "OPEN",
    reviewDecision: null,
    isDraft: false,
    url: "u",
    headRefName: "h",
    baseRefName: "b",
  };
}

function repo(branches: Branch[]): RepoData {
  return {
    repoRoot: "/repo",
    trunk: "develop",
    branches: new Map(branches.map((x) => [x.name, x])),
    currentBranch: null,
    rebase: null,
    lastFetchedPrInfoMs: null,
  };
}

describe("normalHint", () => {
  it("returns the full hint list for a non-trunk branch", () => {
    const keys = normalHint(false).map(([k]) => k);
    expect(keys).toContain("d");
    expect(keys).toContain("o");
    expect(keys).toContain("S");
  });

  it("drops branch-only actions (o/g/r/S/d) when trunk is selected", () => {
    const keys = normalHint(true).map(([k]) => k);
    for (const omitted of ["o", "g", "r", "S", "d"]) {
      expect(keys).not.toContain(omitted);
    }
    // shared actions remain
    expect(keys).toContain("↵");
    expect(keys).toContain("s");
    expect(keys).toContain("/");
  });
});

describe("worktreeHint", () => {
  it("offers only stage/unstage/discard when nothing is staged", () => {
    const keys = worktreeHint(false, false).map(([k]) => k);
    expect(keys).not.toContain("c");
    expect(keys).not.toContain("m");
    expect(keys).toEqual(["↵", "a/A", "u/U", "x/X", "Tab", "?"]);
  });

  it("offers create-branch on trunk once something is staged", () => {
    const hint = worktreeHint(true, true);
    expect(hint).toContainEqual(["c", "create branch"]);
    expect(hint.map(([k]) => k)).not.toContain("m");
  });

  it("offers amend and commit off trunk once something is staged", () => {
    const hint = worktreeHint(false, true);
    expect(hint).toContainEqual(["m", "amend"]);
    expect(hint).toContainEqual(["c", "commit"]);
    expect(hint).not.toContainEqual(["c", "create branch"]);
  });
});

describe("nextFocus", () => {
  const all = { worktree: true, files: true, logs: true };

  it("cycles branches → worktree → files → logs → branches when all are shown", () => {
    expect(nextFocus("branches", all)).toBe("worktree");
    expect(nextFocus("worktree", all)).toBe("files");
    expect(nextFocus("files", all)).toBe("logs");
    expect(nextFocus("logs", all)).toBe("branches");
  });

  it("skips panels that aren't shown", () => {
    // only branches visible -> always lands back on branches
    const none = { worktree: false, files: false, logs: false };
    expect(nextFocus("branches", none)).toBe("branches");
    // worktree hidden -> branches jumps straight to files
    expect(nextFocus("branches", { worktree: false, files: true, logs: false })).toBe(
      "files"
    );
    // files hidden -> worktree jumps to logs
    expect(nextFocus("worktree", { worktree: true, files: false, logs: true })).toBe(
      "logs"
    );
  });

  it("wraps around past hidden trailing panels back to branches", () => {
    expect(nextFocus("files", { worktree: true, files: true, logs: false })).toBe(
      "branches"
    );
  });
});

describe("changedFilesKey", () => {
  it("combines the branch name, its revision, and its parent's tip revision", () => {
    const parent = b({ name: "p", revision: "PARENT" });
    const child = b({ name: "c", revision: "CHILD", parent: "p" });
    const branches = new Map([
      ["p", parent],
      ["c", child],
    ]);
    expect(changedFilesKey(child, branches)).toBe("c@CHILD~PARENT");
  });

  it("uses an empty parent revision when the branch has no parent", () => {
    const root = b({ name: "develop", revision: "ROOT" });
    expect(changedFilesKey(root, new Map([["develop", root]]))).toBe("develop@ROOT~");
  });

  it("changes when the parent's tip moves, so the diff is refetched", () => {
    const child = b({ name: "c", revision: "CHILD", parent: "p" });
    const before = changedFilesKey(
      child,
      new Map([["p", b({ name: "p", revision: "OLD" })]])
    );
    const after = changedFilesKey(
      child,
      new Map([["p", b({ name: "p", revision: "NEW" })]])
    );
    expect(before).not.toBe(after);
  });
});

describe("prNumbersOf", () => {
  it("collects PR numbers only for branches that have a PR", () => {
    const r = repo([
      b({ name: "a", pr: pr(10) }),
      b({ name: "b" }),
      b({ name: "c", pr: pr(20) }),
    ]);
    expect(prNumbersOf(r).sort((x, y) => x - y)).toEqual([10, 20]);
  });

  it("returns an empty array when no branch has a PR", () => {
    expect(prNumbersOf(repo([b({ name: "a" })]))).toEqual([]);
  });
});
