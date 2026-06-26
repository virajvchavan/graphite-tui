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
  Branch,
  ChangedFile,
  PrLiveStatus,
  RenderRow,
  RepoData,
} from "../types.js";
import type { WorkingFile } from "../data/status.js";
import type { RepoPaths } from "../data/repo.js";
import { loadRepoData } from "../data/load.js";
import { githubPrUrl } from "../data/git.js";
import { getChangedFiles } from "../data/files.js";
import { getWorkingStatus } from "../data/status.js";
import { getBranchFileDiff, getWorktreeFileDiff } from "../data/diff.js";
import { fetchPrStatus } from "../data/comments.js";
import { buildRenderRows } from "../model/tree.js";
import { watchRepo, watchWorkingTree } from "../data/watch.js";
import * as gt from "../actions/gt.js";
import * as commandLog from "../actions/commandLog.js";
import { centeredOffset, keepVisibleOffset } from "./scroll.js";
import { Header } from "./Header.js";
import { StackGraph } from "./StackGraph.js";
import { FilesPanel } from "./FilesPanel.js";
import { WorktreePanel } from "./WorktreePanel.js";
import { CommandLog, flattenLog } from "./CommandLog.js";
import { StatusBar } from "./StatusBar.js";
import { HelpOverlay, helpLineCount, helpVisibleRows } from "./HelpOverlay.js";
import { ErrorOverlay } from "./ErrorOverlay.js";
import { ConfirmOverlay } from "./ConfirmOverlay.js";
import { InputOverlay } from "./InputOverlay.js";
import { DiffOverlay, diffVisibleRows } from "./DiffOverlay.js";
import type { DetailLine } from "./Modal.js";
import { applyTheme, colors, getThemeMode, prBadge } from "./theme.js";
import {
  changedFilesKey,
  type Focus,
  nextFocus,
  normalHint,
  prNumbersOf,
  worktreeHint,
} from "./appLogic.js";

type Mode =
  | "normal"
  | "filter"
  | "help"
  | "confirm"
  | "copy"
  | "error"
  | "input"
  | "diff";


/**
 * A pending destructive action awaiting Enter confirmation, shown full-screen
 * via ConfirmOverlay with whatever context is relevant to the action.
 */
interface PendingConfirm {
  title: string;
  /** The thing being acted on (branch name, file path). */
  target?: string;
  /** Contextual facts shown above the prompt. */
  details?: DetailLine[];
  /** Bullet list of what confirming will do. */
  consequences?: string[];
  /** Label for the confirm action. */
  confirmLabel: string;
  run: () => void;
}

/** A single-line text prompt (e.g. a commit message) awaiting Enter. */
interface PromptState {
  title: string;
  value: string;
  /** Contextual facts shown above the input field. */
  details?: DetailLine[];
  onSubmit: (value: string) => void;
}

interface Props {
  initial: RepoData;
  paths: RepoPaths;
}

interface Msg {
  text: string;
  ok: boolean;
}

const FILTER_HINT: Array<[string, string]> = [
  ["esc", "clear"],
  ["↵", "keep filter"],
];
const FILES_HINT: Array<[string, string]> = [
  ["↵", "open"],
  ["space", "collapse"],
  ["Tab", "next"],
  ["?", "help"],
];
const FILES_COLLAPSED_HINT: Array<[string, string]> = [
  ["space", "expand"],
  ["Tab", "next"],
  ["?", "help"],
];
const INPUT_HINT: Array<[string, string]> = [
  ["↵", "submit"],
  ["esc", "cancel"],
];
const LOG_HINT: Array<[string, string]> = [
  ["↵", "collapse"],
  ["↑/↓", "move"],
  ["c", "clear"],
  ["Tab/esc", "back"],
  ["?", "help"],
];
// Number of log lines the command-log panel shows ("not too tall").
const LOG_VISIBLE = 6;
// Max file rows the working-tree panel shows before it scrolls.
const WORKTREE_VISIBLE = 8;

/** Basename of a repo-relative path, for concise status messages. */
const baseName = (p: string) => p.split("/").pop() || p;

