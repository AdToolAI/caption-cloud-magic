import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarFilters,
  EMPTY_FILTERS,
  applyFilters,
  countActiveFilters,
  deriveFilterOptions,
  FilterableEvent,
} from '@/lib/calendar/filter-engine';

export interface SavedFilter {
  id: string;
  name: string;
  filters: CalendarFilters;
  createdAt: number;
}

const STORAGE_KEY = 'calendar.filters.v1';
const SAVED_KEY = 'calendar.savedFilters.v1';
const MAX_SAVED = 5;

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

function loadArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function useCalendarFilters<T extends FilterableEvent>(
  events: T[],
  scopeKey: string | null
) {
  const fullKey = scopeKey ? `${STORAGE_KEY}:${scopeKey}` : STORAGE_KEY;
  const savedKey = scopeKey ? `${SAVED_KEY}:${scopeKey}` : SAVED_KEY;

  const [filters, setFilters] = useState<CalendarFilters>(() =>
    loadJSON<CalendarFilters>(fullKey, EMPTY_FILTERS)
  );
  const [saved, setSaved] = useState<SavedFilter[]>(() => loadArray<SavedFilter>(savedKey));

  // Reload when scope changes
  useEffect(() => {
    setFilters(loadJSON<CalendarFilters>(fullKey, EMPTY_FILTERS));
    setSaved(loadArray<SavedFilter>(savedKey));
  }, [fullKey, savedKey]);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(filters));
    } catch {}
  }, [filters, fullKey]);

  useEffect(() => {
    try {
      localStorage.setItem(savedKey, JSON.stringify(saved));
    } catch {}
  }, [saved, savedKey]);

  const update = useCallback(<K extends keyof CalendarFilters>(key: K, value: CalendarFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggle = useCallback(
    (key: 'statuses' | 'channels' | 'owners' | 'tags' | 'mediaTypes', value: string) => {
      setFilters((prev) => {
        const arr = (prev[key] as string[]) ?? [];
        const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
        return { ...prev, [key]: next as any };
      });
    },
    []
  );

  const reset = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const applyPreset = useCallback((patch: Partial<CalendarFilters>) => {
    setFilters({ ...EMPTY_FILTERS, ...patch });
  }, []);

  const filteredEvents = useMemo(() => applyFilters(events, filters), [events, filters]);
  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);
  const options = useMemo(() => deriveFilterOptions(events), [events]);

  const saveCurrent = useCallback(
    (name: string) => {
      setSaved((prev) => {
        const next: SavedFilter = {
          id: `sf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: name.trim() || `Filter ${prev.length + 1}`,
          filters,
          createdAt: Date.now(),
        };
        return [next, ...prev].slice(0, MAX_SAVED);
      });
    },
    [filters]
  );

  const loadSaved = useCallback((id: string) => {
    setSaved((prev) => {
      const hit = prev.find((s) => s.id === id);
      if (hit) setFilters(hit.filters);
      return prev;
    });
  }, []);

  const deleteSaved = useCallback((id: string) => {
    setSaved((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return {
    filters,
    setFilters,
    update,
    toggle,
    reset,
    applyPreset,
    filteredEvents,
    activeCount,
    options,
    saved,
    saveCurrent,
    loadSaved,
    deleteSaved,
  };
}
