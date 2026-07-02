// Pure helpers extracted from App.tsx so they can be unit-tested without
// rendering the component. These hold no React state — they map inputs
// (selection, panel visibility, repo data) to hint rows, focus targets, and
// cache keys.
import type { Branch, PrInfo, RepoData } from "../types.js";

/** Which panel currently has keyboard focus. */
export type Focus = "branches" | "files" | "worktree" | "logs";

// Keyboard hints as [key, label] pairs so the StatusBar can style the key
// distinctly from its description.
export const NORMAL_HINT: Array<[string, string]> = [
  ["↵", "checkout"],
  ["o", "Graphite"],
  ["g", "GitHub"],
  ["G", "get"],
  ["s", "sync"],
  ["r", "restack"],
  ["S", "submit"],
  ["d", "delete"],
  ["Tab", "files"],
  ["/", "filter"],
  ["y", "copy"],
  ["?", "help"],
];
// Keys that act on a real (non-trunk) branch — opening its PR (o/g), restacking
// or submitting it (r/S), or deleting it (d). Trunk has no PR and can't be
// restacked, submitted, or deleted, so these are dropped from the hint bar when
// the selected row is trunk.
const TRUNK_OMIT_KEYS = new Set(["o", "g", "r", "S", "d"]);

export function normalHint(
  selectedIsTrunk: boolean,
  selectedIsDetached = false
): Array<[string, string]> {
  if (selectedIsTrunk) {
    return NORMAL_HINT.filter(([key]) => !TRUNK_OMIT_KEYS.has(key));
  }
  // A detached branch (not in any stack) isn't submittable/restackable yet —
  // its one useful action is `T track`, so lead with that.
  if (selectedIsDetached) {
    return [["T", "track"], ...NORMAL_HINT];
  }
  return NORMAL_HINT;
}

// Working-tree hints. The amend/commit (off trunk) and create-branch (on trunk)
// actions act on staged changes, so they only appear once something is staged.
export function worktreeHint(
  onTrunk: boolean,
  hasStaged: boolean
): Array<[string, string]> {
  const hint: Array<[string, string]> = [
    ["↵", "open"],
    ["a/A", "stage"],
    ["u/U", "unstage"],
    ["x/X", "discard"],
  ];
  if (hasStaged) {
    if (onTrunk) hint.push(["c", "create branch"]);
    else hint.push(["m", "amend"], ["c", "commit"]);
  }
  hint.push(["Tab", "next"], ["?", "help"]);
  return hint;
}

type PanelVisibility = { worktree: boolean; files: boolean; logs: boolean };

// The fixed top-to-bottom order panels appear on screen. Tab cycling wraps
// through this; arrow-key crossing walks it linearly without wrapping.
const FOCUS_ORDER: Focus[] = ["branches", "worktree", "files", "logs"];

const isFocusShown = (f: Focus, shown: PanelVisibility) =>
  f === "branches" ||
  (f === "worktree" && shown.worktree) ||
  (f === "files" && shown.files) ||
  (f === "logs" && shown.logs);

/**
 * Next focusable panel in the cycle branches → worktree → files → logs →
 * branches, skipping any panel that isn't currently shown.
 */
export function nextFocus(current: Focus, shown: PanelVisibility): Focus {
  const start = FOCUS_ORDER.indexOf(current);
  for (let i = 1; i <= FOCUS_ORDER.length; i++) {
    const cand = FOCUS_ORDER[(start + i) % FOCUS_ORDER.length];
    if (isFocusShown(cand, shown)) return cand;
  }
  return "branches";
}

/**
 * The shown panel directly below `current` in the on-screen order, or null if
 * `current` is the last visible panel. Used to cross sections when the down
 * arrow is pressed at the bottom of a list — no wrap-around, unlike Tab.
 */
export function focusBelow(
  current: Focus,
  shown: PanelVisibility
): Focus | null {
  const start = FOCUS_ORDER.indexOf(current);
  for (let i = start + 1; i < FOCUS_ORDER.length; i++) {
    if (isFocusShown(FOCUS_ORDER[i], shown)) return FOCUS_ORDER[i];
  }
  return null;
}

/**
 * The shown panel directly above `current`, or null if `current` is already the
 * topmost visible panel. Used to cross sections when the up arrow is pressed at
 * the top of a list.
 */
export function focusAbove(
  current: Focus,
  shown: PanelVisibility
): Focus | null {
  const start = FOCUS_ORDER.indexOf(current);
  for (let i = start - 1; i >= 0; i--) {
    if (isFocusShown(FOCUS_ORDER[i], shown)) return FOCUS_ORDER[i];
  }
  return null;
}

/**
 * Cache key for a branch's changed-files diff. Includes the parent's tip
 * revision (not just the branch's own) so the three-dot/merge-base diff is
 * refetched when the parent moves even if this branch hasn't been restacked
 * yet. Entries are thus self-invalidating: a new revision yields a new key and
 * is refetched, while superseded keys simply go unused — so the cache never
 * needs to be wholesale-cleared (which caused the visible diff to flicker).
 */
export function changedFilesKey(
  branch: Branch,
  branches: Map<string, Branch>
): string {
  const parentRev = branch.parent
    ? (branches.get(branch.parent)?.revision ?? "")
    : "";
  return `${branch.name}@${branch.revision}~${parentRev}`;
}

/** PR numbers for every branch that has a PR. */
export function prNumbersOf(repo: RepoData): number[] {
  const ns: number[] = [];
  for (const b of repo.branches.values()) if (b.pr) ns.push(b.pr.prNumber);
  return ns;
}

/**
 * GitHub PR-discovery bookkeeping, keyed by branch name: a `PrInfo` value is a
 * PR found on GitHub for a branch gt hadn't cached; `null` records a branch we
 * looked up and found no PR (so it isn't re-queried). Any key present means
 * "already queried".
 */
export type DiscoveredPrs = Map<string, PrInfo | null>;

/**
 * Merge discovered PRs into a freshly loaded RepoData, mutating in place. Only
 * fills branches that lack a PR — gt's cached `.graphite_pr_info` stays
 * authoritative wherever it has an entry; `null` entries (no PR found) are
 * skipped. Mirrors loadRepoData's own `displayTitle` rule so a discovered PR
 * reads identically.
 */
export function applyDiscoveredPrs(repo: RepoData, discovered: DiscoveredPrs): void {
  for (const [name, pr] of discovered) {
    if (!pr) continue;
    const b = repo.branches.get(name);
    if (b && !b.pr) {
      b.pr = pr;
      b.displayTitle = pr.title;
    }
  }
}

/**
 * Non-trunk branches with no PR that haven't been looked up on GitHub yet — the
 * candidates for {@link applyDiscoveredPrs}. Takes the *visible* branches (the
 * rendered rows), not the whole model, so we don't query GitHub for the many
 * stale/unreachable local branches gt keeps in its cache but never shows.
 * `queried` is anything with a membership test (a {@link DiscoveredPrs} map or a
 * Set of names). Kept as a stable, sorted key so a discovery effect only
 * re-fires when the candidate set actually changes.
 */
export function undiscoveredPrKey(
  branches: Branch[],
  queried: { has(name: string): boolean }
): string {
  const names: string[] = [];
  for (const b of branches) {
    if (!b.isTrunk && !b.pr && !queried.has(b.name)) names.push(b.name);
  }
  return names.sort().join("\n");
}
