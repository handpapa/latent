import { useCallback, useState } from 'react';
import {
  commit,
  createHistory,
  current,
  preview,
  redoStep,
  undoStep,
  type HistoryState,
} from '../core/history';

export interface HistoryApi<T> {
  present: T;
  canUndo: boolean;
  canRedo: boolean;
  /** Records a step; consecutive calls with the same key merge into one. */
  commit: (next: T, key?: string | null) => void;
  /** Shows a value without a step (a running tween). */
  preview: (next: T) => void;
  undo: () => void;
  redo: () => void;
}

export function useHistory<T>(initial: T): HistoryApi<T> {
  const [state, setState] = useState<HistoryState<T>>(() => createHistory(initial));

  const commitNext = useCallback((next: T, key: string | null = null) => {
    setState((history) => commit(history, next, key));
  }, []);

  const previewNext = useCallback((next: T) => {
    setState((history) => preview(history, next));
  }, []);

  const undo = useCallback(() => setState((history) => undoStep(history)), []);
  const redo = useCallback(() => setState((history) => redoStep(history)), []);

  return {
    present: current(state),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit: commitNext,
    preview: previewNext,
    undo,
    redo,
  };
}
