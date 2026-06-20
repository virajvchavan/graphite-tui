import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import fuzzysort from "fuzzysort";
import clipboard from "clipboardy";
import type {
  ChangedFile,
  PrLiveStatus,
  RenderRow,
  RepoData,
} from "../types.js";
import type { RepoPaths } from "../data/repo.js";
import { loadRepoData } from "../data/load.js";
import { githubPrUrl } from "../data/git.js";
import { getChangedFiles } from "../data/files.js";
import { fetchPrStatus } from "../data/comments.js";
import { buildRenderRows } from "../model/tree.js";
import { watchRepo } from "../data/watch.js";
import * as gt from "../actions/gt.js";
import * as commandLog from "../actions/commandLog.js";
import { centeredOffset, keepVisibleOffset } from "./scroll.js";
import { Header } from "./Header.js";
import { StackGraph } from "./StackGraph.js";
import { FilesPanel } from "./FilesPanel.js";
import { CommandLog, flattenLog } from "./CommandLog.js";
import { StatusBar } from "./StatusBar.js";
import { HelpOverlay } from "./HelpOverlay.js";
import { ErrorOverlay } from "./ErrorOverlay.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

type Mode = "normal" | "filter" | "help" | "confirm-delete" | "copy" | "error";

interface Props {
  initial: RepoData;
  paths: RepoPaths;
}

interface Msg {
  text: string;
  ok: boolean;
}

// Keyboard hints as [key, label] pairs so the StatusBar can style the key
// distinctly from its description.
const NORMAL_HINT: Array<[string, string]> = [
  ["↵", "checkout"],
  ["o", "Graphite"],
  ["g", "GitHub"],
  ["s", "sync"],
  ["r", "restack"],
  ["S", "submit"],
  ["d", "delete"],
  ["Tab", "files"],
  ["/", "filter"],
  ["y", "copy"],
  ["?", "help"],
];
const FILTER_HINT: Array<[string, string]> = [
  ["esc", "clear"],
  ["↵", "keep filter"],
];
const FILES_HINT: Array<[string, string]> = [
  ["Tab", "logs"],
  ["esc", "branches"],
];
const LOG_HINT: Array<[string, string]> = [
  ["↵", "collapse"],
  ["↑/↓", "move"],
  ["c", "clear"],
  ["Tab/esc", "back"],
];
// Number of log lines the command-log panel shows ("not too tall").
const LOG_VISIBLE = 6;

/** PR numbers for every branch that has a PR. */
function prNumbersOf(repo: RepoData): number[] {
  const ns: number[] = [];
  for (const b of repo.branches.values()) if (b.pr) ns.push(b.pr.prNumber);
  return ns;
}

