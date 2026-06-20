import { execaSync } from "execa";

/**
 * Web base URL of the `origin` remote (e.g. https://github.com/owner/repo),
 * derived from either SSH (git@host:owner/repo.git) or HTTPS remotes.
 * Returns null if there's no parseable remote.
 */
export function getRemoteWebUrl(repoRoot: string): string | null {
  let url: string;
  try {
    url = execaSync("git", ["remote", "get-url", "origin"], {
      cwd: repoRoot,
    }).stdout.trim();
  } catch {
    return null;
  }
  // git@github.com:owner/repo.git  ->  https://github.com/owner/repo
  const ssh = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  // https://github.com/owner/repo(.git)  or  ssh://git@host/owner/repo.git
  const https = url.match(/^(?:https?|ssh):\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?$/);
  if (https) return `https://${https[1]}/${https[2]}`;
  return null;
}

/** Build the GitHub PR web URL for a PR number, or null if no remote. */
export function githubPrUrl(repoRoot: string, prNumber: number): string | null {
  const base = getRemoteWebUrl(repoRoot);
  return base ? `${base}/pull/${prNumber}` : null;
}

/** owner/repo of the origin remote, derived from its web URL, or null. */
export function getRemoteOwnerRepo(
  repoRoot: string
): { owner: string; name: string } | null {
  const web = getRemoteWebUrl(repoRoot);
  const m = web?.match(/^https:\/\/[^/]+\/([^/]+)\/(.+)$/);
  return m ? { owner: m[1], name: m[2] } : null;
}

/** Current checked-out branch, or null if detached HEAD. */
export function getCurrentBranch(repoRoot: string): string | null {
  try {
    const { stdout } = execaSync("git", ["branch", "--show-current"], {
      cwd: repoRoot,
    });
    const b = stdout.trim();
    return b.length ? b : null;
  } catch {
    return null;
  }
}

/** Currently unmerged (conflicted) file paths in the working tree. */
export function getConflictedFiles(repoRoot: string): string[] {
  try {
    const { stdout } = execaSync(
      "git",
      ["diff", "--name-only", "--diff-filter=U"],
      { cwd: repoRoot }
    );
    return stdout.split("\n").filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

/** Abbreviate git's relative date, e.g. "2 days ago" -> "2d", "3 hours ago" -> "3h". */
export function abbreviateAge(relative: string): string {
  const m = relative.match(/(\d+)\s+(second|minute|hour|day|week|month|year)/);
  if (!m) {
    if (/just now|moment/.test(relative)) return "now";
    return relative;
  }
  const n = m[1];
  const unit = m[2][0]; // s/m/h/d/w/y; month collides with minute -> handle below
  if (m[2] === "month") return `${n}mo`;
  return `${n}${unit}`;
}

/** Ahead/behind state of a local branch relative to its upstream tracking ref. */
export interface BranchTracking {
  /** False when the branch has no upstream configured (never pushed). */
  hasUpstream: boolean;
  /** Local commits not on the upstream (unpushed). */
  ahead: number;
  /** Upstream commits not local (unpulled). */
  behind: number;
  /** Upstream ref is configured but no longer exists on the remote. */
  gone: boolean;
}

/**
 * Parse git's `%(upstream:track)` field, e.g. "[ahead 2]", "[behind 1]",
 * "[ahead 2, behind 1]", "[gone]", or "" (in sync). Returns null for branches
 * with no upstream configured (track empty AND no upstream — see caller).
 */
export function parseUpstreamTrack(
  track: string
): Omit<BranchTracking, "hasUpstream"> {
  if (track.includes("gone")) return { ahead: 0, behind: 0, gone: true };
  const ahead = track.match(/ahead (\d+)/);
  const behind = track.match(/behind (\d+)/);
  return {
    ahead: ahead ? Number(ahead[1]) : 0,
    behind: behind ? Number(behind[1]) : 0,
    gone: false,
  };
}

/**
 * Map branch name -> ahead/behind state vs its upstream tracking branch.
 * Every local branch is included; branches with no upstream configured get
 * `hasUpstream: false` (they've never been pushed).
 */
export function getBranchTracking(repoRoot: string): Map<string, BranchTracking> {
  const tracking = new Map<string, BranchTracking>();
  try {
    const { stdout } = execaSync(
      "git",
      [
        "for-each-ref",
        "--format=%(refname:short)\t%(upstream)\t%(upstream:track)",
        "refs/heads",
      ],
      { cwd: repoRoot }
    );
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const [name, upstream, track = ""] = line.split("\t");
      if (!name) continue;
      // No upstream configured -> never pushed; nothing to compare against.
      if (!upstream) {
        tracking.set(name, { hasUpstream: false, ahead: 0, behind: 0, gone: false });
        continue;
      }
      tracking.set(name, { hasUpstream: true, ...parseUpstreamTrack(track) });
    }
  } catch {
    /* ignore — tracking info is non-essential */
  }
  return tracking;
}

/**
 * Map branch name -> abbreviated relative age of its tip commit.
 * One `for-each-ref` call covers every local branch.
 */
export function getBranchAges(repoRoot: string): Map<string, string> {
  const ages = new Map<string, string>();
  try {
    const { stdout } = execaSync(
      "git",
      [
        "for-each-ref",
        "--format=%(committerdate:relative)\t%(refname:short)",
        "refs/heads",
      ],
      { cwd: repoRoot }
    );
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const [rel, name] = line.split("\t");
      if (name) ages.set(name, abbreviateAge(rel));
    }
  } catch {
    /* ignore — ages are non-essential */
  }
  return ages;
}
