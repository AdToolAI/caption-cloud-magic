import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface StockVideoFilters {
  orientation?: "landscape" | "portrait" | "square";
  min_quality?: "hd" | "4k";
  min_fps?: number;
  max_duration?: number;
  min_duration?: number;
}

export interface StockVideoFile {
  quality: string;
  width: number;
  height: number;
  fps?: number;
  url: string;
}

export interface StockVideo {
  id: string;
  provider: "pexels" | "pixabay";
  external_id: string;
  title: string;
  thumbnail: string;
  preview_url: string;
  download_url: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  orientation: "landscape" | "portrait" | "square";
  tags: string[];
  photographer: string;
  source_url: string;
  video_files: StockVideoFile[];
  is_4k: boolean;
  is_hd: boolean;
  is_vertical: boolean;
  is_slowmo: boolean;
  quality_score: number;
}

export function useStockVideoSearch() {
  const [results, setResults] = useState<StockVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const search = useCallback(async (query: string, filters: StockVideoFilters = {}, limit = 30) => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-stock-videos", {
        body: { query, ...filters, limit },
      });
      if (error) throw error;
      if (id !== seq.current) return; // stale
      setResults((data?.results ?? []) as StockVideo[]);
    } catch (err) {
      console.error("[useStockVideoSearch]", err);
      toast({ title: "Suche fehlgeschlagen", description: (err as Error).message, variant: "destructive" });
      if (id === seq.current) setResults([]);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    search("cinematic", { min_quality: "hd" });
  }, [search]);

  return { results, loading, search };
}
