import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { StatusBar } from "./StatusBar.js";

describe("StatusBar", () => {
  it("renders the hint pairs separated by a middot", () => {
    const { lastFrame } = render(
      <StatusBar message={null} hint={[["a", "stage"], ["?", "help"]]} />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("a stage");
    expect(frame).toContain("? help");
    expect(frame).toContain("·");
  });

  it("shows a success message with a check mark", () => {
    const { lastFrame } = render(
      <StatusBar message={{ text: "Synced with trunk", ok: true }} hint={[]} />
    );
    expect(lastFrame()).toContain("✓ Synced with trunk");
  });

  it("shows a failure message with a cross mark", () => {
    const { lastFrame } = render(
      <StatusBar message={{ text: "command failed", ok: false }} hint={[]} />
    );
    expect(lastFrame()).toContain("✗ command failed");
  });

  it("renders no message line when message is null", () => {
    const { lastFrame } = render(<StatusBar message={null} hint={[["?", "help"]]} />);
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("✓");
    expect(frame).not.toContain("✗");
  });
});
