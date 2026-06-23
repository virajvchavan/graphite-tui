import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./diff.js";

describe("parseUnifiedDiff", () => {
  it("returns no rows for empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });

  it("drops file-level header metadata before the first hunk", () => {
    const text = [
      "diff --git a/x.ts b/x.ts",
      "index abc123..def456 100644",
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -1,2 +1,2 @@",
      " a",
      "-b",
      "+c",
    ].join("\n");
    expect(parseUnifiedDiff(text)).toEqual([
      { kind: "context", oldNo: 1, newNo: 1, text: "a" },
      { kind: "del", oldNo: 2, newNo: null, text: "b" },
      { kind: "add", oldNo: null, newNo: 2, text: "c" },
    ]);
  });

  it("tracks running old/new line numbers from the hunk header", () => {
    const text = ["@@ -10,3 +20,4 @@", " ctx", "+new", " ctx2"].join("\n");
    expect(parseUnifiedDiff(text)).toEqual([
      { kind: "context", oldNo: 10, newNo: 20, text: "ctx" },
      { kind: "add", oldNo: null, newNo: 21, text: "new" },
      { kind: "context", oldNo: 11, newNo: 22, text: "ctx2" },
    ]);
  });

  it("advances only the old counter on deletions and only the new counter on additions", () => {
    const text = ["@@ -5,2 +5,2 @@", "-gone", "+fresh"].join("\n");
    expect(parseUnifiedDiff(text)).toEqual([
      { kind: "del", oldNo: 5, newNo: null, text: "gone" },
      { kind: "add", oldNo: null, newNo: 5, text: "fresh" },
    ]);
  });

  it("emits a hunk separator carrying the section heading for non-leading hunks", () => {
    const text = [
      "@@ -1,1 +1,1 @@",
      " first",
      "@@ -10,1 +10,1 @@ function foo()",
      " second",
    ].join("\n");
    expect(parseUnifiedDiff(text)).toEqual([
      { kind: "context", oldNo: 1, newNo: 1, text: "first" },
      { kind: "hunk", oldNo: null, newNo: null, text: "function foo()" },
      { kind: "context", oldNo: 10, newNo: 10, text: "second" },
    ]);
  });

  it("does not emit a separator before the very first hunk", () => {
    const rows = parseUnifiedDiff(["@@ -1,1 +1,1 @@ heading", " a"].join("\n"));
    expect(rows.every((r) => r.kind !== "hunk")).toBe(true);
  });

  it("ignores the \\ No newline at end of file marker", () => {
    const text = ["@@ -1,1 +1,1 @@", "-old", "\\ No newline at end of file", "+new"].join(
      "\n"
    );
    expect(parseUnifiedDiff(text)).toEqual([
      { kind: "del", oldNo: 1, newNo: null, text: "old" },
      { kind: "add", oldNo: null, newNo: 1, text: "new" },
    ]);
  });

  it("expands tabs to two spaces so the gutter stays column-aligned", () => {
    const text = ["@@ -1,1 +1,1 @@", "+\tindented\tcode"].join("\n");
    expect(parseUnifiedDiff(text)[0].text).toBe("  indented  code");
  });

  it("handles single-line hunk headers without comma counts", () => {
    const text = ["@@ -1 +1 @@", "-x", "+y"].join("\n");
    expect(parseUnifiedDiff(text)).toEqual([
      { kind: "del", oldNo: 1, newNo: null, text: "x" },
      { kind: "add", oldNo: null, newNo: 1, text: "y" },
    ]);
  });

  it("tolerates a trailing newline", () => {
    expect(parseUnifiedDiff("@@ -1,1 +1,1 @@\n a\n")).toEqual([
      { kind: "context", oldNo: 1, newNo: 1, text: "a" },
    ]);
  });
});
