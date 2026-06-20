import { describe, expect, it } from "vitest";
import { parseNameStatus, parseNumstat } from "./files.js";

describe("parseNameStatus", () => {
  it("parses modified/added/deleted lines", () => {
    const out = "M\tsrc/a.ts\nA\tsrc/b.ts\nD\tsrc/c.ts";
    expect(parseNameStatus(out)).toEqual([
      { status: "M", path: "src/a.ts", additions: 0, deletions: 0 },
      { status: "A", path: "src/b.ts", additions: 0, deletions: 0 },
      { status: "D", path: "src/c.ts", additions: 0, deletions: 0 },
    ]);
  });

  it("uses the destination path for renames and normalizes the status", () => {
    const out = "R100\tsrc/old.ts\tsrc/new.ts";
    expect(parseNameStatus(out)).toEqual([
      { status: "R", path: "src/new.ts", additions: 0, deletions: 0 },
    ]);
  });

  it("handles copies and ignores blank lines", () => {
    const out = "\nC75\tsrc/a.ts\tsrc/copy.ts\n\n";
    expect(parseNameStatus(out)).toEqual([
      { status: "C", path: "src/copy.ts", additions: 0, deletions: 0 },
    ]);
  });

  it("returns an empty array for empty output", () => {
    expect(parseNameStatus("")).toEqual([]);
  });
});

describe("parseNumstat", () => {
  it("parses additions/deletions keyed by path", () => {
    const out = "12\t3\tsrc/a.ts\x00100\t0\tsrc/b.ts\x00";
    const map = parseNumstat(out);
    expect(map.get("src/a.ts")).toEqual({ additions: 12, deletions: 3 });
    expect(map.get("src/b.ts")).toEqual({ additions: 100, deletions: 0 });
  });

  it("uses the destination path for renames", () => {
    const out = "1\t2\t\x00src/old.ts\x00src/new.ts\x00";
    const map = parseNumstat(out);
    expect(map.get("src/new.ts")).toEqual({ additions: 1, deletions: 2 });
    expect(map.has("src/old.ts")).toBe(false);
  });

  it("treats binary files (-) as zero counts", () => {
    const out = "-\t-\tlogo.png\x00";
    expect(parseNumstat(out)).toEqual(
      new Map([["logo.png", { additions: 0, deletions: 0 }]])
    );
  });

  it("returns an empty map for empty output", () => {
    expect(parseNumstat("")).toEqual(new Map());
  });
});
