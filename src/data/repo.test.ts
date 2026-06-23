import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NotAGraphiteRepoError,
  readRebaseState,
  readRepoConfig,
  type RepoPaths,
} from "./repo.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gt-repo-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** RepoPaths rooted at the temp dir (gitDir == repoRoot for simplicity). */
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

function writeConfig(obj: unknown) {
  writeFileSync(join(dir, ".graphite_repo_config"), JSON.stringify(obj));
}

describe("readRepoConfig", () => {
  it("reads the trunk and last-fetched timestamp", () => {
    writeConfig({ trunk: "develop", lastFetchedPRInfoMs: 1700000000000 });
    expect(readRepoConfig(paths())).toEqual({
      trunk: "develop",
      trunks: ["develop"],
      lastFetchedPrInfoMs: 1700000000000,
    });
  });

  it("falls back to the first entry of trunks[] when trunk is absent", () => {
    writeConfig({ trunks: [{ name: "main" }, { name: "release" }] });
    const cfg = readRepoConfig(paths());
    expect(cfg.trunk).toBe("main");
    expect(cfg.trunks).toEqual(["main", "release"]);
  });

  it("nulls the timestamp when it isn't a number", () => {
    writeConfig({ trunk: "develop" });
    expect(readRepoConfig(paths()).lastFetchedPrInfoMs).toBeNull();
  });

  it("throws NotAGraphiteRepoError when the config file is missing", () => {
    expect(() => readRepoConfig(paths())).toThrow(NotAGraphiteRepoError);
  });

  it("throws NotAGraphiteRepoError when no trunk is configured", () => {
    writeConfig({ trunks: [] });
    expect(() => readRepoConfig(paths())).toThrow(NotAGraphiteRepoError);
  });
});

describe("readRebaseState", () => {
  it("returns null when no rebase is in progress", () => {
    expect(readRebaseState(paths())).toBeNull();
  });

  it("detects a rebase-merge directory and strips refs/heads/ from the branch", () => {
    const rdir = join(dir, "rebase-merge");
    mkdirSync(rdir);
    writeFileSync(join(rdir, "head-name"), "refs/heads/feature-x\n");
    const state = readRebaseState(paths());
    expect(state).not.toBeNull();
    expect(state!.branch).toBe("feature-x");
    // temp dir isn't a real git repo, so the conflicted-file lookup yields none
    expect(state!.files).toEqual([]);
  });

  it("falls back to the rebase-apply directory", () => {
    mkdirSync(join(dir, "rebase-apply"));
    const state = readRebaseState(paths());
    expect(state).not.toBeNull();
    // head-name absent -> branch is null, not an error
    expect(state!.branch).toBeNull();
  });
});
