import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Welle 6 — Editor History (Undo / Redo)
 *
 * Snapshot-based history for the Universal Cut / Director's Cut editor.
 * Watches an arbitrary state object (typically { scenes, audioTracks }) and
 * pushes debounced snapshots into a `past` stack. `undo()` pops the current
 * state back onto `future` and rehydrates the previous snapshot via
 * `onRestore`. Redo is the inverse.
 */

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 350;

export interface EditorHistoryOptions<T> {
  /** Current state to track. */
  state: T;
  /** Called with a past snapshot when the user hits undo/redo. */
  onRestore: (snapshot: T) => void;
  /** Optional guard — return false to skip snapshotting (e.g. while rendering). */
  enabled?: boolean;
  /** Custom equality (default: JSON.stringify). */
  equals?: (a: T, b: T) => boolean;
}

export interface EditorHistoryApi {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Force a snapshot immediately (bypasses debounce). */
  commit: () => void;
  /** Wipe history — useful when loading a new project. */
  reset: () => void;
  historySize: number;
}

const defaultEquals = <T>(a: T, b: T) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
};

export function useEditorHistory<T>({
  state,
  onRestore,
  enabled = true,
  equals = defaultEquals,
}: EditorHistoryOptions<T>): EditorHistoryApi {
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);
  const currentRef = useRef<T>(state);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressRef = useRef(false); // true while we're applying an undo/redo

  // Track state changes and push debounced snapshots.
  useEffect(() => {
    if (!enabled) return;
    if (suppressRef.current) {
      // The change originated from an undo/redo — swallow it.
      suppressRef.current = false;
      currentRef.current = state;
      return;
    }
    if (equals(currentRef.current, state)) return;

    const previous = currentRef.current;
    currentRef.current = state;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPast((p) => {
        const next = [...p, previous];
        if (next.length > MAX_HISTORY) next.shift();
        return next;
      });
      setFuture([]);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [state, enabled, equals]);

  const commit = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      const rest = p.slice(0, -1);
      setFuture((f) => [currentRef.current, ...f].slice(0, MAX_HISTORY));
      suppressRef.current = true;
      currentRef.current = previous;
      onRestore(previous);
      return rest;
    });
  }, [onRestore]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const [next, ...rest] = f;
      setPast((p) => {
        const merged = [...p, currentRef.current];
        if (merged.length > MAX_HISTORY) merged.shift();
        return merged;
      });
      suppressRef.current = true;
      currentRef.current = next;
      onRestore(next);
      return rest;
    });
  }, [onRestore]);

  const reset = useCallback(() => {
    setPast([]);
    setFuture([]);
    currentRef.current = state;
  }, [state]);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    commit,
    reset,
    historySize: past.length,
  };
}
