import { describe, expect, it } from "vitest";
import { abbreviateAge, parseRemoteUrl, parseUpstreamTrack } from "./git.js";

describe("parseRemoteUrl", () => {
  it("converts an SSH remote to its https web form, dropping the .git suffix", () => {
    expect(parseRemoteUrl("git@github.com:owner/repo.git")).toBe(
      "https://github.com/owner/repo"
    );
  });

  it("keeps SSH remotes without a .git suffix", () => {
    expect(parseRemoteUrl("git@github.com:owner/repo")).toBe(
      "https://github.com/owner/repo"
    );
  });

  it("normalizes https remotes and strips .git", () => {
    expect(parseRemoteUrl("https://github.com/owner/repo.git")).toBe(
      "https://github.com/owner/repo"
    );
    expect(parseRemoteUrl("https://github.com/owner/repo")).toBe(
      "https://github.com/owner/repo"
    );
  });

  it("handles ssh:// URLs with an embedded user", () => {
    expect(parseRemoteUrl("ssh://git@github.com/owner/repo.git")).toBe(
      "https://github.com/owner/repo"
    );
  });

  it("preserves multi-segment owner/repo paths (e.g. self-hosted subgroups)", () => {
    expect(parseRemoteUrl("git@gitlab.com:group/subgroup/repo.git")).toBe(
      "https://gitlab.com/group/subgroup/repo"
    );
  });

  it("returns null for an unparseable remote", () => {
    expect(parseRemoteUrl("not a url")).toBeNull();
    expect(parseRemoteUrl("")).toBeNull();
  });
});

describe("abbreviateAge", () => {
  it("abbreviates each unit to a single letter", () => {
    expect(abbreviateAge("2 days ago")).toBe("2d");
    expect(abbreviateAge("3 hours ago")).toBe("3h");
    expect(abbreviateAge("45 seconds ago")).toBe("45s");
    expect(abbreviateAge("5 minutes ago")).toBe("5m");
    expect(abbreviateAge("2 weeks ago")).toBe("2w");
    expect(abbreviateAge("1 year ago")).toBe("1y");
  });

  it("uses 'mo' for months so they don't collide with minutes", () => {
    expect(abbreviateAge("6 months ago")).toBe("6mo");
  });

  it("collapses just-now phrasings to 'now'", () => {
    expect(abbreviateAge("just now")).toBe("now");
    expect(abbreviateAge("a moment ago")).toBe("now");
  });

  it("returns the input unchanged when it matches no known pattern", () => {
    expect(abbreviateAge("ages ago")).toBe("ages ago");
  });
});

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
