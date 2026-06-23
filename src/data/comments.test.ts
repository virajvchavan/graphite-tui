import { describe, expect, it } from "vitest";
import { mapCiState } from "./comments.js";

describe("mapCiState", () => {
  it("maps SUCCESS to passed", () => {
    expect(mapCiState("SUCCESS")).toBe("passed");
  });

  it("maps FAILURE and ERROR to failed", () => {
    expect(mapCiState("FAILURE")).toBe("failed");
    expect(mapCiState("ERROR")).toBe("failed");
  });

  it("maps PENDING and EXPECTED to pending", () => {
    expect(mapCiState("PENDING")).toBe("pending");
    expect(mapCiState("EXPECTED")).toBe("pending");
  });

  it("returns null for unknown, undefined, or absent state", () => {
    expect(mapCiState("WHATEVER")).toBeNull();
    expect(mapCiState(undefined)).toBeNull();
    expect(mapCiState(null)).toBeNull();
  });
});
