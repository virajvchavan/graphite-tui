import { describe, expect, it } from "vitest";
import { buildGutter } from "./graph.js";
import type { Branch, RenderRow } from "../types.js";

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

function row(branch: Branch, over: Partial<RenderRow> = {}): RenderRow {
  return {
    branch,
    depth: 0,
    column: 0,
    through: [false],
    mergeFrom: [],
    isCurrent: false,
    ...over,
  };
}

describe("buildGutter node glyphs", () => {
  it("draws a dotted ring for a branch that needs a restack", () => {
    const cells = buildGutter(row(b({ name: "a", needsRestack: true })), 1);
    expect(cells[0].isNode).toBe(true);
    expect(cells[0].glyph).toBe("◌");
  });

  it("prefers the restack ring over the current-branch marker", () => {
    const cells = buildGutter(
      row(b({ name: "a", needsRestack: true }), { isCurrent: true }),
      1
    );
    expect(cells[0].glyph).toBe("◌");
  });

  it("uses a filled ring for the current branch and a hollow one otherwise", () => {
    expect(buildGutter(row(b({ name: "a" }), { isCurrent: true }), 1)[0].glyph).toBe(
      "●"
    );
    expect(buildGutter(row(b({ name: "a" })), 1)[0].glyph).toBe("◯");
  });

  it("never marks the trunk as needing a restack", () => {
    const cells = buildGutter(
      row(b({ name: "develop", isTrunk: true, needsRestack: true })),
      1
    );
    expect(cells[0].glyph).toBe("◯");
  });
});
