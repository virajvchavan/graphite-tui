import { beforeEach, describe, expect, it } from "vitest";
import * as log from "./commandLog.js";

// Module-scoped store; reset between tests so ids/entries don't leak.
beforeEach(() => log.clear());

const flush = () => new Promise<void>((r) => queueMicrotask(r));

describe("commandLog store", () => {
  it("starts an entry in the running state and exposes it via the snapshot", () => {
    const id = log.start("gt sync");
    const snap = log.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({ id, command: "gt sync", output: "", status: "running" });
  });

  it("hands out monotonically increasing ids that survive a clear", () => {
    const a = log.start("one");
    const b = log.start("two");
    expect(b).toBeGreaterThan(a);
    log.clear();
    const c = log.start("three");
    expect(c).toBeGreaterThan(b);
  });

  it("appends streamed output and reflects it in hasOutput", () => {
    const id = log.start("gt restack");
    expect(log.hasOutput(id)).toBe(false);
    log.append(id, "line one\n");
    log.append(id, "line two\n");
    expect(log.getSnapshot()[0].output).toBe("line one\nline two\n");
    expect(log.hasOutput(id)).toBe(true);
  });

  it("ignores append/finish/hasOutput for an unknown id", () => {
    expect(() => log.append(999, "x")).not.toThrow();
    expect(() => log.finish(999, "ok")).not.toThrow();
    expect(log.hasOutput(999)).toBe(false);
  });

  it("marks an entry terminal with finish", () => {
    const id = log.start("gt submit");
    log.finish(id, "error");
    expect(log.getSnapshot()[0].status).toBe("error");
  });

  it("replaces the snapshot array reference on every mutation", () => {
    const before = log.getSnapshot();
    const id = log.start("gt sync");
    const afterStart = log.getSnapshot();
    expect(afterStart).not.toBe(before);
    log.append(id, "x");
    expect(log.getSnapshot()).not.toBe(afterStart);
  });

  it("clears all entries", () => {
    log.start("a");
    log.start("b");
    log.clear();
    expect(log.getSnapshot()).toEqual([]);
  });

  it("notifies subscribers once per coalesced burst, and stops after unsubscribe", async () => {
    let calls = 0;
    const unsubscribe = log.subscribe(() => calls++);

    const id = log.start("gt sync");
    log.append(id, "a");
    log.append(id, "b");
    // Coalesced onto a single microtask, so one notification for the burst.
    await flush();
    expect(calls).toBe(1);

    unsubscribe();
    log.append(id, "c");
    await flush();
    expect(calls).toBe(1);
  });
});
