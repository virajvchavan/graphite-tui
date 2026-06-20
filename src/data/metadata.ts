import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import type { BranchMeta } from "../types.js";
import type { RepoPaths } from "./repo.js";
import { NotAGraphiteRepoError } from "./repo.js";

interface RawRow {
  branch_name: string;
  parent_branch_name: string | null;
  parent_branch_revision: string | null;
  parent_head_revision: string | null;
  children: string | null;
  branch_revision: string | null;
  state: string | null;
  validation_result: string | null;
}

function parseChildren(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Read the `branch_metadata` table from Graphite's SQLite cache.
 * Opens read-only so we never lock the db gt is also writing.
 */
export function readBranchMetadata(paths: RepoPaths): Map<string, BranchMeta> {
  if (!existsSync(paths.metadataDb)) {
    throw new NotAGraphiteRepoError(
      "Graphite metadata db not found. This gt version may store data differently."
    );
  }
  const db = new Database(paths.metadataDb, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `SELECT branch_name, parent_branch_name, parent_branch_revision,
                parent_head_revision, children, branch_revision, state,
                validation_result
         FROM branch_metadata`
      )
      .all() as RawRow[];

    const map = new Map<string, BranchMeta>();
    for (const r of rows) {
      map.set(r.branch_name, {
        branchName: r.branch_name,
        parentBranchName: r.parent_branch_name || null,
        parentBranchRevision: r.parent_branch_revision || null,
        parentHeadRevision: r.parent_head_revision || null,
        children: parseChildren(r.children),
        branchRevision: r.branch_revision || null,
        state: r.state || null,
        validationResult: r.validation_result || null,
      });
    }
    return map;
  } finally {
    db.close();
  }
}
