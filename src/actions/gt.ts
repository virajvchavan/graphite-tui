import { execa } from "execa";

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

async function runGt(
  repoRoot: string,
  args: string[],
  successMsg: string
): Promise<ActionResult> {
  try {
    await execa("gt", gtArgs(repoRoot, args), { all: true });
    return { ok: true, message: successMsg };
  } catch (err: unknown) {
    const full = errorOutput(err);
    return { ok: false, message: summarizeError(full), detail: full || undefined };
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
    await execa(cmd, args, { timeout: 8000 });
    return { ok: true, message: "Opened in browser" };
  } catch (err: unknown) {
    const full = errorOutput(err);
    return { ok: false, message: summarizeError(full), detail: full || undefined };
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
    await execa("gt", [...args, "--cwd", repoRoot], { timeout: 8000 });
    return { ok: true, message: stack ? "Opened stack" : "Opened PR" };
  } catch (err: unknown) {
    const full = errorOutput(err);
    return { ok: false, message: summarizeError(full), detail: full || undefined };
  }
}
