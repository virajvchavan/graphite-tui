import { execa, type Options } from "execa";
import * as commandLog from "./commandLog.js";

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
