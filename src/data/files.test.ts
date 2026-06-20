import { describe, expect, it } from "vitest";
import { parseNameStatus } from "./files.js";

describe("parseNameStatus", () => {
  it("parses modified/added/deleted lines", () => {
    const out = "M\tsrc/a.ts\nA\tsrc/b.ts\nD\tsrc/c.ts";
    expect(parseNameStatus(out)).toEqual([
      { status: "M", path: "src/a.ts" },
      { status: "A", path: "src/b.ts" },
      { status: "D", path: "src/c.ts" },
    ]);
  });

  it("uses the destination path for renames and normalizes the status", () => {
    const out = "R100\tsrc/old.ts\tsrc/new.ts";
    expect(parseNameStatus(out)).toEqual([{ status: "R", path: "src/new.ts" }]);
  });

  it("handles copies and ignores blank lines", () => {
    const out = "\nC75\tsrc/a.ts\tsrc/copy.ts\n\n";
    expect(parseNameStatus(out)).toEqual([{ status: "C", path: "src/copy.ts" }]);
  });

  it("returns an empty array for empty output", () => {
    expect(parseNameStatus("")).toEqual([]);
  });
});
