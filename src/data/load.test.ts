import { describe, expect, it } from "vitest";
import { computeNeedsRestack, pruneMissingBranches } from "./load.js";
import type { BranchMeta } from "../types.js";

function meta(partial: Partial<BranchMeta> & { branchName: string }): BranchMeta {
  return {
    parentBranchName: null,
    parentBranchRevision: null,
    parentHeadRevision: null,
    children: [],
    branchRevision: null,
    state: null,
    validationResult: "VALID",
    ...partial,
  };
}

describe("computeNeedsRestack", () => {
  it("is false for trunk", () => {
    const m = meta({ branchName: "develop", validationResult: "TRUNK" });
    expect(computeNeedsRestack(m, true, new Map())).toBe(false);
  });

  it("is false when recorded parent revision matches the parent's tip", () => {
    const parent = meta({ branchName: "p", branchRevision: "abc123" });
    const child = meta({
      branchName: "c",
      parentBranchName: "p",
      parentBranchRevision: "abc123",
    });
    const map = new Map([
      ["p", parent],
      ["c", child],
    ]);
    expect(computeNeedsRestack(child, false, map)).toBe(false);
  });

  it("is true when the parent moved past the recorded revision", () => {
    const parent = meta({ branchName: "p", branchRevision: "newtip9" });
    const child = meta({
      branchName: "c",
      parentBranchName: "p",
      parentBranchRevision: "oldtip1",
    });
    const map = new Map([
      ["p", parent],
      ["c", child],
    ]);
    expect(computeNeedsRestack(child, false, map)).toBe(true);
  });

  it("falls back to parent_head_revision when the parent row is untracked", () => {
    const child = meta({
      branchName: "c",
      parentBranchName: "ghost",
      parentBranchRevision: "old",
      parentHeadRevision: "new",
    });
    expect(computeNeedsRestack(child, false, new Map())).toBe(true);
  });

  it("flags BAD_PARENT_NAME as needing restack", () => {
    const m = meta({ branchName: "x", validationResult: "BAD_PARENT_NAME" });
    expect(computeNeedsRestack(m, false, new Map())).toBe(true);
  });
});

describe("pruneMissingBranches", () => {
  const map = (...ms: BranchMeta[]) => new Map(ms.map((m) => [m.branchName, m]));

  it("drops a row whose local branch is gone and unlinks it from its parent", () => {
    const input = map(
      meta({ branchName: "develop", children: ["ghost"], validationResult: "TRUNK" }),
      meta({ branchName: "ghost", parentBranchName: "develop" })
    );
    const out = pruneMissingBranches(input, new Set(["develop"]));
    expect([...out.keys()]).toEqual(["develop"]);
    expect(out.get("develop")!.children).toEqual([]);
  });

  it("keeps rows whose local branch still exists", () => {
    const input = map(
      meta({ branchName: "develop", children: ["a"], validationResult: "TRUNK" }),
      meta({ branchName: "a", parentBranchName: "develop" })
    );
    const out = pruneMissingBranches(input, new Set(["develop", "a"]));
    expect(out).toBe(input);
  });

  it("splices a mid-stack ghost's children onto the surviving ancestor", () => {
    const input = map(
      meta({ branchName: "develop", children: ["ghost"], validationResult: "TRUNK" }),
      meta({ branchName: "ghost", parentBranchName: "develop", children: ["tip"] }),
      meta({ branchName: "tip", parentBranchName: "ghost" })
    );
    const out = pruneMissingBranches(input, new Set(["develop", "tip"]));
    expect(out.get("develop")!.children).toEqual(["tip"]);
    expect(out.get("tip")!.parentBranchName).toBe("develop");
  });

  it("collapses a run of consecutive ghosts", () => {
    const input = map(
      meta({ branchName: "develop", children: ["g1"], validationResult: "TRUNK" }),
      meta({ branchName: "g1", parentBranchName: "develop", children: ["g2"] }),
      meta({ branchName: "g2", parentBranchName: "g1", children: ["tip"] }),
      meta({ branchName: "tip", parentBranchName: "g2" })
    );
    const out = pruneMissingBranches(input, new Set(["develop", "tip"]));
    expect([...out.keys()]).toEqual(["develop", "tip"]);
    expect(out.get("develop")!.children).toEqual(["tip"]);
    expect(out.get("tip")!.parentBranchName).toBe("develop");
  });

  it("leaves metadata untouched when the ref listing came back empty", () => {
    const input = map(meta({ branchName: "develop", validationResult: "TRUNK" }));
    expect(pruneMissingBranches(input, new Set())).toBe(input);
  });
});
