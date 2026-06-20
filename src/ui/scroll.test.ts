import { describe, expect, it } from "vitest";
import { centeredOffset, keepVisibleOffset } from "./scroll.js";

describe("centeredOffset", () => {
  it("is 0 when everything fits", () => {
    expect(centeredOffset(3, 10, 6)).toBe(0);
  });

  it("centers the selection in the middle of the list", () => {
    // visible 5, selected 7 -> ideal 7-2 = 5
    expect(centeredOffset(7, 5, 12)).toBe(5);
  });

  it("clamps at the top", () => {
    expect(centeredOffset(0, 5, 12)).toBe(0);
    expect(centeredOffset(1, 5, 12)).toBe(0);
  });

  it("clamps at the bottom (no over-scroll past the last item)", () => {
    // maxOffset = 12 - 5 = 7
    expect(centeredOffset(11, 5, 12)).toBe(7);
  });

  it("keeps the selection within the visible window", () => {
    const visible = 4;
    const total = 20;
    for (let sel = 0; sel < total; sel++) {
      const off = centeredOffset(sel, visible, total);
      expect(sel).toBeGreaterThanOrEqual(off);
      expect(sel).toBeLessThan(off + visible);
    }
  });
});

describe("keepVisibleOffset", () => {
  it("stays at the top while the cursor fits in the first window", () => {
    expect(keepVisibleOffset(0, 5, 12)).toBe(0);
    expect(keepVisibleOffset(4, 5, 12)).toBe(0);
  });

  it("pins the cursor to the bottom edge once it scrolls past the window", () => {
    // visible 5, cursor 6 -> offset 6-5+1 = 2
    expect(keepVisibleOffset(6, 5, 12)).toBe(2);
  });

  it("clamps at the bottom (no over-scroll past the last item)", () => {
    // maxOffset = 12 - 5 = 7
    expect(keepVisibleOffset(11, 5, 12)).toBe(7);
  });

  it("keeps the cursor within the visible window", () => {
    const visible = 4;
    const total = 20;
    for (let cur = 0; cur < total; cur++) {
      const off = keepVisibleOffset(cur, visible, total);
      expect(cur).toBeGreaterThanOrEqual(off);
      expect(cur).toBeLessThan(off + visible);
    }
  });
});
