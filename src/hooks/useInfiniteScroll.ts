import { useEffect, useRef, useState, useCallback } from 'react';

interface UseInfiniteScrollOptions {
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
}

export const useInfiniteScroll = (
  callback: () => void | Promise<void>,
  options: UseInfiniteScrollOptions = {}
) => {
  const { threshold = 0.1, rootMargin = '100px', enabled = true } = options;
  const [isLoading, setIsLoading] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);

  const handleIntersection = useCallback(
    async (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      
      if (entry.isIntersecting && enabled && !isLoading) {
        setIsLoading(true);
        try {
          await callback();
        } finally {
          setIsLoading(false);
        }
      }
    },
    [callback, enabled, isLoading]
  );

  useEffect(() => {
    if (!enabled) return;

    observerRef.current = new IntersectionObserver(handleIntersection, {
      threshold,
      rootMargin,
    });

    const currentTarget = targetRef.current;
    if (currentTarget) {
      observerRef.current.observe(currentTarget);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [handleIntersection, threshold, rootMargin, enabled]);

  return { targetRef, isLoading };
};
