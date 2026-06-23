import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchWorkingTree } from "./watch.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Does this platform support the recursive watch the tests rely on? On Linux
 * watchWorkingTree falls back to a 60s poll, so event-delivery asserts can't
 * hold and those tests are skipped. */
function recursiveWatchSupported(dir: string): boolean {
  try {
    watch(dir, { recursive: true }).close();
    return true;
  } catch {
    return false;
  }
}

describe("watchWorkingTree", () => {
  it("fires on a working-tree edit and ignores .git churn", async () => {
    const root = mkdtempSync(join(tmpdir(), "wt-"));
    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, "sub"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    if (!recursiveWatchSupported(root)) return;

    let fires = 0;
    cleanups.push(watchWorkingTree(root, () => fires++));

    writeFileSync(join(root, "sub", "a.txt"), "x");
    await wait(700);
    expect(fires).toBe(1);

    writeFileSync(join(root, ".git", "HEAD"), "y");
    await wait(700);
    expect(fires).toBe(1); // .git events are ignored

    // A second edit fires too, but only after the >1s rate cap elapses. Waits
    // are generous so FSEvents delivery lag under parallel test load can't
    // flake the exact counts.
    writeFileSync(join(root, "sub", "b.txt"), "z");
    await wait(2200);
    expect(fires).toBe(2);
  });

  it("caps the refresh rate under a churny burst", async () => {
    const root = mkdtempSync(join(tmpdir(), "wt-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    if (!recursiveWatchSupported(root)) return;

    let fires = 0;
    cleanups.push(watchWorkingTree(root, () => fires++));

    // Six writes spaced 200ms apart (wider than the 150ms debounce, so each
    // would fire on its own without the rate cap → ~6 refreshes). The 1s cap
    // should collapse them into far fewer.
    for (let i = 0; i < 6; i++) {
      writeFileSync(join(root, `f${i}.txt`), String(i));
      await wait(200);
    }
    await wait(2000); // let the trailing refresh land
    expect(fires).toBeGreaterThanOrEqual(1);
    expect(fires).toBeLessThanOrEqual(3);
  });
});
