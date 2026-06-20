/**
 * Session-scoped log of every command graphite-tui runs on the user's behalf
 * (sync, restack, submit, checkout, delete, open PR/GitHub). Lives at module
 * scope with no React dependency: it's empty on process start and discarded on
 * exit, so "clear on session start/end" needs no extra code.
 *
 * Exposed as an external store (subscribe + getSnapshot) so the UI can render it
 * via React's useSyncExternalStore without threading callbacks through the
 * command-execution layer.
 */

export type LogStatus = "running" | "ok" | "error";

export interface LogEntry {
  id: number;
  /** Human-meaningful command line, e.g. `gt sync --force`. */
  command: string;
  /** Combined stdout+stderr accumulated as the command streams. */
  output: string;
  status: LogStatus;
}

let nextId = 1;
let entries: LogEntry[] = [];
const listeners = new Set<() => void>();

// A burst of stream chunks would otherwise notify (and re-render) once per
// chunk; coalesce onto a microtask so each burst causes a single re-render.
let notifyScheduled = false;
function notify(): void {
  // Snapshot identity must change whenever the data changes (useSyncExternalStore
  // compares by reference), so replace the array on every mutation.
  entries = entries.slice();
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    for (const l of listeners) l();
  });
}

/** Begin a new command entry; returns its id for later append/finish calls. */
export function start(command: string): number {
  const id = nextId++;
  entries = [...entries, { id, command, output: "", status: "running" }];
  notify();
  return id;
}

/** Append streamed output to an entry. No-op if the entry is gone (cleared). */
export function append(id: number, chunk: string): void {
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return;
  const e = entries[idx];
  entries[idx] = { ...e, output: e.output + chunk };
  notify();
}

/** Mark an entry terminal. */
export function finish(id: number, status: "ok" | "error"): void {
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return;
  entries[idx] = { ...entries[idx], status };
  notify();
}

/** Whether an entry has captured any output yet. */
export function hasOutput(id: number): boolean {
  const e = entries.find((x) => x.id === id);
  return !!e && e.output.length > 0;
}

export function clear(): void {
  entries = [];
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): LogEntry[] {
  return entries;
}
