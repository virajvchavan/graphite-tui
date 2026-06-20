import { execaSync } from "execa";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface RepoPaths {
  repoRoot: string;
  gitDir: string;
  metadataDb: string;
  prInfo: string;
  repoConfig: string;
  head: string;
}

export class NotAGitRepoError extends Error {}
export class NotAGraphiteRepoError extends Error {}

/** Resolve the git repo root for a given cwd, throwing if not in a repo. */
export function resolveRepoRoot(cwd: string): string {
  try {
    const { stdout } = execaSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
    });
    return stdout.trim();
  } catch {
    throw new NotAGitRepoError(
      "Not inside a git repository. Run graphite-tui from within a repo."
    );
  }
}

/** Resolve the absolute .git directory (handles worktrees/submodules). */
export function resolveGitDir(cwd: string): string {
  const { stdout } = execaSync("git", ["rev-parse", "--absolute-git-dir"], {
    cwd,
  });
  return stdout.trim();
}

/** Build the set of Graphite-related paths for a repo. */
export function resolveRepoPaths(cwd: string): RepoPaths {
  const repoRoot = resolveRepoRoot(cwd);
  const gitDir = resolveGitDir(cwd);
  return {
    repoRoot,
    gitDir,
    metadataDb: join(gitDir, ".graphite_metadata.db"),
    prInfo: join(gitDir, ".graphite_pr_info"),
    repoConfig: join(gitDir, ".graphite_repo_config"),
    head: join(gitDir, "HEAD"),
  };
}

export interface RepoConfig {
  trunk: string;
  trunks: string[];
  lastFetchedPrInfoMs: number | null;
}

/** Read `.graphite_repo_config` for the trunk name(s). */
export function readRepoConfig(paths: RepoPaths): RepoConfig {
  if (!existsSync(paths.repoConfig)) {
    throw new NotAGraphiteRepoError(
      "This repo is not initialized with Graphite (run `gt init`)."
    );
  }
  const raw = JSON.parse(readFileSync(paths.repoConfig, "utf8"));
  const trunks: string[] = Array.isArray(raw.trunks)
    ? raw.trunks.map((t: { name: string }) => t.name)
    : [];
  const trunk: string = raw.trunk ?? trunks[0];
  if (!trunk) {
    throw new NotAGraphiteRepoError("No trunk configured for this repo.");
  }
  return {
    trunk,
    trunks: trunks.length ? trunks : [trunk],
    lastFetchedPrInfoMs:
      typeof raw.lastFetchedPRInfoMs === "number"
        ? raw.lastFetchedPRInfoMs
        : null,
  };
}
