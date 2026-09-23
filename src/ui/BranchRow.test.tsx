import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import type { Branch, RenderRow } from "../types.js";
import { BranchRow } from "./BranchRow.js";

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

const branch = (over: Partial<Branch> = {}): Branch => ({
  name: "feature",
  parent: "develop",
  children: [],
  revision: "abc",
  isTrunk: false,
  needsRestack: false,
  state: null,
  age: "52m",
  ahead: 91,
  behind: 1,
  upstreamGone: false,
  unpushed: false,
  pr: {
    prNumber: 10007,
    title: "perf: counts-only IF upload response, chunked convert",
    state: "OPEN",
    reviewDecision: null,
    isDraft: true,
    url: "https://example.test/pr/10007",
    headRefName: "feature",
    baseRefName: "develop",
  },
  displayTitle: "perf: counts-only IF upload response, chunked convert",
  ...over,
});

const row = (over: Partial<RenderRow> = {}): RenderRow => ({
  branch: branch(),
  depth: 0,
  column: 0,
  through: [false, false, false],
  mergeFrom: [],
  isCurrent: true,
  detached: false,
  ...over,
});

/** Frame lines with colour codes stripped, as the terminal would lay them out. */
function lines(frame: string): string[] {
  return frame.split("\n").map((l) => l.split(ANSI).join(""));
}

describe("BranchRow", () => {
  // A row wider than `width` makes Ink wrap the flex row onto a second line,
  // which reads as a blank gap punched into the middle of the graph.
  it("never wraps, however much metadata the row carries", () => {
    for (const width of [121, 100, 80, 60, 45, 30]) {
      const out = lines(
        render(
          <BranchRow
            row={row()}
            columnCount={3}
            selected
            focused
            width={width}
            prW={6}
            statusW={7}
            ageW={3}
            ciW={1}
            mergeConflict
            threadCounts={{ total: 4, resolved: 1 }}
            ci="passed"
          />
        ).lastFrame() ?? ""
      );
      expect(out, `width ${width}`).toHaveLength(1);
      expect([...out[0]].length, `width ${width}`).toBeLessThanOrEqual(width);
    }
  });

  it("keeps the fixed right-hand columns and drops indicators when cramped", () => {
    const out = lines(
      render(
        <BranchRow
          row={row()}
          columnCount={3}
          selected={false}
          focused={false}
          width={45}
          prW={6}
          statusW={7}
          ageW={3}
          ciW={1}
          mergeConflict
          ci="passed"
        />
      ).lastFrame() ?? ""
    );
    expect(out[0]).toContain("#10007");
    expect(out[0]).toContain("52m");
    expect(out[0]).not.toContain("conflicts");
  });

  it("gives the title all the space the metadata leaves free", () => {
    const out = lines(
      render(
        <BranchRow
          row={row({ branch: branch({ ahead: 0, behind: 0 }) })}
          columnCount={3}
          selected={false}
          focused={false}
          width={90}
          prW={6}
          statusW={7}
          ageW={3}
          ciW={1}
          ci="passed"
        />
      ).lastFrame() ?? ""
    );
    expect(out[0]).toContain("perf: counts-only IF upload response, chunked convert");
  });
});
