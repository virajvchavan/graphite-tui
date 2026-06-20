import { describe, expect, it } from "vitest";
import { parseUpstreamTrack } from "./git.js";

describe("parseUpstreamTrack", () => {
  it("treats empty (in-sync) as zero ahead/behind", () => {
    expect(parseUpstreamTrack("")).toEqual({ ahead: 0, behind: 0, gone: false });
  });

  it("parses ahead only (unpushed commits)", () => {
    expect(parseUpstreamTrack("[ahead 3]")).toEqual({ ahead: 3, behind: 0, gone: false });
  });

  it("parses behind only (unpulled commits)", () => {
    expect(parseUpstreamTrack("[behind 2]")).toEqual({ ahead: 0, behind: 2, gone: false });
  });

  it("parses diverged (ahead and behind)", () => {
    expect(parseUpstreamTrack("[ahead 3, behind 2]")).toEqual({
      ahead: 3,
      behind: 2,
      gone: false,
    });
  });

  it("flags a gone upstream", () => {
    expect(parseUpstreamTrack("[gone]")).toEqual({ ahead: 0, behind: 0, gone: true });
  });
});
