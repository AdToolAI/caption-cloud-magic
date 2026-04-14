import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";

export interface NewsItem {
  headline: string;
  category: string;
  source: string;
}

const FALLBACK_NEWS: NewsItem[] = [
  { headline: "📱 Instagram testet neues Creator-Abo-Modell", category: "platform", source: "The Verge" },
  { headline: "💰 TikTok Shop expandiert in neue Märkte", category: "monetization", source: "TechCrunch" },
  { headline: "📊 LinkedIn-Algorithmus priorisiert Kommentare", category: "analytics", source: "Social Media Today" },
  { headline: "🤖 Adobe Firefly bekommt KI-Video-Funktionen", category: "ai_tools", source: "Adobe Blog" },
  { headline: "💬 Meta verbessert Community-Management-Tools", category: "community", source: "Meta Newsroom" },
  { headline: "📱 YouTube Shorts Monetarisierung erreicht 2M+ Creator", category: "monetization", source: "YouTube" },
  { headline: "🤖 Canva launcht KI-Batch-Erstellung", category: "ai_tools", source: "Canva" },
  { headline: "📊 Kurzvideos: 2,5x mehr Engagement als statische Posts", category: "analytics", source: "HubSpot" },
];

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Module-level cache so all consumers share the same data
let cachedNews: NewsItem[] | null = null;
let lastFetchTime = 0;
let fetchPromise: Promise<NewsItem[]> | null = null;

async function fetchNewsFromBackend(language: string): Promise<NewsItem[]> {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-news-radar', {
      body: { language }
    });
    if (error) throw error;
    return data?.news || FALLBACK_NEWS;
  } catch (e) {
    console.error('News Radar: failed to fetch', e);
    return FALLBACK_NEWS;
  }
}

export function useNewsRadar() {
  const { language } = useTranslation();
  const [news, setNews] = useState<NewsItem[]>(cachedNews || []);
  const [loading, setLoading] = useState(!cachedNews);

  const refresh = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && cachedNews && (now - lastFetchTime) < REFRESH_INTERVAL_MS) {
      setNews(cachedNews);
      setLoading(false);
      return;
    }

    // Deduplicate concurrent fetches
    if (!fetchPromise) {
      fetchPromise = fetchNewsFromBackend(language).finally(() => {
        fetchPromise = null;
      });
    }

    setLoading(true);
    const result = await fetchPromise;
    cachedNews = result;
    lastFetchTime = Date.now();
    setNews(result);
    setLoading(false);
  }, [language]);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => refresh(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const topInsight = news.length > 0 ? news[0] : null;

  return { news, loading, topInsight, refresh };
}