export function App({ initial, paths }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [data, setData] = useState<RepoData>(initial);
  const [mode, setMode] = useState<Mode>("normal");
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Msg | null>(null);
  // Full output of the last failed command, viewable via the error overlay.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [errorScroll, setErrorScroll] = useState(0);
  const [query, setQuery] = useState("");

  // Changed-files panel state. Files are derived from a per-branch cache
  // (keyed by name@revision) that is warmed in the background, so navigating
  // to an already-loaded branch is an instant single render (no loading flash
  // and no flicker). `cacheTick` forces a re-render when the cache fills.
  const [focus, setFocus] = useState<"branches" | "files" | "logs">("branches");
  const [fileCursor, setFileCursor] = useState(0);
  const [, setCacheTick] = useState(0);
  const filesCache = useRef<Map<string, ChangedFile[]>>(new Map());

  // Session command log (commands run on the user's behalf). Subscribed as an
  // external store; the panel appears only once there's at least one entry.
  // When unfocused it tails the newest output; when focused, `logCursor` is a
  // line cursor the user moves with j/k, and Enter toggles the collapsed state
  // of the command under it. Commands are collapsed by default (just a spinner
  // while running); a failed command auto-expands so its error is visible.
  // `logOverrides` records per-entry manual choices (true=collapsed) that win
  // over that default.
  const logEntries = useSyncExternalStore(
    commandLog.subscribe,
    commandLog.getSnapshot
  );
  const [logCursor, setLogCursor] = useState(0);
  const [logOverrides, setLogOverrides] = useState<ReadonlyMap<number, boolean>>(
    new Map()
  );
  // Stateful first-visible-line offset. Unlike a derived offset it doesn't snap
  // back: it only moves when the cursor leaves the window, or when expanding a
  // command pins its header to the top.
  const [logScroll, setLogScroll] = useState(0);
  const showLog = logEntries.length > 0;
  // The flattened log lines + effective collapsed set for the current view,
  // mirrored into refs so the key handler can read line count, the entry under
  // the cursor, and its collapsed state without computing them before useInput.
  const logLinesRef = useRef<import("./CommandLog.js").Line[]>([]);
  const collapsedIdsRef = useRef<Set<number>>(new Set());

  // Live per-PR status (comment thread counts + CI state) keyed by PR number,
  // fetched best-effort from GitHub (Graphite doesn't cache it). Empty until the
  // fetch resolves.
  const [prStatus, setPrStatus] = useState<Map<number, PrLiveStatus>>(
    new Map()
  );

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

  const reload = useCallback((): RepoData | null => {
    try {
      const { data: fresh } = loadRepoData(data.repoRoot);
      filesCache.current.clear();
      setData(fresh);
      return fresh;
    } catch {
      /* transient (gt mid-write); next watch tick will retry */
      return null;
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

  // The branch (if any) that an in-progress rebase is currently stuck on with
  // merge conflicts — flagged red in the graph.
  const conflictedBranches = new Set<string>();
  if (data.rebase?.branch) conflictedBranches.add(data.rebase.branch);

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

  // Warm the changed-files cache for every branch in the background so
  // subsequent navigation is instant. Runs once per data load.
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

  // Fetch live per-PR status (comment thread counts + CI state) for every
  // branch that has a PR, in one batched gh call. This data lives only on
  // GitHub (Graphite doesn't cache it), so unlike everything else it isn't
  // covered by the file watcher.
  const refreshPrStatus = useCallback(
    async (repo: RepoData = data) => {
      const prNumbers = prNumbersOf(repo);
      if (!prNumbers.length) return;
      const status = await fetchPrStatus(repo.repoRoot, prNumbers);
      if (status.size > 0) setPrStatus(status);
    },
    [data]
  );

  // Re-fetch when the set of PR numbers changes (initial load, branch gains or
  // loses a PR).
  const prNumberKey = useMemo(
    () => prNumbersOf(data).sort((a, z) => a - z).join(","),
    [data]
  );

  useEffect(() => {
    if (!prNumberKey) return;
    const prNumbers = prNumberKey.split(",").map(Number);
    let cancelled = false;
    (async () => {
      const status = await fetchPrStatus(data.repoRoot, prNumbers);
      if (!cancelled && status.size > 0) setPrStatus(status);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prNumberKey, data.repoRoot]);

  // Enable terminal focus reporting so we learn when this window/tab regains
  // focus. The terminal then emits CSI I on focus-in and CSI O on focus-out,
  // which Ink delivers to useInput as "[I" / "[O" (see key handler below).
  useEffect(() => {
    stdout?.write("\x1b[?1004h");
    return () => {
      stdout?.write("\x1b[?1004l");
    };
  }, [stdout]);
  // Throttle focus-driven refetches so rapid window switching can't hammer gh.
  const lastFocusFetch = useRef(0);

  const runAction = useCallback(
    async (label: string, fn: () => Promise<gt.ActionResult>) => {
      if (busy) return;
      setBusy(label);
      setMessage(null);
      const res = await fn();
      setBusy(null);
      setMessage({ text: res.message, ok: res.ok });
      setErrorDetail(res.ok ? null : (res.detail ?? null));
      const fresh = reload();
      // Also pull fresh comment/CI status — a gt action may have created,
      // updated, or removed PRs, and that data lives only on GitHub.
      if (fresh) refreshPrStatus(fresh);
      return fresh;
    },
    [busy, reload, refreshPrStatus]
  );

  // Set a transient status message that carries no expandable detail (so the
  // "e: error details" affordance only appears for real command failures).
  const notify = useCallback((text: string, ok: boolean) => {
    setMessage({ text, ok });
    setErrorDetail(null);
  }, []);

  // Focus the command-log panel, placing the cursor on the newest line.
  const focusLogs = useCallback(() => {
    const len = logLinesRef.current.length;
    setLogCursor(Math.max(0, len - 1));
    setLogScroll(Math.max(0, len - LOG_VISIBLE));
    setFocus("logs");
  }, []);

  // --- key handling ---
  useInput((input, key) => {
    // Terminal focus events (enabled via focus reporting above): "[I" on
    // focus-in, "[O" on focus-out. Regaining focus is a good moment to pull
    // fresh comment counts, since GitHub state may have changed while away.
    if (input === "[I") {
      const now = Date.now();
      if (now - lastFocusFetch.current > 3000) {
        lastFocusFetch.current = now;
        refreshPrStatus();
      }
      return;
    }
    if (input === "[O") return;

    if (mode === "help") {
      if (input === "?" || key.escape) setMode("normal");
      return;
    }
    if (mode === "error") {
      if (key.escape || input === "e" || input === "q") {
        setMode("normal");
      } else if (key.upArrow || input === "k") {
        setErrorScroll((s) => Math.max(0, s - 1));
      } else if (key.downArrow || input === "j") {
        const lineCount = errorDetail ? errorDetail.split("\n").length : 0;
        const vis = Math.max(3, (stdout?.rows ?? 24) - 7);
        setErrorScroll((s) => Math.min(Math.max(0, lineCount - vis), s + 1));
      }
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
        notify("Copied PR url", true);
      } else if (input === "b" && selectedRow) {
        clipboard.writeSync(selectedRow.branch.name);
        notify("Copied branch name", true);
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
      if (key.escape) {
        setFocus("branches");
      } else if (key.tab) {
        if (showLog) focusLogs();
        else setFocus("branches");
      } else if (input === "q" || (key.ctrl && input === "c")) {
        exit();
      } else if (key.upArrow || input === "k") {
        setFileCursor((c) => Math.max(0, c - 1));
      } else if (key.downArrow || input === "j") {
        setFileCursor((c) => Math.min(files.length - 1, c + 1));
      }
      return;
    }

    // command-log focus: move the line cursor; Enter collapses/expands the
    // command under it.
    if (focus === "logs") {
      if (key.tab || key.escape) {
        setFocus("branches");
      } else if (input === "q" || (key.ctrl && input === "c")) {
        exit();
      } else if (input === "c") {
        commandLog.clear();
        setLogOverrides(new Map());
        setLogCursor(0);
        setLogScroll(0);
        setFocus("branches");
        notify("Cleared command log", true);
      } else if (key.return) {
        // Toggle the command the cursor line belongs to (header or output),
        // then land the cursor on that command's header.
        const lines = logLinesRef.current;
        const line = lines[logCursor];
        if (line) {
          const id = line.entryId;
          const headerIdx = lines.findIndex(
            (l) => l.entryId === id && l.kind !== "output"
          );
          const nowCollapsed = !collapsedIdsRef.current.has(id);
          setLogOverrides((prev) => new Map(prev).set(id, nowCollapsed));
          if (headerIdx >= 0) {
            setLogCursor(headerIdx);
            // Expanding: pin the header to the top so its output shows below.
            // Collapsing: just keep the header from scrolling above the window.
            if (!nowCollapsed) setLogScroll(headerIdx);
            else setLogScroll((s) => Math.min(s, headerIdx));
          }
        }
      } else if (key.upArrow || input === "k") {
        setLogCursor((c) => {
          const next = Math.max(0, c - 1);
          // Scroll up only if the cursor moved above the window's top.
          setLogScroll((s) => Math.min(s, next));
          return next;
        });
      } else if (key.downArrow || input === "j") {
        setLogCursor((c) => {
          const next = Math.min(logLinesRef.current.length - 1, c + 1);
          // Scroll down only if the cursor moved below the window's bottom.
          setLogScroll((s) => Math.max(s, next - LOG_VISIBLE + 1));
          return next;
        });
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
      else if (showLog) focusLogs();
    } else if (key.upArrow || input === "k") {
      setSelected((s) => Math.max(0, s - 1));
    } else if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(rows.length - 1, s + 1));
    } else if (key.return || input === "c") {
      if (selectedRow) {
        const name = selectedRow.branch.name;
        runAction(`checking out ${name}`, () => gt.checkout(data.repoRoot, name));
      }
    } else if (input === "o") {
      if (selectedRow?.branch.pr)
        runAction("opening PR", () => gt.openPr(data.repoRoot, selectedRow.branch.name));
      else notify("No PR for this branch", false);
    } else if (input === "O") {
      if (selectedRow)
        runAction("opening stack", () =>
          gt.openPr(data.repoRoot, selectedRow.branch.name, true)
        );
    } else if (input === "g") {
      if (selectedRow?.branch.pr) {
        const url = githubPrUrl(data.repoRoot, selectedRow.branch.pr.prNumber);
        if (url) runAction("opening GitHub PR", () => gt.openUrl(url));
        else notify("No GitHub remote found", false);
      } else notify("No PR for this branch", false);
    } else if (input === "s") {
      runAction("syncing", () => gt.sync(data.repoRoot));
    } else if (input === "r") {
      runAction("restacking", () => gt.restack(data.repoRoot));
    } else if (input === "S") {
      runAction("submitting stack", () => gt.submitStack(data.repoRoot));
    } else if (input === "d") {
      if (selectedRow && !selectedRow.branch.isTrunk) setMode("confirm-delete");
      else notify("Cannot delete trunk", false);
    } else if (input === "y") {
      if (selectedRow) setMode("copy");
    } else if (input === "/") {
      setMode("filter");
    } else if (input === "R") {
      const fresh = reload();
      if (fresh) refreshPrStatus(fresh);
      notify("Refreshed", true);
    } else if (input === "e") {
      if (errorDetail) {
        setErrorScroll(0);
        setMode("error");
      }
    } else if (input === "?") {
      setMode("help");
    }
  });

  if (mode === "help") return <HelpOverlay />;
  if (mode === "error" && errorDetail)
    return (
      <ErrorOverlay
        text={errorDetail}
        scrollOffset={errorScroll}
        visible={Math.max(3, (stdout?.rows ?? 24) - 7)}
      />
    );

  const totalWidth = stdout?.columns ?? 80;
  // Cap content width so right-aligned metadata stays close to the titles on
  // wide/full-screen terminals instead of being pushed to the far edge.
  const MAX_CONTENT_WIDTH = 160;
  // Subtract the root Box's paddingX={1} (2 cols) so the branch list and file
  // panel share the same usable width and their right edges line up.
  const contentWidth = Math.min(totalWidth - 2, MAX_CONTENT_WIDTH);
  // Reserve space for arrow(2) + gutter(2*cols) + metadata (CI icon, #pr,
  // comments, badge, age, ahead/behind ~40). Under-reserving lets a metadata-
  // heavy row overflow the row width and wrap, which shifts the graph gutter.
  const titleWidth = Math.max(
    20,
    contentWidth - 2 - columnCount * 2 - 40
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
  const statusLines = (message ? 1 : 0) + 4 + (data.rebase ? 1 : 0);
  const panelChrome = 1 /*marginTop*/ + 1 /*panel header*/ + 2 /*more rows*/;
  // Command-log panel: a short, fixed-height section below the files panel that
  // only takes space once at least one command has run. `logVisible` is the
  // number of log lines shown; +2 for its marginTop and header row.
  const logVisible = LOG_VISIBLE;
  const logRendered = showLog ? logVisible + 2 : 0;
  // Space shared by the branch list and the files panel (the log panel, when
  // present, is reserved out of the total up front).
  const listsBudget = Math.max(
    4,
    frameRows - headerLines - dialogLines - statusLines - logRendered
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

  // Files panel gets whatever vertical space the branch list (and the log
  // panel, if shown) leave.
  const visible = Math.max(
    3,
    frameRows -
      headerLines -
      branchRendered -
      dialogLines -
      statusLines -
      panelChrome -
      logRendered
  );
  const scrollOffset = keepVisibleOffset(fileCursor, visible, files.length);

  // Command-log view: when unfocused it tails the newest output; when focused
  // the line cursor drives scrolling (reusing keepVisibleOffset).
  // Effective collapsed state per entry: a manual override if the user set one,
  // else the default — collapsed for running/succeeded commands, expanded for
  // failed ones so the error is visible without interaction.
  const collapsedIds = new Set<number>();
  for (const e of logEntries) {
    const def = e.status !== "error";
    const eff = logOverrides.has(e.id) ? logOverrides.get(e.id)! : def;
    if (eff) collapsedIds.add(e.id);
  }
  collapsedIdsRef.current = collapsedIds;
  const logLines = flattenLog(logEntries, collapsedIds);
  logLinesRef.current = logLines;
  const logFocused = focus === "logs";
  const logCursorClamped = Math.min(
    Math.max(0, logCursor),
    Math.max(0, logLines.length - 1)
  );
  const logMaxOffset = Math.max(0, logLines.length - logVisible);
  // Unfocused: tail the newest output. Focused: honor the stateful scroll
  // offset (clamped), so the view never snaps back as the user navigates.
  const logOffset = !logFocused
    ? logMaxOffset
    : Math.min(Math.max(0, logScroll), logMaxOffset);

  return (
    <Box flexDirection="column" paddingX={1} height={frameRows} overflow="hidden">
      <Box flexDirection="column" flexShrink={0}>
        <Header repoRoot={data.repoRoot} busy={busy} width={contentWidth} />

        <StackGraph
          rows={rows}
          columnCount={columnCount}
          selectedIndex={selected}
          width={contentWidth}
          titleWidth={titleWidth}
          scrollOffset={branchOffset}
          visible={branchVisible}
          conflictedBranches={conflictedBranches}
          prStatus={prStatus}
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
            width={contentWidth}
          />
        )}
      </Box>

      <Box flexShrink={0} flexDirection="column">
        {showLog && (
          <CommandLog
            lines={logLines}
            entryCount={logEntries.length}
            focused={logFocused}
            cursor={logFocused ? logCursorClamped : null}
            scrollOffset={logOffset}
            visible={logVisible}
            width={contentWidth}
          />
        )}
        {data.rebase && (
          <Text color="red" bold wrap="truncate-end">
            {`⚠ Rebase paused${
              data.rebase.branch ? ` on ${data.rebase.branch}` : ""
            } — ${data.rebase.files.length} conflicted file${
              data.rebase.files.length === 1 ? "" : "s"
            }. Resolve, then \`gt continue\` (or \`gt abort\`).`}
          </Text>
        )}
        <StatusBar
          message={message}
          hint={
            mode === "filter"
              ? FILTER_HINT
              : focus === "logs"
                ? LOG_HINT
                : focus === "files"
                  ? showLog
                    ? FILES_HINT
                    : [["Tab/esc", "back to branches"]]
                  : errorDetail
                    ? [["e", "error details"], ...NORMAL_HINT]
                    : NORMAL_HINT
          }
        />
      </Box>
    </Box>
  );
}
