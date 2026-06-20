import { execa } from "execa";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Common options for every gt invocation: pin the repo, run non-interactively. */
function gtArgs(repoRoot: string, args: string[]): string[] {
  return [...args, "--cwd", repoRoot, "--no-interactive"];
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
    const e = err as { all?: string; shortMessage?: string; message?: string };
    const detail = (e.all || e.shortMessage || e.message || "failed")
      .split("\n")
      .filter(Boolean)
      .slice(-1)[0];
    return { ok: false, message: detail ?? "command failed" };
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
    const e = err as { shortMessage?: string; message?: string };
    return { ok: false, message: e.shortMessage || e.message || "could not open url" };
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
    const e = err as { shortMessage?: string; message?: string };
    return { ok: false, message: e.shortMessage || e.message || "could not open PR" };
  }
}
