import { execa, type Options } from "execa";
import * as commandLog from "./commandLog.js";
import type { WorkingFile } from "../data/status.js";

export interface ActionResult {
  ok: boolean;
  /** Concise one-line summary, shown in the status bar. */
  message: string;
  /** Full combined stdout+stderr of a failed command, for the details view. */
  detail?: string;
}

/** Common options for every gt invocation: pin the repo, run non-interactively. */
function gtArgs(repoRoot: string, args: string[]): string[] {
  return [...args, "--cwd", repoRoot, "--no-interactive"];
}

/**
 * Pick the most useful single line from a command's full output for the status
 * bar. gt often buries the actionable line (a CONFLICT, error, or "aborting"
 * notice) in the middle and ends with a generic line, so prefer those; fall
 * back to the last non-empty line.
 */
export function summarizeError(full: string): string {
  const lines = full
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "command failed";
  const actionable = lines.find((l) =>
    /conflict|\berror\b|\bfatal\b|abort|cannot|failed|not /i.test(l)
  );
  return actionable ?? lines[lines.length - 1];
}

/** Pull the full combined output (or best available text) off an execa error. */
function errorOutput(err: unknown): string {
  const e = err as {
    all?: string;
    stderr?: string;
    stdout?: string;
    shortMessage?: string;
    message?: string;
  };
  return (
    e.all ||
    [e.stdout, e.stderr].filter(Boolean).join("\n") ||
    e.shortMessage ||
    e.message ||
    "command failed"
  ).trim();
}

/** Map a thrown execa error to a failed ActionResult (summary + full detail). */
function failure(err: unknown): ActionResult {
  const full = errorOutput(err);
  return { ok: false, message: summarizeError(full), detail: full || undefined };
}

/**
 * Run a command, recording it in the session command log: a `running` entry is
 * opened, combined stdout+stderr is streamed into it live, and it's marked
 * ok/error on completion. Re-throws on failure so callers map it to an
 * ActionResult exactly as before.
 */
async function execLogged(
  display: string,
  file: string,
  args: string[],
  opts: Options
) {
  const id = commandLog.start(display);
  try {
    const sub = execa(file, args, { ...opts, all: true });
    sub.all?.on("data", (c: Buffer | string) =>
      commandLog.append(id, c.toString())
    );
    const res = await sub;
    commandLog.finish(id, "ok");
    return res;
  } catch (err: unknown) {
    // The stream usually captured everything already; only fall back to the
    // error's buffered output if nothing was streamed, to avoid duplication.
    if (!commandLog.hasOutput(id)) commandLog.append(id, errorOutput(err));
    commandLog.finish(id, "error");
    throw err;
  }
}

async function runGt(
  repoRoot: string,
  args: string[],
  successMsg: string
): Promise<ActionResult> {
  try {
    await execLogged(`gt ${args.join(" ")}`, "gt", gtArgs(repoRoot, args), {
      all: true,
    });
    return { ok: true, message: successMsg };
  } catch (err: unknown) {
    return failure(err);
  }
}

/** Run a `git` subcommand non-interactively, logged like `runGt`. */
async function runGit(
  repoRoot: string,
  args: string[],
  successMsg: string
): Promise<ActionResult> {
  try {
    await execLogged(`git ${args.join(" ")}`, "git", args, { cwd: repoRoot });
    return { ok: true, message: successMsg };
  } catch (err: unknown) {
    return failure(err);
  }
}

export const checkout = (repoRoot: string, branch: string) =>
  runGt(repoRoot, ["checkout", branch], `Checked out ${branch}`);

export const sync = (repoRoot: string) =>
  runGt(repoRoot, ["sync", "--force"], "Synced with trunk");

export const restack = (repoRoot: string) =>
  runGt(repoRoot, ["restack"], "Restacked");

export const submitStack = (repoRoot: string) =>
  runGt(repoRoot, ["submit", "--stack"], "Submitted stack");

export const deleteBranch = (repoRoot: string, branch: string) =>
  runGt(repoRoot, ["delete", branch, "--force"], `Deleted ${branch}`);

/**
 * Pull a remote branch — and its ancestors, so the whole stack lands locally —
 * down with `gt get`, tracking it in Graphite.
 */
export const getBranch = (repoRoot: string, branch: string) =>
  runGt(repoRoot, ["get", branch], `Got ${branch}`);

/** Open an arbitrary URL in the default browser, cross-platform. */
export async function openUrl(url: string): Promise<ActionResult> {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    await execLogged(`${cmd} ${url}`, cmd, args, { timeout: 8000 });
    return { ok: true, message: "Opened in browser" };
  } catch (err: unknown) {
    return failure(err);
  }
}

/** Open the PR (or stack) page in the browser. Fire-and-forget. */
export async function openPr(
  repoRoot: string,
  branch: string,
  stack = false
): Promise<ActionResult> {
  try {
    const args = stack ? ["pr", branch, "--stack"] : ["pr", branch];
    // gt pr opens a browser; keep it detached and don't wait on interactivity.
    await execLogged(
      `gt ${args.join(" ")}`,
      "gt",
      [...args, "--cwd", repoRoot],
      { timeout: 8000 }
    );
    return { ok: true, message: stack ? "Opened stack" : "Opened PR" };
  } catch (err: unknown) {
    return failure(err);
  }
}

// --- working-tree actions ---

const base = (p: string) => p.split("/").pop() || p;

export const stageFile = (repoRoot: string, path: string) =>
  runGit(repoRoot, ["add", "--", path], `Staged ${base(path)}`);

export const stageAll = (repoRoot: string) =>
  runGit(repoRoot, ["add", "-A"], "Staged all changes");

export const unstageFile = (repoRoot: string, path: string) =>
  runGit(repoRoot, ["restore", "--staged", "--", path], `Unstaged ${base(path)}`);

export const unstageAll = (repoRoot: string) =>
  runGit(repoRoot, ["restore", "--staged", "--", "."], "Unstaged all changes");

/**
 * Discard a single file's changes. Untracked files are removed (`git clean`);
 * tracked files are reverted to HEAD in both the index and the worktree.
 */
export const discardFile = (repoRoot: string, file: WorkingFile) =>
  file.untracked
    ? runGit(repoRoot, ["clean", "-f", "--", file.path], `Removed ${base(file.path)}`)
    : runGit(
        repoRoot,
        ["restore", "--staged", "--worktree", "--", file.path],
        `Discarded ${base(file.path)}`
      );

/** Discard every change: revert tracked files and remove untracked ones. */
export async function discardAll(repoRoot: string): Promise<ActionResult> {
  const restore = await runGit(
    repoRoot,
    ["restore", "--staged", "--worktree", "--", "."],
    "Discarded tracked changes"
  );
  if (!restore.ok) return restore;
  const clean = await runGit(repoRoot, ["clean", "-fd"], "Discarded all changes");
  return clean;
}

/** Amend the current branch's commit with the staged changes, then restack. */
export const gtModify = (repoRoot: string) =>
  runGt(repoRoot, ["modify"], "Modified current branch");

/** Add the staged changes as a new commit on the current branch, then restack. */
export const gtModifyCommit = (repoRoot: string, message: string) =>
  runGt(repoRoot, ["modify", "--commit", "-m", message], "Added commit");

/**
 * Create a new branch stacked on the current one, committing the staged changes
 * with `message`. gt derives the branch name from the message.
 */
export const createBranch = (repoRoot: string, message: string) =>
  runGt(repoRoot, ["create", "-m", message], "Created branch");
