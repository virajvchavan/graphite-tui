import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock execa so command tests never spawn real processes. Hoisted by vitest.
vi.mock("execa", () => ({ execa: vi.fn() }));

import { execa } from "execa";
import * as gt from "./gt.js";
import * as commandLog from "./commandLog.js";
import { summarizeError } from "./gt.js";

// execa is mocked; cast to a plain mock so we can drive its return value.
const mockExeca = execa as unknown as ReturnType<typeof vi.fn>;

/**
 * A fake execa child-process promise: awaitable and carrying an `.all` stream
 * stub (matching how `execLogged` subscribes to combined output).
 */
function proc(result: unknown, reject = false): unknown {
  const p: { all: { on: () => void } } & Promise<unknown> = (
    reject ? Promise.reject(result) : Promise.resolve(result)
  ) as never;
  if (reject) p.catch(() => {}); // pre-empt the unhandled-rejection warning
  p.all = { on: () => {} };
  return p;
}

describe("summarizeError", () => {
  it("falls back to a generic message for empty output", () => {
    expect(summarizeError("")).toBe("command failed");
    expect(summarizeError("\n  \n")).toBe("command failed");
  });

  it("uses the last non-empty line when nothing looks actionable", () => {
    expect(summarizeError("doing a thing\nall good\n")).toBe("all good");
  });

  it("prefers an actionable line buried in the middle over the generic last line", () => {
    const out = [
      "Rebasing branch onto trunk...",
      "CONFLICT (content): Merge conflict in src/a.ts",
      "Run gt continue when ready.",
    ].join("\n");
    expect(summarizeError(out)).toBe("CONFLICT (content): Merge conflict in src/a.ts");
  });

  it("recognizes error/fatal/abort/cannot/failed/not keywords case-insensitively", () => {
    expect(summarizeError("step one\nFATAL: bad ref\ntrailing")).toBe("FATAL: bad ref");
    expect(summarizeError("ok\nAborting the rebase\nbye")).toBe("Aborting the rebase");
    expect(summarizeError("ok\ncannot do that\nbye")).toBe("cannot do that");
    expect(summarizeError("ok\nnot a valid branch\nbye")).toBe("not a valid branch");
  });

  it("trims surrounding whitespace on the chosen line", () => {
    expect(summarizeError("   leading and trailing   ")).toBe("leading and trailing");
  });
});

describe("gt commands", () => {
  beforeEach(() => {
    mockExeca.mockReset();
    commandLog.clear();
  });

  it("checkout passes the branch plus the pinned --cwd/--no-interactive flags", async () => {
    mockExeca.mockReturnValue(proc({ all: "" }));
    const res = await gt.checkout("/repo", "feature-x");
    expect(res).toEqual({ ok: true, message: "Checked out feature-x" });
    expect(mockExeca).toHaveBeenCalledWith(
      "gt",
      ["checkout", "feature-x", "--cwd", "/repo", "--no-interactive"],
      expect.objectContaining({ all: true })
    );
  });

  it("sync runs `gt sync --force`", async () => {
    mockExeca.mockReturnValue(proc({ all: "" }));
    const res = await gt.sync("/repo");
    expect(res).toEqual({ ok: true, message: "Synced with trunk" });
    expect(mockExeca).toHaveBeenCalledWith(
      "gt",
      ["sync", "--force", "--cwd", "/repo", "--no-interactive"],
      expect.anything()
    );
  });

  it("stageFile shells out to git (not gt) and reports the basename", async () => {
    mockExeca.mockReturnValue(proc({ all: "" }));
    const res = await gt.stageFile("/repo", "src/deep/file.ts");
    expect(res).toEqual({ ok: true, message: "Staged file.ts" });
    expect(mockExeca).toHaveBeenCalledWith(
      "git",
      ["add", "--", "src/deep/file.ts"],
      expect.objectContaining({ cwd: "/repo" })
    );
  });

  it("maps a failed command to a summarized failure with full detail", async () => {
    const full = "Rebasing...\nCONFLICT (content): Merge conflict in a.ts\ndone";
    mockExeca.mockReturnValue(proc({ all: full }, true));
    const res = await gt.restack("/repo");
    expect(res.ok).toBe(false);
    expect(res.message).toBe("CONFLICT (content): Merge conflict in a.ts");
    expect(res.detail).toBe(full);
  });

  it("records each command in the session log, marked ok or error", async () => {
    mockExeca.mockReturnValue(proc({ all: "" }));
    await gt.checkout("/repo", "main");
    mockExeca.mockReturnValue(proc({ all: "boom" }, true));
    await gt.restack("/repo");

    const log = commandLog.getSnapshot();
    // The logged display string omits the pinned --cwd/--no-interactive flags;
    // those are only passed to the actual invocation.
    expect(log.map((e) => [e.command, e.status])).toEqual([
      ["gt checkout main", "ok"],
      ["gt restack", "error"],
    ]);
  });
});
