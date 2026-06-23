import { watch, type FSWatcher } from "node:fs";
import type { RepoPaths } from "./repo.js";

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
  let timer: NodeJS.Timeout | null = null;

  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 150);
  };

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
    if (timer) clearTimeout(timer);
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
  };
}
