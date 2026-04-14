import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CACHE_TTL_HOURS = 4;
const MAX_ARTICLES = 200;
const BATCH_SIZE = 14;

const CATEGORIES = [
  { key: "platform", label: "Social Media Platform Updates" },
  { key: "ai_tools", label: "AI Tools & Marketing Automation" },
  { key: "analytics", label: "Analytics & Data Insights" },
  { key: "monetization", label: "Creator Economy & Monetization" },
  { key: "community", label: "Community Management & Engagement" },
  { key: "business_finance", label: "Tech Company Financials, Stock Forecasts & Market Analysis (Meta, Alphabet, Snap, Pinterest, TikTok/ByteDance)" },
  { key: "strategy", label: "Digital Marketing Strategy & Growth Tactics" },
];

async function fetchPexelsImage(query: string, apiKey: string): Promise<string | null> {
  try {
    // Extract 2-3 key visual words from headline
    const keywords = query
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3)
      .join(" ");

    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(keywords)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: apiKey } }
    );

    if (!res.ok) return null;
    const data = await res.json();
    return data.photos?.[0]?.src?.landscape || data.photos?.[0]?.src?.large || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) throw new Error("PERPLEXITY_API_KEY is not configured");

    const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check cache
    const { data: latestArticle } = await supabase
      .from("news_hub_articles")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestArticle) {
      const hoursSince = (Date.now() - new Date(latestArticle.created_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < CACHE_TTL_HOURS) {
        // Even if cached, backfill images for articles missing them
        if (PEXELS_API_KEY) {
          const { data: noImage } = await supabase
            .from("news_hub_articles")
            .select("id, headline")
            .is("image_url", null)
            .order("published_at", { ascending: false })
            .limit(10);

          if (noImage && noImage.length > 0) {
            for (const art of noImage) {
              const imgUrl = await fetchPexelsImage(art.headline, PEXELS_API_KEY);
              if (imgUrl) {
                await supabase.from("news_hub_articles").update({ image_url: imgUrl }).eq("id", art.id);
              }
            }
          }
        }

        return new Response(
          JSON.stringify({ status: "cached", message: `Last fetch was ${hoursSince.toFixed(1)}h ago, skipping.` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Dedup
    const { data: recentArticles } = await supabase
      .from("news_hub_articles")
      .select("headline")
      .order("created_at", { ascending: false })
      .limit(50);

    const existingHeadlines = (recentArticles || []).map((a) => a.headline.toLowerCase());

    const categoryList = CATEGORIES.map((c) => `- ${c.key}: ${c.label}`).join("\n");

    const prompt = `You are a social media industry news analyst. Find ${BATCH_SIZE} of the most important and recent news articles from TODAY or the last 24 hours covering these categories:\n\n${categoryList}\n\nFor each article provide:\n1. A concise headline (max 120 chars)\n2. A detailed summary (2-3 sentences with key facts, numbers, implications)\n3. The category key from the list above\n4. The source name (e.g. "TechCrunch", "Social Media Today")\n5. The FULL source URL — must be a complete, working article URL (e.g. "https://techcrunch.com/2026/04/14/article-title"), NOT just a domain root\n\nIMPORTANT: source_url MUST be full article URLs, not domain homepages. If you cannot find the exact URL, use the citation URL from your sources.\n\nFocus on:\n- Platform algorithm changes, new features, policy updates\n- AI tool launches and updates relevant to marketers\n- Creator monetization news\n- Stock price movements and earnings of Meta, Alphabet, Snap, Pinterest, ByteDance\n- Marketing strategy insights and data-driven trends\n\nReturn ONLY valid JSON array:\n[{"headline":"...","summary":"...","category":"...","source":"...","source_url":"https://full-article-url.com/path/to/article"}]`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "You are a professional news analyst. Return only valid JSON arrays. No markdown, no explanations. source_url MUST be full article URLs, never domain roots." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 5000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity API error [${response.status}]: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations: string[] = data.citations || [];

    // Parse JSON
    let articles: any[];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array found");
      articles = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Failed to parse response:", content);
      throw new Error("Failed to parse Perplexity response as JSON");
    }

    const batchId = crypto.randomUUID();
    const validCategories = CATEGORIES.map((c) => c.key);

    // Filter duplicates and invalid
    const filteredArticles = articles.filter((a: any) => {
      if (!a.headline || !a.category) return false;
      if (!validCategories.includes(a.category)) return false;
      if (existingHeadlines.includes(a.headline.toLowerCase())) return false;
      return true;
    });

    // Enrich with Pexels images and YouTube search links
    const newArticles = [];
    for (let i = 0; i < filteredArticles.length; i++) {
      const a = filteredArticles[i];

      // Fix source_url: use citations as fallback if URL looks like a domain root
      let sourceUrl = a.source_url || null;
      if (sourceUrl) {
        try {
          const parsed = new URL(sourceUrl);
          // If it's just a domain root (path is "/" or empty), try citations
          if (parsed.pathname === "/" || parsed.pathname === "") {
            if (citations[i]) sourceUrl = citations[i];
          }
        } catch {
          if (citations[i]) sourceUrl = citations[i];
        }
      } else if (citations[i]) {
        sourceUrl = citations[i];
      }

      // Fetch Pexels image
      let imageUrl: string | null = null;
      if (PEXELS_API_KEY) {
        imageUrl = await fetchPexelsImage(a.headline, PEXELS_API_KEY);
      }

      // Generate YouTube search link
      const videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(a.headline)}`;

      newArticles.push({
        headline: a.headline.slice(0, 200),
        summary: a.summary?.slice(0, 500) || null,
        category: a.category,
        source: a.source || null,
        source_url: sourceUrl,
        image_url: imageUrl,
        video_url: videoUrl,
        language: "de",
        batch_id: batchId,
        published_at: new Date().toISOString(),
      });
    }

    if (newArticles.length > 0) {
      const { error: insertError } = await supabase
        .from("news_hub_articles")
        .insert(newArticles);

      if (insertError) throw new Error(`Insert error: ${insertError.message}`);
    }

    // Cleanup
    const { data: allArticles } = await supabase
      .from("news_hub_articles")
      .select("id")
      .order("published_at", { ascending: false });

    if (allArticles && allArticles.length > MAX_ARTICLES) {
      const idsToDelete = allArticles.slice(MAX_ARTICLES).map((a) => a.id);
      await supabase.from("news_hub_articles").delete().in("id", idsToDelete);
    }

    return new Response(
      JSON.stringify({ status: "success", inserted: newArticles.length, batch_id: batchId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-news-hub error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
