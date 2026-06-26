/**
 * useStockMusicSearch — wrapper around `search-stock-music`
 * (Jamendo, CC-BY, royalty-free). Music is treated separately from
 * AI-Music-Generation (Music Studio) — this is the curated library
 * counterpart of Artlist's flat-rate music bundle.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface StockMusicTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  url: string;
  preview_url: string;
  thumbnail: string;
  genre: string;
  mood: string;
  bpm: number;
  tags: string[];
}

export interface MusicSearchParams {
  query?: string;
  mood?: string;
  genre?: string;
}

export function useStockMusicSearch() {
  const [results, setResults] = useState<StockMusicTrack[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (params: MusicSearchParams) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-stock-music', {
        body: {
          query: params.query ?? '',
          mood: params.mood ?? '',
          genre: params.genre ?? '',
        },
      });
      if (error) throw error;
      setResults((data?.results ?? []) as StockMusicTrack[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Music-Suche fehlgeschlagen';
      toast({ title: 'Suche fehlgeschlagen', description: message, variant: 'destructive' });
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, search };
}
