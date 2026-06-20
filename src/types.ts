// Shared data model for graphite-tui.
// All Graphite-format coupling lives in src/data/*; these are the clean shapes
// the rest of the app consumes.

/** Raw row from the SQLite `branch_metadata` table. */
export interface BranchMeta {
  branchName: string;
  parentBranchName: string | null;
  /** Parent revision this branch was last rebased onto. */
  parentBranchRevision: string | null;
  /** Parent's head revision as gt last observed it. */
  parentHeadRevision: string | null;
  children: string[];
  /** This branch's current tip revision. */
  branchRevision: string | null;
  /** e.g. "frozen" or null. */
  state: string | null;
  /** "TRUNK" | "VALID" | "BAD_PARENT_NAME" | ... */
  validationResult: string | null;
}

/** PR state as reported by GitHub via Graphite. */
export type PrState = "OPEN" | "MERGED" | "CLOSED";
export type ReviewDecision =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REVIEW_REQUIRED"
  | null;

/** Entry from `.graphite_pr_info`, keyed by headRefName. */
export interface PrInfo {
  prNumber: number;
  title: string;
  state: PrState;
  reviewDecision: ReviewDecision;
  isDraft: boolean;
  url: string;
  headRefName: string;
  baseRefName: string;
  authorGithubHandle?: string;
}

/** A branch combined with its PR info and display metadata. */
export interface Branch {
  name: string;
  parent: string | null;
  children: string[];
  isTrunk: boolean;
  /** True when validationResult is not VALID/TRUNK (needs restack). */
  needsRestack: boolean;
  state: string | null;
  /** Relative age string, abbreviated e.g. "2d", "5h". */
  age: string;
  /** PR info if this branch has a submitted PR. */
  pr: PrInfo | null;
  /** PR title when available, otherwise the branch name. */
  displayTitle: string;
}

/** The full loaded state for a repo. */
export interface RepoData {
  repoRoot: string;
  trunk: string;
  /** All branches keyed by name. */
  branches: Map<string, Branch>;
  currentBranch: string | null;
  /** Epoch ms of the last PR-info fetch, if known. */
  lastFetchedPrInfoMs: number | null;
}

/** One row in the flattened, renderable graph. */
export interface RenderRow {
  branch: Branch;
  /** Depth from trunk (trunk = 0). */
  depth: number;
  /** Horizontal graph column for this branch's node. */
  column: number;
  /**
   * Columns (index) that have a vertical line passing vertically through
   * this row (entering from above, exiting below) but no node here.
   */
  through: boolean[];
  /**
   * Child columns to the right of this node that merge into it on this row
   * (drawn as `─┘` corners). Only populated on a parent's row.
   */
  mergeFrom: number[];
  /** True if this branch is the current checked-out branch. */
  isCurrent: boolean;
}
