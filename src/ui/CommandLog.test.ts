import { describe, expect, it } from "vitest";
import { flattenLog } from "./CommandLog.js";
import type { LogEntry } from "../actions/commandLog.js";

function entry(over: Partial<LogEntry>): LogEntry {
  return { id: 1, command: "gt sync", output: "", status: "ok", ...over };
}

describe("flattenLog", () => {
  it("renders a command header line per entry (marker chosen at render time, not in text)", () => {
    const lines = flattenLog([entry({ command: "gt sync --force" })]);
    expect(lines).toEqual([
      {
        text: "gt sync --force",
        kind: "command",
        entryId: 1,
        collapsed: false,
        hasOutput: false,
      },
    ]);
  });

  it("appends one output line per line of output, trimming the trailing newline", () => {
    const lines = flattenLog([
      entry({ command: "gt restack", output: "one\ntwo\n" }),
    ]);
    expect(lines.map((l) => l.text)).toEqual(["gt restack", "one", "two"]);
    expect(lines[0].hasOutput).toBe(true);
    expect(lines.slice(1).every((l) => l.kind === "output")).toBe(true);
  });

  it("hides output and appends a line count to the header when collapsed", () => {
    const e = entry({ id: 7, command: "gt restack", output: "one\ntwo\n" });
    const lines = flattenLog([e], new Set([7]));
    expect(lines).toEqual([
      {
        text: "gt restack  (2 lines)",
        kind: "command",
        entryId: 7,
        collapsed: true,
        hasOutput: true,
      },
    ]);
  });

  it("collapsing one entry leaves others expanded", () => {
    const lines = flattenLog(
      [
        entry({ id: 1, command: "gt sync", output: "a\nb" }),
        entry({ id: 2, command: "gt restack", output: "c" }),
      ],
      new Set([1])
    );
    expect(lines.map((l) => l.text)).toEqual([
      "gt sync  (2 lines)",
      "gt restack",
      "c",
    ]);
  });

  it("marks running and failed command lines distinctly", () => {
    expect(flattenLog([entry({ status: "running" })])[0].kind).toBe(
      "command-running"
    );
    expect(flattenLog([entry({ status: "error" })])[0].kind).toBe(
      "command-error"
    );
  });

  it("tags every line (header and output) with its owning entry id", () => {
    const lines = flattenLog([entry({ id: 5, output: "x\ny" })]);
    expect(lines.every((l) => l.entryId === 5)).toBe(true);
  });
});
