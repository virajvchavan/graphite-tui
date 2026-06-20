import { describe, expect, it } from "vitest";
import { computeNeedsRestack } from "./load.js";
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
