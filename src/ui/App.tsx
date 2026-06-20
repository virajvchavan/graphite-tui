import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import fuzzysort from "fuzzysort";
import clipboard from "clipboardy";
import type { ChangedFile, RenderRow, RepoData } from "../types.js";
import type { RepoPaths } from "../data/repo.js";
import { loadRepoData } from "../data/load.js";
import { githubPrUrl } from "../data/git.js";
import { getChangedFiles } from "../data/files.js";
import { buildRenderRows } from "../model/tree.js";
import { watchRepo } from "../data/watch.js";
import * as gt from "../actions/gt.js";
import { centeredOffset } from "./scroll.js";
import { Header } from "./Header.js";
import { StackGraph } from "./StackGraph.js";
import { FilesPanel } from "./FilesPanel.js";
import { StatusBar } from "./StatusBar.js";
import { HelpOverlay } from "./HelpOverlay.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

type Mode = "normal" | "filter" | "help" | "confirm-delete" | "copy";

interface Props {
  initial: RepoData;
  paths: RepoPaths;
}

interface Msg {
  text: string;
  ok: boolean;
}

const NORMAL_HINT =
  "↵ checkout · o Graphite · g GitHub · s sync · r restack · S submit · d delete · Tab files · / filter · y copy · ? help · q quit";

