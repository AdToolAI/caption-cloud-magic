import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NewsArticle {
  id: string;
  headline: string;
  summary: string | null;
  category: string;
  source: string | null;
  source_url: string | null;
  published_at: string;
  created_at: string;
}

const PAGE_SIZE = 10;

export function useNewsHub() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchArticles = useCallback(async (reset = false) => {
    const currentPage = reset ? 0 : page;
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("news_hub_articles")
      .select("*")
      .order("published_at", { ascending: false })
      .range(from, to);

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching news:", error);
      setLoading(false);
      return;
    }

    const fetched = (data || []) as NewsArticle[];
    setHasMore(fetched.length === PAGE_SIZE);

    if (reset) {
      setArticles(fetched);
      setPage(0);
    } else {
      setArticles((prev) => [...prev, ...fetched]);
    }
    setLoading(false);
  }, [category, page]);

  // Initial load + category change
  useEffect(() => {
    setLoading(true);
    setArticles([]);
    setPage(0);
    setHasMore(true);
    fetchArticles(true);
  }, [category]);

  // Load more
  const loadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  useEffect(() => {
    if (page > 0) {
      fetchArticles(false);
    }
  }, [page]);

  // Trigger edge function to refresh news
  const refreshNews = useCallback(async () => {
    setRefreshing(true);
    try {
      await supabase.functions.invoke("fetch-news-hub");
      // Reload articles
      setPage(0);
      await fetchArticles(true);
    } catch (e) {
      console.error("Error refreshing news:", e);
    } finally {
      setRefreshing(false);
    }
  }, [category]);

  return {
    articles,
    loading,
    refreshing,
    category,
    setCategory,
    loadMore,
    hasMore,
    refreshNews,
  };
}
