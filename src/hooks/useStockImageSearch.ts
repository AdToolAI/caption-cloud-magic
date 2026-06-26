/**
 * useStockImageSearch — thin wrapper around the `search-stock-images`
 * Edge Function (Pexels + Pixabay, 24h `stock_search_cache` backed).
 * Mirrors the shape of `useStockVideoSearch` for consistency.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface StockImage {
  id: string | number;
  url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  user: { name: string; url: string };
  source: 'pixabay' | 'pexels';
}

export interface StockImageSearchOpts {
  perPage?: number;
}

export function useStockImageSearch() {
  const [results, setResults] = useState<StockImage[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (query: string, opts: StockImageSearchOpts = {}) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-stock-images', {
        body: { query: query.trim(), perPage: opts.perPage ?? 30 },
      });
      if (error) throw error;
      setResults((data?.images ?? []) as StockImage[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Photo-Suche fehlgeschlagen';
      toast({ title: 'Suche fehlgeschlagen', description: message, variant: 'destructive' });
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, search };
}
