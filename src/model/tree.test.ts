import { describe, expect, it } from "vitest";
import { buildRenderRows } from "./tree.js";
import type { Branch, RepoData } from "../types.js";

function b(partial: Partial<Branch> & { name: string }): Branch {
  return {
    parent: null,
    children: [],
    isTrunk: false,
    needsRestack: false,
    state: null,
    age: "",
    pr: null,
    displayTitle: partial.name,
    ...partial,
  };
}

function makeData(branches: Branch[], current: string | null): RepoData {
  return {
    repoRoot: "/repo",
    trunk: "develop",
    branches: new Map(branches.map((x) => [x.name, x])),
    currentBranch: current,
    lastFetchedPrInfoMs: null,
  };
}

describe("buildRenderRows", () => {
  it("renders a linear stack with trunk at the bottom", () => {
    const data = makeData(
      [
        b({ name: "develop", isTrunk: true, children: ["a"] }),
        b({ name: "a", parent: "develop", children: ["c"] }),
        b({ name: "c", parent: "a" }),
      ],
      "c"
    );
    const rows = buildRenderRows(data);
    expect(rows.map((r) => r.branch.name)).toEqual(["c", "a", "develop"]);
    expect(rows.every((r) => r.column === 0)).toBe(true);
  });

  it("puts the stack containing the current branch in column 0", () => {
    // develop has two children: a short side branch and the long main chain.
    const data = makeData(
      [
        b({ name: "develop", isTrunk: true, children: ["side", "main1"] }),
        b({ name: "side", parent: "develop" }),
        b({ name: "main1", parent: "develop", children: ["main2"] }),
        b({ name: "main2", parent: "main1" }),
      ],
      "main2"
    );
    const rows = buildRenderRows(data);
    const byName = new Map(rows.map((r) => [r.branch.name, r]));
    expect(byName.get("main2")!.column).toBe(0);
    expect(byName.get("main1")!.column).toBe(0);
    expect(byName.get("side")!.column).toBe(1);
    // main chain renders above the side branch, trunk last.
    expect(rows.map((r) => r.branch.name)).toEqual([
      "main2",
      "main1",
      "side",
      "develop",
    ]);
  });

  it("computes a through-line and a merge corner for a side stack", () => {
    const data = makeData(
      [
        b({ name: "develop", isTrunk: true, children: ["side", "main1"] }),
        b({ name: "side", parent: "develop" }),
        b({ name: "main1", parent: "develop", children: ["main2"] }),
        b({ name: "main2", parent: "main1" }),
      ],
      "main2"
    );
    const rows = buildRenderRows(data);
    const side = rows.find((r) => r.branch.name === "side")!;
    const develop = rows.find((r) => r.branch.name === "develop")!;
    // The main chain's column 0 passes through the side branch's row.
    expect(side.through[0]).toBe(true);
    // The side branch (column 1) merges into trunk on the trunk row.
    expect(develop.mergeFrom).toContain(1);
  });

  it("excludes branches not reachable from a trunk", () => {
    const data = makeData(
      [
        b({ name: "develop", isTrunk: true, children: ["a"] }),
        b({ name: "a", parent: "develop" }),
        // orphan branches gt isn't tracking
        b({ name: "main", validationResult: "BAD_PARENT_NAME" as never }),
        b({ name: "release/qa" }),
      ],
      "a"
    );
    const rows = buildRenderRows(data);
    expect(rows.map((r) => r.branch.name).sort()).toEqual(["a", "develop"]);
  });
});
