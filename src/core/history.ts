/**
 * Undo for an immutable document. Snapshots share structure — a change to one
 * parameter produces one new object and reuses the rest — so 100 steps of a
 * 30-control edit cost kilobytes, not megabytes.
 */
export interface HistoryState<T> {
  past: readonly T[];
  /** The last committed value — what undo returns to. */
  present: T;
  future: readonly T[];
  /** A value shown while a tween runs. Never recorded, never in . */
  view: T | null;
  /** Identifies the control being dragged, so one gesture is one step. */
  lastKey: string | null;
  lastAt: number;
}

export const MAX_DEPTH = 100;
/** Two changes to the same control within this window are one gesture. */
export const COALESCE_MS = 700;

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], present: initial, future: [], view: null, lastKey: null, lastAt: 0 };
}

export function commit<T>(
  history: HistoryState<T>,
  next: T,
  key: string | null = null,
  now: number = Date.now(),
): HistoryState<T> {
  if (next === history.present) return history;

  const continues =
    key !== null &&
    key === history.lastKey &&
    now - history.lastAt < COALESCE_MS &&
    history.past.length > 0;

  return {
    past: continues ? history.past : [...history.past, history.present].slice(-MAX_DEPTH),
    present: next,
    future: [],
    view: null,
    lastKey: key,
    lastAt: now,
  };
}

/**
 * Shows a value without recording a step — used while a preset tween runs. The
 * committed  is left alone, so the step that follows still lands on
 * the state the user was looking at before the tween started.
 */
export function preview<T>(history: HistoryState<T>, next: T): HistoryState<T> {
  if (next === history.view) return history;
  return { ...history, view: next };
}

/** What the UI paints: the tween's value while one is running, else the document. */
export function current<T>(history: HistoryState<T>): T {
  return history.view ?? history.present;
}

export function undoStep<T>(history: HistoryState<T>): HistoryState<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    view: null,
    lastKey: null,
    lastAt: 0,
  };
}

export function redoStep<T>(history: HistoryState<T>): HistoryState<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present].slice(-MAX_DEPTH),
    present: next,
    future: rest,
    view: null,
    lastKey: null,
    lastAt: 0,
  };
}
