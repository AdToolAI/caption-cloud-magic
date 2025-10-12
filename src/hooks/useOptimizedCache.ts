import { useQuery, useQueryClient, QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';

interface UseOptimizedCacheOptions<T> {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  staleTime?: number;
  cacheTime?: number;
  enabled?: boolean;
  refetchOnMount?: boolean;
  refetchOnWindowFocus?: boolean;
  prefetch?: boolean;
}

export const useOptimizedCache = <T>({
  queryKey,
  queryFn,
  staleTime = 5 * 60 * 1000, // 5 minutes default
  cacheTime = 10 * 60 * 1000, // 10 minutes default
  enabled = true,
  refetchOnMount = false,
  refetchOnWindowFocus = false,
  prefetch = false,
}: UseOptimizedCacheOptions<T>) => {
  const queryClient = useQueryClient();

  // Prefetch data if needed
  useEffect(() => {
    if (prefetch) {
      queryClient.prefetchQuery({
        queryKey,
        queryFn,
        staleTime,
      });
    }
  }, [prefetch, queryClient, queryKey, queryFn, staleTime]);

  const query = useQuery({
    queryKey,
    queryFn,
    staleTime,
    gcTime: cacheTime,
    enabled,
    refetchOnMount,
    refetchOnWindowFocus,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
  };

  const setData = (data: T) => {
    queryClient.setQueryData(queryKey, data);
  };

  return {
    ...query,
    invalidate,
    setData,
  };
};