export function App({ initial, paths }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [data, setData] = useState<RepoData>(initial);
  const [mode, setMode] = useState<Mode>("normal");
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Msg | null>(null);
  const [query, setQuery] = useState("");

  // Changed-files panel state. Files are derived from a per-branch cache
  // (keyed by name@revision) that is warmed in the background, so navigating
  // to an already-loaded branch is an instant single render (no loading flash
  // and no flicker). `cacheTick` forces a re-render when the cache fills.
  const [focus, setFocus] = useState<"branches" | "files">("branches");
  const [fileCursor, setFileCursor] = useState(0);
  const [, setCacheTick] = useState(0);
  const filesCache = useRef<Map<string, ChangedFile[]>>(new Map());

  const allRows = useMemo(() => buildRenderRows(data), [data]);

  // Apply fuzzy filter. Filtered view is a flat single-column list.
  const rows: RenderRow[] = useMemo(() => {
    if (!query.trim()) return allRows;
    const results = fuzzysort.go(query, allRows, {
      keys: [(r) => r.branch.displayTitle, (r) => r.branch.name],
      threshold: -10000,
    });
    return results.map((res) => ({
      ...res.obj,
      column: 0,
      through: [],
      mergeFrom: [],
    }));
  }, [allRows, query]);

  const columnCount = useMemo(
    () => (rows.length ? Math.max(...rows.map((r) => r.column)) + 1 : 1),
    [rows]
  );

  // Keep selection in range, and snap to current branch on first load.
  useEffect(() => {
    setSelected((s) => Math.min(Math.max(0, s), Math.max(0, rows.length - 1)));
  }, [rows.length]);

  useEffect(() => {
    const idx = allRows.findIndex((r) => r.isCurrent);
    if (idx >= 0) setSelected(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(() => {
    try {
      const { data: fresh } = loadRepoData(data.repoRoot);
      filesCache.current.clear();
      setData(fresh);
    } catch {
      /* transient (gt mid-write); next watch tick will retry */
    }
  }, [data.repoRoot]);

  // Live auto-refresh from gt activity in other terminals.
  useEffect(() => watchRepo(paths, reload), [paths, reload]);

  const selectedRow: RenderRow | undefined = rows[selected];
  const selBranch = selectedRow?.branch;
  const noParent = !selBranch || selBranch.isTrunk || !selBranch.parent;
  const fileKey = selBranch ? `${selBranch.name}@${selBranch.revision}` : "";

  // Files for the selected branch, derived from the cache. `undefined` means
  // not loaded yet → show a (rare, brief) loading state.
  const cachedFiles = fileKey ? filesCache.current.get(fileKey) : undefined;
  const files: ChangedFile[] = noParent ? [] : (cachedFiles ?? []);
  const filesLoading = !noParent && !!selBranch && cachedFiles === undefined;

  // Reset the file scroll position when the selected branch changes.
  useEffect(() => {
    setFileCursor(0);
  }, [fileKey]);

  // Fetch the selected branch's files immediately if not yet cached, so it
  // appears as fast as possible.
  useEffect(() => {
    if (!selBranch || noParent || filesCache.current.has(fileKey)) return;
    let cancelled = false;
    (async () => {
      const result = await getChangedFiles(
        data.repoRoot,
        selBranch.parent,
        selBranch.name
      );
      if (cancelled) return;
      filesCache.current.set(fileKey, result);
      setCacheTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  // Warm the cache for every branch in the background so subsequent
  // navigation is instant. Runs once per data load (cleared on reload).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const b of data.branches.values()) {
        if (cancelled) return;
        if (b.isTrunk || !b.parent) continue;
        const key = `${b.name}@${b.revision}`;
        if (filesCache.current.has(key)) continue;
        const result = await getChangedFiles(data.repoRoot, b.parent, b.name);
        if (cancelled) return;
        filesCache.current.set(key, result);
        setCacheTick((t) => t + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const runAction = useCallback(
    async (label: string, fn: () => Promise<gt.ActionResult>) => {
      if (busy) return;
      setBusy(label);
      setMessage(null);
      const res = await fn();
      setBusy(null);
      setMessage({ text: res.message, ok: res.ok });
      reload();
    },
    [busy, reload]
  );

  // --- key handling ---
  useInput((input, key) => {
    if (mode === "help") {
      if (input === "?" || key.escape) setMode("normal");
      return;
    }
    if (mode === "confirm-delete") {
      if (input === "y" && selectedRow) {
        const name = selectedRow.branch.name;
        setMode("normal");
        runAction(`deleting ${name}`, () => gt.deleteBranch(data.repoRoot, name));
      } else if (input === "n" || key.escape) {
        setMode("normal");
      }
      return;
    }
    if (mode === "copy") {
      if (input === "u" && selectedRow?.branch.pr) {
        clipboard.writeSync(selectedRow.branch.pr.url);
        setMessage({ text: "Copied PR url", ok: true });
      } else if (input === "b" && selectedRow) {
        clipboard.writeSync(selectedRow.branch.name);
        setMessage({ text: "Copied branch name", ok: true });
      }
      setMode("normal");
      return;
    }
    if (mode === "filter") {
      if (key.escape) {
        setQuery("");
        setMode("normal");
        return;
      }
      if (key.return) {
        setMode("normal");
        return;
      }
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1));
        return;
      }
      if (key.upArrow) {
        setSelected((s) => Math.max(0, s - 1));
        return;
      }
      if (key.downArrow) {
        setSelected((s) => Math.min(rows.length - 1, s + 1));
        return;
      }
      if (input && !key.ctrl && !key.meta) setQuery((q) => q + input);
      return;
    }

    // files-panel focus: scroll the file list
    if (focus === "files") {
      if (key.tab || key.escape) {
        setFocus("branches");
      } else if (input === "q" || (key.ctrl && input === "c")) {
        exit();
      } else if (key.upArrow || input === "k") {
        setFileCursor((c) => Math.max(0, c - 1));
      } else if (key.downArrow || input === "j") {
        setFileCursor((c) => Math.min(files.length - 1, c + 1));
      }
      return;
    }

    // normal mode
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    if (key.tab) {
      if (files.length) setFocus("files");
    } else if (key.upArrow || input === "k") {
      setSelected((s) => Math.max(0, s - 1));
    } else if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(rows.length - 1, s + 1));
    } else if (key.return || input === "c") {
      if (selectedRow && !selectedRow.branch.isTrunk) {
        const name = selectedRow.branch.name;
        runAction(`checking out ${name}`, () => gt.checkout(data.repoRoot, name));
      } else if (selectedRow) {
        runAction(`checking out ${selectedRow.branch.name}`, () =>
          gt.checkout(data.repoRoot, selectedRow.branch.name)
        );
      }
    } else if (input === "o") {
      if (selectedRow?.branch.pr)
        runAction("opening PR", () => gt.openPr(data.repoRoot, selectedRow.branch.name));
      else setMessage({ text: "No PR for this branch", ok: false });
    } else if (input === "O") {
      if (selectedRow)
        runAction("opening stack", () =>
          gt.openPr(data.repoRoot, selectedRow.branch.name, true)
        );
    } else if (input === "g") {
      if (selectedRow?.branch.pr) {
        const url = githubPrUrl(data.repoRoot, selectedRow.branch.pr.prNumber);
        if (url) runAction("opening GitHub PR", () => gt.openUrl(url));
        else setMessage({ text: "No GitHub remote found", ok: false });
      } else setMessage({ text: "No PR for this branch", ok: false });
    } else if (input === "s") {
      runAction("syncing", () => gt.sync(data.repoRoot));
    } else if (input === "r") {
      runAction("restacking", () => gt.restack(data.repoRoot));
    } else if (input === "S") {
      runAction("submitting stack", () => gt.submitStack(data.repoRoot));
    } else if (input === "d") {
      if (selectedRow && !selectedRow.branch.isTrunk) setMode("confirm-delete");
      else setMessage({ text: "Cannot delete trunk", ok: false });
    } else if (input === "y") {
      if (selectedRow) setMode("copy");
    } else if (input === "/") {
      setMode("filter");
    } else if (input === "R") {
      reload();
      setMessage({ text: "Refreshed", ok: true });
    } else if (input === "?") {
      setMode("help");
    }
  });

  if (mode === "help") return <HelpOverlay />;

  const totalWidth = stdout?.columns ?? 80;
  // Reserve space for arrow(2) + gutter(2*cols) + metadata(~28).
  const titleWidth = Math.max(
    20,
    totalWidth - 2 - columnCount * 2 - 30
  );

  // Constrain the whole UI to the terminal height so neither a tall file list
  // nor a tall branch list can push a frame past the screen (which would
  // strand a stale frame at the top). Both lists window+scroll to fit; the
  // header is pinned at top and the status bar at the bottom.
  //
  // We target one line LESS than the terminal height: a frame that fills the
  // full height makes the terminal scroll on the trailing newline, which forces
  // Ink to clear-and-redraw the whole screen every frame (visible flicker).
  // Leaving a line of headroom keeps Ink's incremental updates flicker-free.
  const frameRows = Math.max(8, (stdout?.rows ?? 24) - 1);
  const headerLines = 2;
  const dialogLines = mode === "normal" ? 0 : mode === "confirm-delete" ? 3 : 2;
  const statusLines = (message ? 1 : 0) + 4;
  const panelChrome = 1 /*marginTop*/ + 1 /*panel header*/ + 2 /*more rows*/;
  // Space shared by the branch list and the files panel.
  const listsBudget = Math.max(
    4,
    frameRows - headerLines - dialogLines - statusLines
  );
  // Reserve room for the files panel so the branch list can't crowd it out.
  const filesReserve = !selBranch ? 0 : noParent ? 2 : 6;
  const branchBudget = Math.max(3, listsBudget - filesReserve);
  const branchScroll = rows.length > branchBudget;
  // When scrolling, two rows go to the ↑/↓ indicators.
  const branchVisible = branchScroll
    ? Math.max(1, branchBudget - 2)
    : rows.length;
  const branchOffset = branchScroll
    ? centeredOffset(selected, branchVisible, rows.length)
    : 0;
  const branchRendered = branchVisible + (branchScroll ? 2 : 0);

  // Files panel gets whatever vertical space the branch list leaves.
  const visible = Math.max(
    3,
    frameRows - headerLines - branchRendered - dialogLines - statusLines - panelChrome
  );
  const maxOffset = Math.max(0, files.length - visible);
  const scrollOffset = Math.min(
    maxOffset,
    fileCursor < visible ? 0 : fileCursor - visible + 1
  );

  return (
    <Box flexDirection="column" paddingX={1} height={frameRows} overflow="hidden">
      <Box flexDirection="column" flexShrink={0}>
        <Header repoRoot={data.repoRoot} trunk={data.trunk} busy={busy} />

        <StackGraph
          rows={rows}
          columnCount={columnCount}
          selectedIndex={selected}
          titleWidth={titleWidth}
          scrollOffset={branchOffset}
          visible={branchVisible}
        />

        {mode === "filter" && (
          <Box marginTop={1}>
            <Text color="yellow">/</Text>
            <Text>{query}</Text>
            <Text color="gray">▏</Text>
          </Box>
        )}

        {mode === "confirm-delete" && selectedRow && (
          <Box marginTop={1}>
            <ConfirmDialog message={`Delete branch ${selectedRow.branch.name}?`} />
          </Box>
        )}

        {mode === "copy" && (
          <Box marginTop={1}>
            <Text color="gray">
              copy: <Text color="yellow">u</Text> PR url ·{" "}
              <Text color="yellow">b</Text> branch name · esc cancel
            </Text>
          </Box>
        )}
      </Box>

      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        {selBranch && (
          <FilesPanel
            branchName={selBranch.name}
            files={files}
            loading={filesLoading}
            noParent={noParent}
            focused={focus === "files"}
            cursor={fileCursor}
            scrollOffset={scrollOffset}
            visible={visible}
            width={totalWidth - 2}
          />
        )}
      </Box>

      <Box flexShrink={0}>
        <StatusBar
          currentBranch={data.currentBranch}
          message={message}
          hint={
            mode === "filter"
              ? "esc clear · ↵ keep filter"
              : focus === "files"
                ? "j/k scroll files · Tab/esc back to branches · q quit"
                : NORMAL_HINT
          }
        />
      </Box>
    </Box>
  );
}
