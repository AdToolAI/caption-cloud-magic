import { useState, useCallback, useRef, useEffect } from 'react';

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  staleWhileRevalidate?: boolean;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Hook for caching data with optional TTL and stale-while-revalidate
 */
export function useCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: CacheOptions = {}
) {
  const { ttl = 5 * 60 * 1000, staleWhileRevalidate = true } = options; // Default 5 minutes

  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map());
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const isStale = useCallback((entry: CacheEntry<T>): boolean => {
    return Date.now() - entry.timestamp > ttl;
  }, [ttl]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetchFn();
      
      // Update cache
      cacheRef.current.set(key, {
        data: result,
        timestamp: Date.now(),
      });

      setData(result);
      setLoading(false);
      return result;
    } catch (err) {
      setError(err as Error);
      setLoading(false);
      throw err;
    }
  }, [key, fetchFn]);

  const refresh = useCallback(async () => {
    return fetchData(false);
  }, [fetchData]);

  useEffect(() => {
    const cachedEntry = cacheRef.current.get(key);

    if (cachedEntry) {
      // Return cached data immediately
      setData(cachedEntry.data);
      setLoading(false);

      // Revalidate in background if stale
      if (isStale(cachedEntry) && staleWhileRevalidate) {
        fetchData(true);
      }
    } else {
      // No cache, fetch fresh
      fetchData(false);
    }
  }, [key, fetchData, isStale, staleWhileRevalidate]);

  const clearCache = useCallback(() => {
    cacheRef.current.delete(key);
  }, [key]);

  return {
    data,
    loading,
    error,
    refresh,
    clearCache,
  };
}