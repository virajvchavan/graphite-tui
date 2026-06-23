import { describe, expect, it } from "vitest";
import { parseStatus } from "./status.js";

const NUL = "\x00";

describe("parseStatus", () => {
  it("parses staged, unstaged, and untracked entries", () => {
    // "M  keep.txt" = staged modify; " M util.ts" = unstaged modify;
    // "MM both.ts" = staged + further unstaged; "?? new.txt" = untracked.
    const out =
      `M  keep.txt${NUL}` +
      ` M src/util.ts${NUL}` +
      `MM src/both.ts${NUL}` +
      `?? new.txt${NUL}`;
    expect(parseStatus(out)).toEqual([
      {
        index: "M",
        worktree: " ",
        path: "keep.txt",
        origPath: undefined,
        staged: true,
        unstaged: false,
        untracked: false,
        additions: 0,
        deletions: 0,
      },
      {
        index: " ",
        worktree: "M",
        path: "src/util.ts",
        origPath: undefined,
        staged: false,
        unstaged: true,
        untracked: false,
        additions: 0,
        deletions: 0,
      },
      {
        index: "M",
        worktree: "M",
        path: "src/both.ts",
        origPath: undefined,
        staged: true,
        unstaged: true,
        untracked: false,
        additions: 0,
        deletions: 0,
      },
      {
        index: "?",
        worktree: "?",
        path: "new.txt",
        origPath: undefined,
        staged: false,
        unstaged: false,
        untracked: true,
        additions: 0,
        deletions: 0,
      },
    ]);
  });

  it("parses a rename: new path first, original path in the next token", () => {
    const out = `R  new.txt${NUL}old.txt${NUL}`;
    const files = parseStatus(out);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      index: "R",
      worktree: " ",
      path: "new.txt",
      origPath: "old.txt",
      staged: true,
    });
  });

  it("parses a deletion", () => {
    const out = ` D gone.txt${NUL}`;
    expect(parseStatus(out)[0]).toMatchObject({
      index: " ",
      worktree: "D",
      path: "gone.txt",
      staged: false,
      unstaged: true,
    });
  });

  it("returns an empty array for empty output", () => {
    expect(parseStatus("")).toEqual([]);
  });
});
