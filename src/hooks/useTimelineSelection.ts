import { useCallback, useMemo, useState } from 'react';

/**
 * Welle 6 — Multi-Select for Timeline Clips / Scenes.
 *
 * A single-source-of-truth for which clips + scenes are selected on the
 * timeline. Supports:
 *   - Single click (replace selection)
 *   - Ctrl/Cmd click (toggle in selection)
 *   - Shift click (range-select via a `range` helper: consumer supplies the
 *     ordered ID list and this hook fills in the range)
 *   - Rubber-band selection (`setBatch`)
 */

export type SelectionKind = 'clip' | 'scene' | 'subtitle';

export interface TimelineSelectionApi {
  /** Multi-selected clip IDs (audio + video). */
  selectedClipIds: Set<string>;
  /** Multi-selected scene IDs. */
  selectedSceneIds: Set<string>;
  /** True if at least 2 items are selected. */
  isMultiSelecting: boolean;
  /** Total selection count. */
  count: number;

  /** Handle a click. If ctrl/meta held → toggle; shift held → range within `orderedIds`. */
  handleClick: (
    id: string,
    kind: SelectionKind,
    event?: {
      shiftKey?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
    },
    orderedIds?: string[],
  ) => void;

  /** Bulk replace (used by rubber-band). */
  setBatch: (clipIds: string[], sceneIds: string[]) => void;

  /** Clear all. */
  clear: () => void;

  /** Boolean lookup helpers. */
  isSelected: (id: string, kind: SelectionKind) => boolean;
}

export function useTimelineSelection(): TimelineSelectionApi {
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());
  const [lastAnchor, setLastAnchor] = useState<{ id: string; kind: SelectionKind } | null>(null);

  const handleClick = useCallback<TimelineSelectionApi['handleClick']>(
    (id, kind, event, orderedIds) => {
      const multiToggle = event?.ctrlKey || event?.metaKey;
      const range = event?.shiftKey && lastAnchor && lastAnchor.kind === kind && orderedIds;

      const setter = kind === 'scene' ? setSelectedSceneIds : setSelectedClipIds;
      const otherSetter = kind === 'scene' ? setSelectedClipIds : setSelectedSceneIds;

      if (range && orderedIds) {
        const startIdx = orderedIds.indexOf(lastAnchor!.id);
        const endIdx = orderedIds.indexOf(id);
        if (startIdx >= 0 && endIdx >= 0) {
          const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          const slice = orderedIds.slice(lo, hi + 1);
          setter(new Set(slice));
          otherSetter(new Set());
          return;
        }
      }

      if (multiToggle) {
        setter((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        setLastAnchor({ id, kind });
        return;
      }

      // Single click → replace selection.
      setter(new Set([id]));
      otherSetter(new Set());
      setLastAnchor({ id, kind });
    },
    [lastAnchor],
  );

  const setBatch = useCallback((clipIds: string[], sceneIds: string[]) => {
    setSelectedClipIds(new Set(clipIds));
    setSelectedSceneIds(new Set(sceneIds));
  }, []);

  const clear = useCallback(() => {
    setSelectedClipIds(new Set());
    setSelectedSceneIds(new Set());
    setLastAnchor(null);
  }, []);

  const isSelected = useCallback<TimelineSelectionApi['isSelected']>(
    (id, kind) => {
      if (kind === 'scene') return selectedSceneIds.has(id);
      if (kind === 'clip') return selectedClipIds.has(id);
      return false;
    },
    [selectedClipIds, selectedSceneIds],
  );

  const count = selectedClipIds.size + selectedSceneIds.size;

  return useMemo(
    () => ({
      selectedClipIds,
      selectedSceneIds,
      isMultiSelecting: count > 1,
      count,
      handleClick,
      setBatch,
      clear,
      isSelected,
    }),
    [selectedClipIds, selectedSceneIds, count, handleClick, setBatch, clear, isSelected],
  );
}
