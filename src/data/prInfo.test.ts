import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeReview, normalizeState, readPrInfo } from "./prInfo.js";
import type { RepoPaths } from "./repo.js";

describe("normalizeState", () => {
  it("passes MERGED and CLOSED through (case-insensitively)", () => {
    expect(normalizeState("MERGED")).toBe("MERGED");
    expect(normalizeState("closed")).toBe("CLOSED");
  });

  it("treats anything else (incl. OPEN, unknown, empty) as OPEN", () => {
    expect(normalizeState("OPEN")).toBe("OPEN");
    expect(normalizeState("SOMETHING")).toBe("OPEN");
    expect(normalizeState("")).toBe("OPEN");
  });
});

describe("normalizeReview", () => {
  it("returns null for a missing decision", () => {
    expect(normalizeReview(null)).toBeNull();
    expect(normalizeReview("")).toBeNull();
  });

  it("recognizes the three known decisions (case-insensitively)", () => {
    expect(normalizeReview("approved")).toBe("APPROVED");
    expect(normalizeReview("CHANGES_REQUESTED")).toBe("CHANGES_REQUESTED");
    expect(normalizeReview("review_required")).toBe("REVIEW_REQUIRED");
  });

  it("returns null for an unrecognized decision", () => {
    expect(normalizeReview("DISMISSED")).toBeNull();
  });
});

describe("readPrInfo", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gt-pr-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function paths(): RepoPaths {
    return {
      repoRoot: dir,
      gitDir: dir,
      metadataDb: join(dir, ".graphite_metadata.db"),
      prInfo: join(dir, ".graphite_pr_info"),
      repoConfig: join(dir, ".graphite_repo_config"),
      head: join(dir, "HEAD"),
      index: join(dir, "index"),
    };
  }
  const write = (obj: unknown) =>
    writeFileSync(join(dir, ".graphite_pr_info"), JSON.stringify(obj));

  it("returns an empty map when the file is missing", () => {
    expect(readPrInfo(paths()).size).toBe(0);
  });

  it("returns an empty map on malformed JSON", () => {
    writeFileSync(join(dir, ".graphite_pr_info"), "{not json");
    expect(readPrInfo(paths()).size).toBe(0);
  });

  it("keys PRs by headRefName and normalizes state/review/draft", () => {
    write({
      prInfos: [
        {
          prNumber: 12,
          title: "Add thing",
          state: "open",
          reviewDecision: "approved",
          isDraft: 0,
          url: "https://github.com/o/r/pull/12",
          headRefName: "feature-a",
          baseRefName: "develop",
          authorGithubHandle: "octocat",
        },
      ],
    });
    const map = readPrInfo(paths());
    expect(map.get("feature-a")).toEqual({
      prNumber: 12,
      title: "Add thing",
      state: "OPEN",
      reviewDecision: "APPROVED",
      isDraft: false,
      url: "https://github.com/o/r/pull/12",
      headRefName: "feature-a",
      baseRefName: "develop",
      authorGithubHandle: "octocat",
    });
  });

  it("skips entries without a headRefName", () => {
    write({ prInfos: [{ prNumber: 1, title: "x", state: "OPEN", headRefName: "" }] });
    expect(readPrInfo(paths()).size).toBe(0);
  });
});
