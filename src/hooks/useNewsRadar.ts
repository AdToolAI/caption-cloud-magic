import { tx } from "@/lib/i18nText";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureValidSession } from "@/lib/ensureSession";
import { useTranslation } from "@/hooks/useTranslation";

export interface NewsItem {
  headline: string;
  category: string;
  source: string;
}

function getFallbackNews(): NewsItem[] { return [
  { headline: tx({ de: "📱 Instagram testet neues Creator-Abo-Modell", en: "📱 Instagram tests new creator subscription model", es: "📱 Instagram prueba un nuevo modelo de suscripción de creador" }), category: "platform", source: "The Verge" },
  { headline: tx({ de: "💰 TikTok Shop expandiert in neue Märkte", en: "💰 TikTok Shop is expanding into new markets", es: "💰 TikTok Shop se está expandiendo a nuevos mercados" }), category: "monetization", source: "TechCrunch" },
  { headline: tx({ de: "📊 LinkedIn-Algorithmus priorisiert Kommentare", en: "📊 LinkedIn algorithm prioritizes comments", es: "📊 El algoritmo de LinkedIn prioriza los comentarios" }), category: "analytics", source: "Social Media Today" },
  { headline: tx({ de: "🤖 Adobe Firefly bekommt KI-Video-Funktionen", en: "🤖 Adobe Firefly gets AI video features", es: "🤖 Adobe Firefly obtiene funciones de vídeo con IA" }), category: "ai_tools", source: "Adobe Blog" },
  { headline: tx({ de: "💬 Meta verbessert Community-Management-Tools", en: "💬 Meta improves community management tools", es: "💬 Meta mejora las herramientas de gestión comunitaria" }), category: "community", source: "Meta Newsroom" },
  { headline: tx({ de: "📱 YouTube Shorts Monetarisierung erreicht 2M+ Creator", en: "📱 YouTube Shorts monetization reaches 2M+ creators", es: "📱 La monetización de YouTube Shorts llega a más de 2 millones de creadores" }), category: "monetization", source: "YouTube" },
  { headline: tx({ de: "🤖 Canva launcht KI-Batch-Erstellung", en: "🤖 Canva launches AI batch creation", es: "🤖 Canva lanza la creación de lotes de IA" }), category: "ai_tools", source: "Canva" },
  { headline: tx({ de: "📊 Kurzvideos: 2,5x mehr Engagement als statische Posts", en: "📊 Short videos: 2.5x more engagement than static posts", es: "📊 Vídeos cortos: 2,5 veces más participación que las publicaciones estáticas" }), category: "analytics", source: "HubSpot" },
]; }

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Module-level cache so all consumers share the same data
let cachedNews: NewsItem[] | null = null;
let cachedLanguage: string | null = null;
let lastFetchTime = 0;
let fetchPromise: Promise<NewsItem[]> | null = null;

async function fetchNewsFromBackend(language: string): Promise<NewsItem[]> {
  try {
    const session = await ensureValidSession();
    if (!session) return getFallbackNews();

    const { data, error } = await supabase.functions.invoke('fetch-news-radar', {
      body: { language }
    });
    if (error) throw error;
    return data?.news || getFallbackNews();
  } catch (e) {
    console.warn('News Radar: failed to fetch', e);
    return getFallbackNews();
  }
}


export function useNewsRadar() {
  const { language } = useTranslation();
  const [news, setNews] = useState<NewsItem[]>(cachedNews && cachedLanguage === language ? cachedNews : []);
  const [loading, setLoading] = useState(!(cachedNews && cachedLanguage === language));

  const refresh = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && cachedNews && cachedLanguage === language && (now - lastFetchTime) < REFRESH_INTERVAL_MS) {
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
    cachedLanguage = language;
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
