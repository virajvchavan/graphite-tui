import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBranchMetadata } from "./metadata.js";
import { NotAGraphiteRepoError, type RepoPaths } from "./repo.js";

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gt-meta-"));
  dbPath = join(dir, ".graphite_metadata.db");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Row {
  branch_name: string;
  parent_branch_name?: string | null;
  parent_branch_revision?: string | null;
  parent_head_revision?: string | null;
  children?: string | null;
  branch_revision?: string | null;
  state?: string | null;
  validation_result?: string | null;
}

/** Build a metadata db with the `branch_metadata` table gt maintains. */
function seed(rows: Row[]) {
  const db = new Database(dbPath);
  db.exec(
    `CREATE TABLE branch_metadata (
       branch_name TEXT, parent_branch_name TEXT, parent_branch_revision TEXT,
       parent_head_revision TEXT, children TEXT, branch_revision TEXT,
       state TEXT, validation_result TEXT
     )`
  );
  const stmt = db.prepare(
    `INSERT INTO branch_metadata VALUES
       (@branch_name, @parent_branch_name, @parent_branch_revision,
        @parent_head_revision, @children, @branch_revision, @state,
        @validation_result)`
  );
  for (const r of rows) {
    stmt.run({
      parent_branch_name: null,
      parent_branch_revision: null,
      parent_head_revision: null,
      children: null,
      branch_revision: null,
      state: null,
      validation_result: null,
      ...r,
    });
  }
  db.close();
}

function paths(): RepoPaths {
  return {
    repoRoot: dir,
    gitDir: dir,
    metadataDb: dbPath,
    prInfo: join(dir, ".graphite_pr_info"),
    repoConfig: join(dir, ".graphite_repo_config"),
    head: join(dir, "HEAD"),
    index: join(dir, "index"),
  };
}

describe("readBranchMetadata", () => {
  it("throws NotAGraphiteRepoError when the db file is missing", () => {
    expect(() => readBranchMetadata(paths())).toThrow(NotAGraphiteRepoError);
  });

  it("maps each row, keyed by branch name", () => {
    seed([
      {
        branch_name: "feature",
        parent_branch_name: "develop",
        parent_branch_revision: "aaa",
        parent_head_revision: "bbb",
        children: '["child-1","child-2"]',
        branch_revision: "ccc",
        state: "frozen",
        validation_result: "VALID",
      },
    ]);
    const map = readBranchMetadata(paths());
    expect(map.get("feature")).toEqual({
      branchName: "feature",
      parentBranchName: "develop",
      parentBranchRevision: "aaa",
      parentHeadRevision: "bbb",
      children: ["child-1", "child-2"],
      branchRevision: "ccc",
      state: "frozen",
      validationResult: "VALID",
    });
  });

  it("coerces empty-string columns to null", () => {
    seed([{ branch_name: "b", parent_branch_name: "", branch_revision: "" }]);
    const m = map(paths())("b");
    expect(m.parentBranchName).toBeNull();
    expect(m.branchRevision).toBeNull();
  });

  it("parses children: null and malformed JSON both yield an empty array", () => {
    seed([
      { branch_name: "n", children: null },
      { branch_name: "bad", children: "{not json" },
      { branch_name: "wrong", children: '"a string"' },
    ]);
    const get = map(paths());
    expect(get("n").children).toEqual([]);
    expect(get("bad").children).toEqual([]);
    expect(get("wrong").children).toEqual([]);
  });

  it("filters non-string entries out of the children array", () => {
    seed([{ branch_name: "mixed", children: '["ok", 5, null, "also"]' }]);
    expect(map(paths())("mixed").children).toEqual(["ok", "also"]);
  });
});

/** Curried lookup helper: read the metadata then fetch a branch (asserting it exists). */
function map(p: RepoPaths) {
  const m = readBranchMetadata(p);
  return (name: string) => {
    const v = m.get(name);
    if (!v) throw new Error(`missing branch ${name}`);
    return v;
  };
}
