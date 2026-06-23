import { describe, expect, it } from "vitest";
import { isLightLuminance, parseOsc11 } from "./detectTheme.js";

describe("isLightLuminance", () => {
  it("treats white as light and black as dark", () => {
    expect(isLightLuminance(1, 1, 1)).toBe(true);
    expect(isLightLuminance(0, 0, 0)).toBe(false);
  });

  it("uses perceptual weights (bright green is light, deep blue is dark)", () => {
    expect(isLightLuminance(0, 1, 0)).toBe(true); // 0.587 > 0.5
    expect(isLightLuminance(0, 0, 1)).toBe(false); // 0.114 < 0.5
  });
});

describe("parseOsc11", () => {
  it("parses a 16-bit white background as light", () => {
    expect(parseOsc11("\x1b]11;rgb:ffff/ffff/ffff\x07")).toBe("light");
  });

  it("parses a 16-bit black background as dark", () => {
    expect(parseOsc11("\x1b]11;rgb:0000/0000/0000\x1b\\")).toBe("dark");
  });

  it("handles short (8-bit) channels", () => {
    expect(parseOsc11("\x1b]11;rgb:ff/ff/ff\x07")).toBe("light");
    expect(parseOsc11("\x1b]11;rgb:1e/1e/1e\x07")).toBe("dark");
  });

  it("returns null for an unrecognizable reply", () => {
    expect(parseOsc11("\x1b[?62;c")).toBeNull();
    expect(parseOsc11("")).toBeNull();
  });
});
