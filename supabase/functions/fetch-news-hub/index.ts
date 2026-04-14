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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) {
      throw new Error("PERPLEXITY_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if last batch is less than CACHE_TTL_HOURS old
    const { data: latestArticle } = await supabase
      .from("news_hub_articles")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestArticle) {
      const lastFetchTime = new Date(latestArticle.created_at).getTime();
      const hoursSinceLastFetch = (Date.now() - lastFetchTime) / (1000 * 60 * 60);
      if (hoursSinceLastFetch < CACHE_TTL_HOURS) {
        return new Response(
          JSON.stringify({ status: "cached", message: `Last fetch was ${hoursSinceLastFetch.toFixed(1)}h ago, skipping.` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get recent headlines for dedup
    const { data: recentArticles } = await supabase
      .from("news_hub_articles")
      .select("headline")
      .order("created_at", { ascending: false })
      .limit(50);

    const existingHeadlines = (recentArticles || []).map((a) => a.headline.toLowerCase());

    const categoryList = CATEGORIES.map((c) => `- ${c.key}: ${c.label}`).join("\n");

    const prompt = `You are a social media industry news analyst. Find ${BATCH_SIZE} of the most important and recent news articles from TODAY or the last 24 hours covering these categories:\n\n${categoryList}\n\nFor each article provide:\n1. A concise headline (max 120 chars)\n2. A detailed summary (2-3 sentences with key facts, numbers, implications)\n3. The category key from the list above\n4. The source name (e.g. "TechCrunch", "Social Media Today")\n5. A source URL if available\n6. An image URL if available (a relevant thumbnail or header image from the article source)\n7. A video URL if available (a relevant YouTube or video link related to the article)\n\nFocus on:\n- Platform algorithm changes, new features, policy updates\n- AI tool launches and updates relevant to marketers\n- Creator monetization news\n- Stock price movements and earnings of Meta, Alphabet, Snap, Pinterest, ByteDance\n- Marketing strategy insights and data-driven trends\n\nReturn ONLY valid JSON array:\n[{"headline":"...","summary":"...","category":"...","source":"...","source_url":"...","image_url":"...or null","video_url":"...or null"}]`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "You are a professional news analyst. Return only valid JSON arrays. No markdown, no explanations. For image_url and video_url, return null if not available." },
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

    // Parse JSON from response
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

    // Filter duplicates and invalid entries
    const newArticles = articles
      .filter((a: any) => {
        if (!a.headline || !a.category) return false;
        if (!validCategories.includes(a.category)) return false;
        if (existingHeadlines.includes(a.headline.toLowerCase())) return false;
        return true;
      })
      .map((a: any) => ({
        headline: a.headline.slice(0, 200),
        summary: a.summary?.slice(0, 500) || null,
        category: a.category,
        source: a.source || null,
        source_url: a.source_url || null,
        image_url: a.image_url && a.image_url !== "null" ? a.image_url : null,
        video_url: a.video_url && a.video_url !== "null" ? a.video_url : null,
        language: "de",
        batch_id: batchId,
        published_at: new Date().toISOString(),
      }));

    if (newArticles.length > 0) {
      const { error: insertError } = await supabase
        .from("news_hub_articles")
        .insert(newArticles);

      if (insertError) {
        throw new Error(`Insert error: ${insertError.message}`);
      }
    }

    // Cleanup: keep only latest MAX_ARTICLES
    const { data: allArticles } = await supabase
      .from("news_hub_articles")
      .select("id")
      .order("published_at", { ascending: false });

    if (allArticles && allArticles.length > MAX_ARTICLES) {
      const idsToDelete = allArticles.slice(MAX_ARTICLES).map((a) => a.id);
      await supabase
        .from("news_hub_articles")
        .delete()
        .in("id", idsToDelete);
    }

    return new Response(
      JSON.stringify({
        status: "success",
        inserted: newArticles.length,
        batch_id: batchId,
      }),
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
