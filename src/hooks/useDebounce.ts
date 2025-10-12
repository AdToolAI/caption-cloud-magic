import { useEffect, useState, useRef } from 'react';

/**
 * Hook to debounce a value
 * Useful for delaying API calls or expensive operations
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for auto-saving data with debouncing
 */
export function useAutoSave<T>(
  data: T,
  saveFn: (data: T) => Promise<void>,
  options: { delay?: number; enabled?: boolean } = {}
) {
  const { delay = 2000, enabled = true } = options;
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const debouncedData = useDebounce(data, delay);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip first render to avoid saving initial data
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (!enabled) return;

    const save = async () => {
      setIsSaving(true);
      setError(null);
      
      try {
        await saveFn(debouncedData);
        setLastSaved(new Date());
      } catch (err) {
        setError(err as Error);
        console.error('Auto-save failed:', err);
      } finally {
        setIsSaving(false);
      }
    };

    save();
  }, [debouncedData, saveFn, enabled]);

  return { isSaving, lastSaved, error };
}