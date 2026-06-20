import { existsSync, readFileSync } from "node:fs";
import type { PrInfo, PrState, ReviewDecision } from "../types.js";
import type { RepoPaths } from "./repo.js";

interface RawPr {
  prNumber: number;
  title: string;
  state: string;
  reviewDecision: string | null;
  isDraft: boolean;
  url: string;
  headRefName: string;
  baseRefName: string;
  authorGithubHandle?: string;
}

function normalizeState(s: string): PrState {
  const up = s?.toUpperCase();
  if (up === "MERGED" || up === "CLOSED") return up;
  return "OPEN";
}

function normalizeReview(s: string | null): ReviewDecision {
  if (!s) return null;
  const up = s.toUpperCase();
  if (up === "APPROVED" || up === "CHANGES_REQUESTED" || up === "REVIEW_REQUIRED") {
    return up;
  }
  return null;
}

/**
 * Read `.graphite_pr_info` and key it by headRefName (the branch name).
 * Returns an empty map if the file is missing (PRs simply not fetched yet).
 */
export function readPrInfo(paths: RepoPaths): Map<string, PrInfo> {
  const map = new Map<string, PrInfo>();
  if (!existsSync(paths.prInfo)) return map;

  let raw: { prInfos?: RawPr[] };
  try {
    raw = JSON.parse(readFileSync(paths.prInfo, "utf8"));
  } catch {
    return map;
  }
  for (const p of raw.prInfos ?? []) {
    if (!p.headRefName) continue;
    map.set(p.headRefName, {
      prNumber: p.prNumber,
      title: p.title,
      state: normalizeState(p.state),
      reviewDecision: normalizeReview(p.reviewDecision),
      isDraft: Boolean(p.isDraft),
      url: p.url,
      headRefName: p.headRefName,
      baseRefName: p.baseRefName,
      authorGithubHandle: p.authorGithubHandle,
    });
  }
  return map;
}
