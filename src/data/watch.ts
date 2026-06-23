import { watch, type FSWatcher } from "node:fs";
import { sep } from "node:path";
import type { RepoPaths } from "./repo.js";

/**
 * A trailing debounce that optionally rate-limits: each call defers `onChange`
 * by `debounceMs`, collapsing bursts; once it fires, it won't fire again for at
 * least `minIntervalMs` (0 = pure debounce). Returns the trigger plus a cancel
 * that clears any pending fire.
 */
function debounced(
  onChange: () => void,
  debounceMs: number,
  minIntervalMs = 0
): { fire: () => void; cancel: () => void } {
  let timer: NodeJS.Timeout | null = null;
  let lastRun = 0;
  return {
    fire: () => {
      if (timer) clearTimeout(timer);
      const delay = Math.max(debounceMs, minIntervalMs - (Date.now() - lastRun));
      timer = setTimeout(() => {
        timer = null;
        lastRun = Date.now();
        onChange();
      }, delay);
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * Watch Graphite's cache files + HEAD and invoke `onChange` (debounced) when
 * any of them change, so the TUI reflects `gt` activity from other terminals.
 */
export function watchRepo(paths: RepoPaths, onChange: () => void): () => void {
  // Watch the git dir too so a rebase starting/stopping (rebase-merge dir
  // appearing/disappearing) refreshes the conflict indicator live.
  const targets = [
    paths.metadataDb,
    paths.prInfo,
    paths.repoConfig,
    paths.head,
    paths.gitDir,
    paths.index,
  ];
  const watchers: FSWatcher[] = [];
  const { fire, cancel } = debounced(onChange, 150);

  for (const t of targets) {
    try {
      const w = watch(t, fire);
      w.on("error", () => {});
      watchers.push(w);
    } catch {
      /* file may not exist yet; ignore */
    }
  }

  return () => {
    cancel();
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
  };
}

/**
 * Watch the working tree and invoke `onChange` when any file changes, so edits
 * made in an external editor surface immediately. Returns a cleanup function.
 *
 * On macOS/Windows this rides a recursive watch (FSEvents on macOS, so the
 * whole subtree — node_modules included — costs a single descriptor). Events
 * under `.git/` are ignored: git metadata is handled by {@link watchRepo}, and
 * git's own churn would otherwise storm us. A debounce (150ms, for single-save
 * responsiveness) plus a rate cap (≥1s between fires) keep `git status` cheap
 * even under a churny background build; `git status` itself respects
 * `.gitignore`. On platforms without recursive watch (Linux throws
 * ERR_FEATURE_UNAVAILABLE_ON_PLATFORM) it transparently falls back to a 60s
 * poll, so callers get one interface regardless of platform.
 */
export function watchWorkingTree(
  repoRoot: string,
  onChange: () => void
): () => void {
  const { fire, cancel } = debounced(onChange, 150, 1000);
  const onEvent = (_event: string, filename: string | Buffer | null) => {
    // Recursive watch reports a repo-relative path; skip git's own dir.
    if (typeof filename === "string") {
      if (filename === ".git" || filename.startsWith(`.git${sep}`)) return;
    }
    fire();
  };

  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(repoRoot, { recursive: true }, onEvent);
    watcher.on("error", () => {});
  } catch {
    /* recursive watch unsupported here; fall back to a poll backstop */
  }
  const pollId = watcher ? null : setInterval(onChange, 60_000);

  return () => {
    cancel();
    if (pollId) clearInterval(pollId);
    try {
      watcher?.close();
    } catch {
      /* ignore */
    }
  };
}
