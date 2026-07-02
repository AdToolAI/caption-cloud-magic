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
const DEBOUNCE_MS = 200;

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
  /** Flush any pending debounced snapshot into the history stack synchronously. */
  commit: () => void;
  /** Wipe history — useful when loading a new project. */
  reset: () => void;
  historySize: number;
}

// Cheap structural comparator: for the common shape { scenes: [...], audioTracks: [...] }
// we compare identity, then array lengths, then per-item ids to short-circuit ~99% of
// no-op renders without paying for a full JSON.stringify of 30–100 KB every render.
const cheapEquals = <T>(a: T, b: T): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const aa = a as any;
  const bb = b as any;
  const aKeys = Object.keys(aa);
  const bKeys = Object.keys(bb);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const av = aa[k];
    const bv = bb[k];
    if (av === bv) continue;
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false;
      for (let i = 0; i < av.length; i++) {
        if (av[i] === bv[i]) continue;
        // Different reference — fall back to deep compare for this array only.
        try {
          if (JSON.stringify(av[i]) !== JSON.stringify(bv[i])) return false;
        } catch {
          return false;
        }
      }
    } else {
      try {
        if (JSON.stringify(av) !== JSON.stringify(bv)) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
};

const defaultEquals = <T>(a: T, b: T) => cheapEquals(a, b);

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
  const pendingRef = useRef<T | null>(null); // snapshot waiting to be flushed
  const suppressRef = useRef(false); // true while we're applying an undo/redo

  const flushPending = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (pendingRef.current === null) return;
    const snap = pendingRef.current;
    pendingRef.current = null;
    setPast((p) => {
      const next = [...p, snap];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setFuture([]);
  }, []);

  // Track state changes and schedule a debounced snapshot of the PREVIOUS state.
  useEffect(() => {
    if (!enabled) return;
    if (suppressRef.current) {
      // The change originated from an undo/redo — swallow it.
      suppressRef.current = false;
      currentRef.current = state;
      return;
    }
    if (equals(currentRef.current, state)) return;

    // Preserve the earliest un-flushed "previous" so rapid bursts still commit
    // the state that existed BEFORE the burst started.
    if (pendingRef.current === null) {
      pendingRef.current = currentRef.current;
    }
    currentRef.current = state;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      flushPending();
    }, DEBOUNCE_MS);
    // NOTE: no cleanup — clearing the timer on every re-render would prevent
    // the snapshot from ever landing in `past`.
  }, [state, enabled, equals, flushPending]);

  // Clear timer on unmount only.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const commit = useCallback(() => {
    flushPending();
  }, [flushPending]);

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