export function App({ initial, paths }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [data, setData] = useState<RepoData>(initial);
  const [mode, setMode] = useState<Mode>("normal");
  // Mirror the active palette in state so a toggle forces a re-render; the
  // actual color values live in the module-level `colors` binding.
  const [themeMode, setThemeMode] = useState(getThemeMode());
  const toggleTheme = () => {
    const next = themeMode === "light" ? "dark" : "light";
    applyTheme(next);
    setThemeMode(next);
  };
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Msg | null>(null);
  // Full output of the last failed command, viewable via the error overlay.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [errorScroll, setErrorScroll] = useState(0);
  const [helpScroll, setHelpScroll] = useState(0);
  const [query, setQuery] = useState("");

  // Changed-files panel state. Files are derived from a per-branch cache
  // (keyed by branch+parent revision; see changedFilesKey) warmed in the
  // background, so navigating
  // to an already-loaded branch is an instant single render (no loading flash
  // and no flicker). `cacheTick` forces a re-render when the cache fills.
  const [focus, setFocus] = useState<Focus>("branches");
  const [fileCursor, setFileCursor] = useState(0);
  const [, setCacheTick] = useState(0);
  const filesCache = useRef<Map<string, ChangedFile[]>>(new Map());
  // Global override for the branch-diff panel's collapsed state, toggled with ↵
  // while it's focused: `null` follows the auto behavior (collapsed only when
  // the screen is too short), `true` forces it collapsed, `false` forces it
  // open. It's a sticky global switch — once set it persists across branches
  // until the user toggles it again (it does not reset on branch change).
  const [filesCollapseOverride, setFilesCollapseOverride] = useState<
    boolean | null
  >(null);

  // Live working-tree status (staged/unstaged/untracked files for the current
  // branch). Refreshed on actions, terminal focus, .git/index changes, and a
  // 60s poll backstop (working-tree edits don't touch git metadata).
  const [worktree, setWorktree] = useState<WorkingFile[]>([]);
  const [worktreeCursor, setWorktreeCursor] = useState(0);

  // Full-screen single-file diff viewer. `diffView` records which list and which
  // index is open; `diffText` holds the fetched patch (null = loading); the
  // ←/→ keys walk the surrounding list and ↑/↓ scroll the patch.
  const [diffView, setDiffView] = useState<{
    source: "worktree" | "branch";
    index: number;
  } | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [diffScroll, setDiffScroll] = useState(0);

  // A pending destructive action (delete branch, discard changes) awaiting
  // Enter confirmation, shown full-screen via ConfirmOverlay.
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null
  );
  // An active single-line text prompt (commit message / new-branch message).
  const [promptState, setPromptState] = useState<PromptState | null>(null);

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
  // The working-tree section is always rendered (so its header shows even with a
  // clean tree); this flag gates only whether it's focusable / in the Tab cycle.
  const hasWorktreeChanges = worktree.length > 0;
  // The flattened log lines + effective collapsed set for the current view,
  // mirrored into refs so the key handler can read line count, the entry under
  // the cursor, and its collapsed state without computing them before useInput.
  const logLinesRef = useRef<import("./CommandLog.js").Line[]>([]);
  const collapsedIdsRef = useRef<Set<number>>(new Set());
  // Whether the PR-files panel is currently rendered collapsed (computed in the
  // layout block below). Mirrored into a ref so the key handler can branch on it
  // without that value existing before useInput.
  const filesCollapsedRef = useRef(false);

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
      // The files cache is keyed by branch+parent revision (see
      // changedFilesKey), so it's self-invalidating — clearing it here would
      // make the selected branch's diff flicker (loading→repopulate) on every
      // watcher tick. Stale keys just go unused.
      setData(fresh);
      return fresh;
    } catch {
      /* transient (gt mid-write); next watch tick will retry */
      return null;
    }
  }, [data.repoRoot]);

  // Refresh the working-tree status. Best-effort; failures leave the last
  // known state in place (the next trigger retries).
  const reloadStatus = useCallback(async () => {
    const files = await getWorkingStatus(data.repoRoot);
    setWorktree(files);
  }, [data.repoRoot]);

  // Live auto-refresh from gt activity in other terminals. The watcher fires on
  // Graphite metadata, HEAD, and .git/index changes — the last picks up staging
  // done elsewhere — so reload both the repo data and the working-tree status.
  useEffect(
    () =>
      watchRepo(paths, () => {
        reload();
        reloadStatus();
      }),
    [paths, reload, reloadStatus]
  );

  // Initial working-tree load.
  useEffect(() => {
    reloadStatus();
  }, [reloadStatus]);

  // Working-tree edits made in an external editor don't touch any git metadata,
  // so watchRepo won't see them. Watch the working tree itself and refresh on
  // change (watchWorkingTree owns its own poll fallback where recursive watch
  // is unavailable). `busy` is read through a ref so toggling it doesn't tear
  // down and rebuild the watcher; the check also gates the fallback poll.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(
    () =>
      watchWorkingTree(data.repoRoot, () => {
        if (!busyRef.current) reloadStatus();
      }),
    [data.repoRoot, reloadStatus]
  );

  // Keep the working-tree cursor in range as files come and go.
  useEffect(() => {
    setWorktreeCursor((c) =>
      Math.min(Math.max(0, c), Math.max(0, worktree.length - 1))
    );
  }, [worktree.length]);

  // If the panel that currently has focus disappears (worktree emptied, no
  // files, log cleared), fall back to the branch list.
  useEffect(() => {
    if (focus === "worktree" && worktree.length === 0) setFocus("branches");
    else if (focus === "logs" && logEntries.length === 0) setFocus("branches");
  }, [focus, worktree.length, logEntries.length]);

  // Only the PR list remembers its position. The working-tree and diff panels
  // reset to their first row whenever focus leaves, so re-entering always starts
  // at the top (and they show no highlight at all while unfocused).
  useEffect(() => {
    if (focus !== "worktree") setWorktreeCursor(0);
    if (focus !== "files") setFileCursor(0);
  }, [focus]);

  const selectedRow: RenderRow | undefined = rows[selected];
  const selBranch = selectedRow?.branch;
  const noParent = !selBranch || selBranch.isTrunk || !selBranch.parent;
  // The working tree acts on the *current* branch. On trunk you can't amend a
  // commit, so the modify action becomes "create a branch" instead.
  const onTrunk = data.currentBranch === data.trunk;
  // Amend/commit (off trunk) and create-branch (on trunk) all act on staged
  // changes, so they're only offered when something is actually staged.
  const hasStaged = worktree.some((f) => f.staged);
  const fileKey = selBranch ? changedFilesKey(selBranch, data.branches) : "";

  // Files for the selected branch, derived from the cache. `undefined` means
  // not loaded yet → show a (rare, brief) loading state.
  const cachedFiles = fileKey ? filesCache.current.get(fileKey) : undefined;
  const files: ChangedFile[] = noParent ? [] : (cachedFiles ?? []);
  const filesLoading = !noParent && !!selBranch && cachedFiles === undefined;

  // The file currently open in the diff viewer (if any), with its index clamped
  // to the live list — the underlying list can shrink under a refresh while the
  // viewer is open.
  const diffList: (ChangedFile | WorkingFile)[] =
    diffView?.source === "worktree" ? worktree : files;
  const diffIndex = diffView
    ? Math.min(Math.max(0, diffView.index), Math.max(0, diffList.length - 1))
    : 0;
  const diffFile = diffView ? diffList[diffIndex] : undefined;

  // The branch (if any) that an in-progress rebase is currently stuck on with
  // merge conflicts — flagged red in the graph.
  const conflictedBranches = new Set<string>();
  if (data.rebase?.branch) conflictedBranches.add(data.rebase.branch);

  // Reset the file scroll position (and any manual expand) when the selected
  // branch changes.
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

  // Close the diff viewer if its list emptied out underneath it (e.g. all
  // changes were committed/discarded while it was open).
  useEffect(() => {
    if (diffView && diffList.length === 0) {
      setDiffView(null);
      setMode("normal");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffView, diffList.length]);

  // Fetch the patch for the file open in the diff viewer. Re-runs when the file
  // (source + index) or the relevant branch identity changes; resets scroll to
  // the top each time so a new file starts at its first line.
  const diffFilePath = diffFile?.path;
  useEffect(() => {
    if (!diffView || !diffFile) return;
    let cancelled = false;
    setDiffText(null);
    setDiffScroll(0);
    (async () => {
      const text =
        diffView.source === "worktree"
          ? await getWorktreeFileDiff(data.repoRoot, diffFile as WorkingFile)
          : await getBranchFileDiff(
              data.repoRoot,
              selBranch?.parent ?? null,
              selBranch?.name ?? "",
              diffFile.path
            );
      if (!cancelled) setDiffText(text);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffView?.source, diffIndex, diffFilePath, fileKey]);

  // Warm the changed-files cache for every branch in the background so
  // subsequent navigation is instant. Runs once per data load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const b of data.branches.values()) {
        if (cancelled) return;
        if (b.isTrunk || !b.parent) continue;
        const key = changedFilesKey(b, data.branches);
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
      // And refresh the working tree — staging/discard/modify all change it.
      reloadStatus();
      return fresh;
    },
    [busy, reload, refreshPrStatus, reloadStatus]
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

  // Prompt for a commit message, then create a new branch off the current one
  // with the staged changes (used in place of `gt modify` while on trunk).
  const startCreateBranch = useCallback(() => {
    const staged = worktree.filter((f) => f.staged).length;
    setPromptState({
      title: "New branch — commit message",
      value: "",
      details: [
        { label: "Parent", value: data.currentBranch ?? data.trunk },
        { label: "Staged", value: `${staged} file${staged === 1 ? "" : "s"}` },
      ],
      onSubmit: (msg) =>
        runAction("creating branch", () => gt.createBranch(data.repoRoot, msg)),
    });
    setMode("input");
  }, [data.repoRoot, data.currentBranch, data.trunk, runAction, worktree]);

  // --- key handling ---
  useInput((input, key) => {
    // Terminal focus events (enabled via focus reporting above): "[I" on
    // focus-in, "[O" on focus-out. Regaining focus is a good moment to pull
    // fresh comment counts, since GitHub state may have changed while away.
    if (input === "[I") {
      // Regaining focus is a good moment to catch external editor saves.
      reloadStatus();
      const now = Date.now();
      if (now - lastFocusFetch.current > 3000) {
        lastFocusFetch.current = now;
        refreshPrStatus();
      }
      return;
    }
    if (input === "[O") return;

    // Toggle light/dark from any non-text-entry mode (input/filter capture
    // typed characters, so `t` would be swallowed there).
    if (input === "t" && mode !== "input" && mode !== "filter") {
      toggleTheme();
      return;
    }

    if (mode === "help") {
      if (input === "?" || key.escape) {
        setMode("normal");
      } else if (key.upArrow || input === "k") {
        setHelpScroll((s) => Math.max(0, s - 1));
      } else if (key.downArrow || input === "j" || input === " ") {
        const vis = helpVisibleRows(Math.max(8, (stdout?.rows ?? 24) - 1));
        const max = Math.max(0, helpLineCount - vis);
        const step = input === " " ? Math.max(1, Math.floor(vis / 2)) : 1;
        setHelpScroll((s) => Math.min(max, s + step));
      }
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
    if (mode === "diff") {
      if (key.escape || input === "q") {
        setMode("normal");
        setDiffView(null);
        return;
      }
      const len =
        diffView?.source === "worktree" ? worktree.length : files.length;
      if (key.leftArrow || input === "h") {
        setDiffView((d) =>
          d ? { ...d, index: Math.max(0, d.index - 1) } : d
        );
      } else if (key.rightArrow || input === "l") {
        setDiffView((d) =>
          d ? { ...d, index: Math.min(len - 1, d.index + 1) } : d
        );
      } else if (key.upArrow || input === "k") {
        setDiffScroll((s) => Math.max(0, s - 1));
      } else if (key.downArrow || input === "j" || input === " ") {
        const lineCount = diffText ? diffText.split("\n").length : 0;
        // Match DiffOverlay's window for the same frame height (rows − 1).
        const vis = diffVisibleRows(Math.max(8, (stdout?.rows ?? 24) - 1));
        // Space jumps a half-page; the arrows/j step one line.
        const step = input === " " ? Math.max(1, Math.floor(vis / 2)) : 1;
        setDiffScroll((s) => Math.min(Math.max(0, lineCount - vis), s + step));
      }
      return;
    }
    if (mode === "confirm") {
      if (key.return && pendingConfirm) {
        const run = pendingConfirm.run;
        setPendingConfirm(null);
        setMode("normal");
        run();
      } else if (input === "n" || key.escape) {
        setPendingConfirm(null);
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
    if (mode === "input") {
      if (key.escape) {
        setPromptState(null);
        setMode("normal");
      } else if (key.return) {
        const text = promptState?.value.trim() ?? "";
        if (text && promptState) {
          const submit = promptState.onSubmit;
          setPromptState(null);
          setMode("normal");
          submit(text);
        }
      } else if (key.backspace || key.delete) {
        setPromptState((s) => (s ? { ...s, value: s.value.slice(0, -1) } : s));
      } else if (input && !key.ctrl && !key.meta) {
        setPromptState((s) => (s ? { ...s, value: s.value + input } : s));
      }
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

    const shownPanels = {
      worktree: hasWorktreeChanges,
      files: files.length > 0,
      logs: showLog,
    };
    const goFocus = (f: Focus) => (f === "logs" ? focusLogs() : setFocus(f));

    // Repo-wide actions available from every panel, not just the branch list.
    if (input === "?") {
      setHelpScroll(0);
      setMode("help");
      return;
    }
    if (input === "s") {
      runAction("syncing", () => gt.sync(data.repoRoot));
      return;
    }
    if (input === "R") {
      const fresh = reload();
      if (fresh) refreshPrStatus(fresh);
      reloadStatus();
      notify("Refreshed", true);
      return;
    }

    // working-tree focus: move the cursor and act on the file under it.
    if (focus === "worktree") {
      const wf = worktree[worktreeCursor];
      if (key.escape) {
        setFocus("branches");
      } else if (key.tab) {
        goFocus(nextFocus("worktree", shownPanels));
      } else if (input === "Q" || (key.ctrl && input === "c")) {
        exit();
      } else if (key.return) {
        if (worktree.length) {
          setDiffView({ source: "worktree", index: worktreeCursor });
          setMode("diff");
        }
      } else if (key.upArrow || input === "k") {
        setWorktreeCursor((c) => Math.max(0, c - 1));
      } else if (key.downArrow || input === "j") {
        setWorktreeCursor((c) => Math.min(worktree.length - 1, c + 1));
      } else if (input === "a") {
        if (wf)
          runAction(`staging ${baseName(wf.path)}`, () =>
            gt.stageFile(data.repoRoot, wf.path)
          );
      } else if (input === "A") {
        runAction("staging all", () => gt.stageAll(data.repoRoot));
      } else if (input === "u") {
        if (wf)
          runAction(`unstaging ${baseName(wf.path)}`, () =>
            gt.unstageFile(data.repoRoot, wf.path)
          );
      } else if (input === "U") {
        runAction("unstaging all", () => gt.unstageAll(data.repoRoot));
      } else if (input === " ") {
        // Toggle: stage anything not yet fully staged, else unstage it.
        if (wf)
          wf.unstaged || wf.untracked
            ? runAction(`staging ${baseName(wf.path)}`, () =>
                gt.stageFile(data.repoRoot, wf.path)
              )
            : runAction(`unstaging ${baseName(wf.path)}`, () =>
                gt.unstageFile(data.repoRoot, wf.path)
              );
      } else if (input === "x") {
        if (wf) {
          const fileDetails: DetailLine[] = [
            {
              label: "Status",
              value: wf.untracked
                ? "untracked"
                : wf.staged && wf.unstaged
                  ? "staged + unstaged"
                  : wf.staged
                    ? "staged"
                    : "modified",
            },
          ];
          if (wf.additions || wf.deletions)
            fileDetails.push({
              label: "Changes",
              node: (
                <Text>
                  {wf.additions > 0 && (
                    <Text color={colors.added}>+{wf.additions}</Text>
                  )}
                  {wf.additions > 0 && wf.deletions > 0 ? " " : ""}
                  {wf.deletions > 0 && (
                    <Text color={colors.deleted}>−{wf.deletions}</Text>
                  )}
                </Text>
              ),
            });
          setPendingConfirm({
            title: wf.untracked ? "Delete untracked file?" : "Discard changes?",
            target: wf.path,
            details: fileDetails,
            consequences: [
              wf.untracked
                ? "The untracked file will be permanently removed."
                : "All uncommitted changes to this file will be lost.",
              "This cannot be undone.",
            ],
            confirmLabel: wf.untracked ? "Delete file" : "Discard changes",
            run: () =>
              runAction(`discarding ${baseName(wf.path)}`, () =>
                gt.discardFile(data.repoRoot, wf)
              ),
          });
          setMode("confirm");
        }
      } else if (input === "X") {
        const stagedCount = worktree.filter((f) => f.staged).length;
        const unstagedCount = worktree.filter(
          (f) => f.unstaged || f.untracked
        ).length;
        setPendingConfirm({
          title: "Discard ALL changes?",
          details: [
            {
              label: "Files",
              value: `${worktree.length} changed`,
            },
            { label: "Staged", value: `${stagedCount}` },
            { label: "Unstaged", value: `${unstagedCount}` },
          ],
          consequences: [
            "Every tracked file will be reverted to HEAD.",
            "All untracked files will be removed.",
            "This cannot be undone.",
          ],
          confirmLabel: "Discard everything",
          run: () => runAction("discarding all", () => gt.discardAll(data.repoRoot)),
        });
        setMode("confirm");
      } else if (input === "m") {
        if (!hasStaged) notify("Nothing staged", false);
        else if (onTrunk) startCreateBranch();
        else runAction("gt modify", () => gt.gtModify(data.repoRoot));
      } else if (input === "c") {
        if (!hasStaged) notify("Nothing staged", false);
        else if (onTrunk) startCreateBranch();
        else {
          const staged = worktree.filter((f) => f.staged).length;
          setPromptState({
            title: "New commit message",
            value: "",
            details: [
              { label: "Branch", value: data.currentBranch ?? "?" },
              {
                label: "Staged",
                value: `${staged} file${staged === 1 ? "" : "s"}`,
              },
            ],
            onSubmit: (msg) =>
              runAction("adding commit", () =>
                gt.gtModifyCommit(data.repoRoot, msg)
              ),
          });
          setMode("input");
        }
      }
      return;
    }

    // files-panel focus: scroll the file list (or expand it when collapsed).
    if (focus === "files") {
      if (key.escape) {
        setFocus("branches");
      } else if (key.tab) {
        goFocus(nextFocus("files", shownPanels));
      } else if (input === "Q" || (key.ctrl && input === "c")) {
        exit();
      } else if (key.return) {
        if (files.length) {
          setDiffView({ source: "branch", index: fileCursor });
          setMode("diff");
        }
      } else if (input === " ") {
        // Toggle collapse of the whole branch-diff section (overriding the
        // auto behavior in whichever direction is opposite the current state).
        setFilesCollapseOverride(!filesCollapsedRef.current);
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
      } else if (input === "Q" || (key.ctrl && input === "c")) {
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
    if (input === "Q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    if (key.tab) {
      goFocus(nextFocus("branches", shownPanels));
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
    } else if (input === "G") {
      setPromptState({
        title: "Get a remote branch/stack",
        value: "",
        details: [
          {
            label: "Runs",
            value: "gt get <branch> — pulls the branch and its ancestors",
          },
        ],
        onSubmit: (name) =>
          runAction(`getting ${name}`, () => gt.getBranch(data.repoRoot, name)),
      });
      setMode("input");
    } else if (input === "r") {
      runAction("restacking", () => gt.restack(data.repoRoot));
    } else if (input === "S") {
      if (selectedRow && !selectedRow.branch.isTrunk) {
        const name = selectedRow.branch.name;
        runAction(`submitting ${name}`, () =>
          gt.submitBranch(data.repoRoot, name)
        );
      }
    } else if (input === "d") {
      if (selectedRow && !selectedRow.branch.isTrunk) {
        const b = selectedRow.branch;
        const name = b.name;
        const delDetails: DetailLine[] = [];
        if (b.pr) {
          delDetails.push({
            label: "Pull request",
            value: `#${b.pr.prNumber}  ${b.pr.title}`,
          });
          const badge = prBadge(b.pr);
          if (badge)
            delDetails.push({
              label: "PR status",
              value: badge.text,
              color: badge.color,
            });
        }
        if (b.children.length)
          delDetails.push({
            label: b.children.length === 1 ? "Child branch" : "Children",
            value: b.children.join(", "),
          });
        if (b.age) delDetails.push({ label: "Last commit", value: `${b.age} ago` });
        const consequences = ["Deletes the local branch (gt delete --force)."];
        if (b.children.length)
          consequences.push(
            `Its ${b.children.length} child branch${
              b.children.length === 1 ? "" : "es"
            } will be restacked onto ${b.parent ?? data.trunk}.`
          );
        if (b.unpushed || b.ahead > 0)
          consequences.push("This branch has unpushed commits that will be lost.");
        if (b.pr && b.pr.state === "OPEN")
          consequences.push(`PR #${b.pr.prNumber} stays open on GitHub.`);
        setPendingConfirm({
          title: "Delete branch?",
          target: name,
          details: delDetails,
          consequences,
          confirmLabel: "Delete branch",
          run: () =>
            runAction(`deleting ${name}`, () =>
              gt.deleteBranch(data.repoRoot, name)
            ),
        });
        setMode("confirm");
      } else notify("Cannot delete trunk", false);
    } else if (input === "y") {
      if (selectedRow) setMode("copy");
    } else if (input === "/") {
      setMode("filter");
    } else if (input === "e") {
      if (errorDetail) {
        setErrorScroll(0);
        setMode("error");
      }
    }
  });

  if (mode === "error" && errorDetail)
    return (
      <ErrorOverlay
        text={errorDetail}
        scrollOffset={errorScroll}
        visible={Math.max(3, (stdout?.rows ?? 24) - 7)}
      />
    );

  // Confirm/input prompts take over the whole screen: while one is open the user
  // can't act on anything else, so nothing else should compete for attention.
  const modalWidth = stdout?.columns ?? 80;
  const modalHeight = Math.max(8, (stdout?.rows ?? 24) - 1);
  if (mode === "help")
    return (
      <HelpOverlay
        width={modalWidth}
        height={modalHeight}
        scrollOffset={helpScroll}
      />
    );
  if (mode === "confirm" && pendingConfirm)
    return (
      <ConfirmOverlay
        title={pendingConfirm.title}
        target={pendingConfirm.target}
        details={pendingConfirm.details}
        consequences={pendingConfirm.consequences}
        confirmLabel={pendingConfirm.confirmLabel}
        width={modalWidth}
        height={modalHeight}
      />
    );
  if (mode === "diff" && diffView && diffFile)
    return (
      <DiffOverlay
        path={diffFile.path}
        position={{ index: diffIndex, total: diffList.length }}
        sourceLabel={
          diffView.source === "worktree"
            ? "working tree"
            : `${selBranch?.parent ?? "?"}…${selBranch?.name ?? "?"}`
        }
        text={diffText}
        scrollOffset={diffScroll}
        width={modalWidth}
        height={modalHeight}
      />
    );
  if (mode === "input" && promptState)
    return (
      <InputOverlay
        title={promptState.title}
        value={promptState.value}
        details={promptState.details}
        width={modalWidth}
        height={modalHeight}
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
  // Confirm/input are full-screen (early-returned above), so the only inline
  // prompts left in the layout are the filter and copy hints (one line each).
  const dialogLines = mode === "filter" || mode === "copy" ? 1 : 0;
  const statusLines = (message ? 1 : 0) + 4 + (data.rebase ? 1 : 0);
  const panelChrome = 1 /*marginTop*/ + 1 /*panel header*/ + 2 /*more rows*/;
  // Command-log panel: a short, fixed-height section below the files panel that
  // only takes space once at least one command has run. `logVisible` is the
  // number of log lines shown; +2 for its marginTop and header row.
  const logVisible = LOG_VISIBLE;
  const logRendered = showLog ? logVisible + 2 : 0;

  // Working-tree panel: a windowed, fixed-height section reserved up front (like
  // the command log). It's the highest-priority lower panel, but capped to half
  // the lists region so a long status can't crowd the branch list off a short
  // screen.
  const baseBudget = Math.max(
    4,
    frameRows - headerLines - dialogLines - statusLines - logRendered
  );
  const worktreeVisible = hasWorktreeChanges
    ? Math.min(
        worktree.length,
        WORKTREE_VISIBLE,
        Math.max(2, Math.floor(baseBudget / 2))
      )
    : 0;
  const worktreeScroll = worktree.length > worktreeVisible;
  // Always reserve the header (marginTop + title row). With changes, add the
  // file rows and any scroll indicators; with a clean tree, add one row for the
  // "No changes" line.
  const worktreeRendered = hasWorktreeChanges
    ? 2 /*marginTop+header*/ + worktreeVisible + (worktreeScroll ? 2 : 0)
    : 2 /*marginTop+header*/ + 1; /*No changes*/
  const worktreeOffset = keepVisibleOffset(
    worktreeCursor,
    worktreeVisible,
    worktree.length
  );

  // Space shared by the branch list and the files panel (the log and working-
  // tree panels are reserved out of the total up front).
  const listsBudget = Math.max(4, baseBudget - worktreeRendered);
  // Reserve room for the files panel so the branch list can't crowd it out —
  // but only while the branch list still fits the shared budget with that
  // reserve in place. On a short screen with many PRs the list would overflow,
  // and there we prioritise showing PRs: drop to a minimal reserve so more PR
  // rows fit. The files panel keeps a small minimum and can be focused+scrolled.
  // Trunk reserves 3: marginTop + header + the "trunk (no diff)" line.
  const desiredFilesReserve = !selBranch ? 0 : noParent ? 3 : 6;
  const minFilesReserve = !selBranch ? 0 : noParent ? 3 : 3;
  const branchesFit = rows.length <= listsBudget - desiredFilesReserve;
  const branchesFitMin = rows.length <= listsBudget - minFilesReserve;
  // When space is genuinely tight (the branch list can't fit even at the minimum
  // files reserve), auto-collapse the branch-diff panel to just its header so
  // more PRs and the working tree stay visible. A user override (↵ while the
  // panel is focused) wins over that auto behavior in either direction: force it
  // collapsed even with room to spare, or force it open on a short screen.
  const filesCollapsible = !!selBranch && !noParent;
  const filesCollapsed =
    filesCollapsible && (filesCollapseOverride ?? !branchesFitMin);
  filesCollapsedRef.current = filesCollapsed;
  const filesReserve = filesCollapsed
    ? 1
    : branchesFit
      ? desiredFilesReserve
      : minFilesReserve;
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

  // Files panel gets whatever vertical space the branch list, working-tree
  // panel, and log panel leave. Collapsed → header only (no list).
  const visible = filesCollapsed
    ? 0
    : Math.max(
        3,
        frameRows -
          headerLines -
          branchRendered -
          dialogLines -
          statusLines -
          panelChrome -
          logRendered -
          worktreeRendered
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

        <Box>
          <Text color={focus === "branches" ? colors.current : colors.dim}>
            {focus === "branches" ? "▾" : "▸"}{" "}
          </Text>
          <Text bold color={focus === "branches" ? colors.current : undefined}>
            pull requests
          </Text>
        </Box>

        <StackGraph
          rows={rows}
          columnCount={columnCount}
          selectedIndex={selected}
          focused={focus === "branches"}
          width={contentWidth}
          titleWidth={titleWidth}
          scrollOffset={branchOffset}
          visible={branchVisible}
          conflictedBranches={conflictedBranches}
          prStatus={prStatus}
        />

        {mode === "filter" && (
          <Box marginTop={1}>
            <Text color={colors.keyHint}>/</Text>
            <Text color={colors.text}>{query}</Text>
            <Text color={colors.dim}>▏</Text>
          </Box>
        )}

        {mode === "copy" && (
          <Box marginTop={1}>
            <Text color={colors.dim}>
              copy: <Text color={colors.keyHint}>u</Text> PR url ·{" "}
              <Text color={colors.keyHint}>b</Text> branch name · esc cancel
            </Text>
          </Box>
        )}
      </Box>

      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        <WorktreePanel
          branchName={data.currentBranch}
          files={worktree}
          focused={focus === "worktree"}
          cursor={worktreeCursor}
          scrollOffset={worktreeOffset}
          visible={worktreeVisible}
          width={contentWidth}
        />
        {selBranch && (
          <FilesPanel
            branchName={selBranch.name}
            parentName={selBranch.parent}
            files={files}
            loading={filesLoading}
            noParent={noParent}
            collapsed={filesCollapsed}
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
          <Text color={colors.conflict} bold wrap="truncate-end">
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
            mode === "input"
              ? INPUT_HINT
              : mode === "filter"
                ? FILTER_HINT
                : focus === "logs"
                  ? LOG_HINT
                  : focus === "worktree"
                    ? worktreeHint(onTrunk, hasStaged)
                    : focus === "files"
                      ? filesCollapsed
                        ? FILES_COLLAPSED_HINT
                        : FILES_HINT
                      : errorDetail
                        ? [["e", "error details"], ...normalHint(!!selBranch?.isTrunk)]
                        : normalHint(!!selBranch?.isTrunk)
          }
        />
      </Box>
    </Box>
  );
}
