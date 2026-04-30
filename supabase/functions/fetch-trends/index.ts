import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const CACHE_TTL_HOURS = 5;
const BATCH_SIZE = 35; // ~5 per category × 7 categories
const MAX_TRENDS_PER_LANG = 200;

const CATEGORIES = [
  "social-media",
  "ecommerce",
  "lifestyle",
  "business",
  "finance",
  "motivation",
];

const PLATFORMS = ["instagram", "tiktok", "youtube", "linkedin", "twitter", "pinterest"];

// ─── Localized Prompts ───

function getPrompt(lang: string) {
  const catList = CATEGORIES.join(", ");
  const platList = PLATFORMS.join(", ");

  if (lang === "de") {
    return {
      systemPrompt: `Du bist ein KI-Trendradar-Experte für Social-Media-Marketing, E-Commerce und Content Creation.

REGELN:
- Antworte NUR mit einem JSON-Array, kein Markdown
- Alle Inhalte auf DEUTSCH
- Nur AKTUELLE Trends der letzten 7 Tage
- Jeder Trend braucht eine konkrete, actionable Beschreibung`,
      userPrompt: `Finde ${BATCH_SIZE} aktuelle Social-Media- und Content-Trends.

Kategorien: ${catList}
Plattformen: ${platList}

WICHTIG: Mindestens 5 Trends pro Kategorie. Verteile gleichmäßig.

Pro Trend liefere:
- name: Trendname mit Hashtag (z.B. "#KIContentBoom"), DEUTSCH, max 60 Zeichen
- description: Kurze Beschreibung was der Trend ist (2 Sätze), DEUTSCH
- platform: Eine der Plattformen oben
- category: Eine der Kategorien oben
- trend_type: "content" | "strategy" | "product" | "format"
- popularity_index: Zahl 60-98 (wie viral/relevant)
- hook: Ein konkreter Hook-Satz für Content zu diesem Trend (DEUTSCH)
- ai_tip: Konkreter Tipp zur Umsetzung (DEUTSCH)
- estimated_virality: "high" | "very high" | "medium"
- image_keywords: 3-4 englische Wörter für ein professionelles Stockfoto (z.B. "woman smartphone social media" oder "modern office laptop team"). KEINE abstrakten Begriffe, sondern visuell beschreibende Wörter.
- content_ideas: Array mit 2 Objekten [{title, description, format}]
- hashtags: Array mit 3-4 relevanten Hashtags
- audience_fit: Zielgruppe (kurz, DEUTSCH)

Format: [{"name":"...","description":"...","platform":"...","category":"...","trend_type":"...","popularity_index":85,"hook":"...","ai_tip":"...","estimated_virality":"high","image_keywords":"woman smartphone content","content_ideas":[{"title":"...","description":"...","format":"reel"}],"hashtags":["#..."],"audience_fit":"..."}]`,
    };
  }

  if (lang === "es") {
    return {
      systemPrompt: `Eres un experto en tendencias de redes sociales y marketing digital.

REGLAS:
- Responde SOLO con un array JSON, sin markdown
- Todo el contenido en ESPAÑOL
- Solo tendencias ACTUALES de los últimos 7 días
- Cada tendencia necesita una descripción concreta y accionable`,
      userPrompt: `Encuentra ${BATCH_SIZE} tendencias actuales de redes sociales y contenido.

Categorías: ${catList}
Plataformas: ${platList}

IMPORTANTE: Al menos 5 tendencias por categoría. Distribúyelas equitativamente.

Por tendencia:
- name: Nombre con hashtag (ej. "#IAContenido"), ESPAÑOL, máx 60 chars
- description: Descripción corta (2 frases), ESPAÑOL
- platform: Una de las plataformas
- category: Una de las categorías
- trend_type: "content" | "strategy" | "product" | "format"
- popularity_index: Número 60-98
- hook: Un hook concreto para contenido (ESPAÑOL)
- ai_tip: Consejo de implementación (ESPAÑOL)
- estimated_virality: "high" | "very high" | "medium"
- image_keywords: 3-4 palabras en INGLÉS para foto profesional (ej. "woman smartphone social media")
- content_ideas: Array con 2 objetos [{title, description, format}]
- hashtags: Array con 3-4 hashtags
- audience_fit: Audiencia objetivo (corto, ESPAÑOL)

Formato: [{"name":"...","description":"...","platform":"...","category":"...","trend_type":"...","popularity_index":85,"hook":"...","ai_tip":"...","estimated_virality":"high","image_keywords":"woman smartphone content","content_ideas":[{"title":"...","description":"...","format":"reel"}],"hashtags":["#..."],"audience_fit":"..."}]`,
    };
  }

  // English
  return {
    systemPrompt: `You are an AI trend radar expert for social media marketing, e-commerce, and content creation.

RULES:
- Respond ONLY with a JSON array, no markdown
- All content in ENGLISH
- Only CURRENT trends from the last 7 days
- Each trend needs a concrete, actionable description`,
    userPrompt: `Find ${BATCH_SIZE} current social media and content trends.

Categories: ${catList}
Platforms: ${platList}

IMPORTANT: At least 5 trends per category. Distribute evenly.

Per trend provide:
- name: Trend name with hashtag (e.g. "#AIContentBoom"), max 60 chars
- description: Short description (2 sentences)
- platform: One of the platforms above
- category: One of the categories above
- trend_type: "content" | "strategy" | "product" | "format"
- popularity_index: Number 60-98
- hook: A concrete hook line for content about this trend
- ai_tip: Concrete implementation tip
- estimated_virality: "high" | "very high" | "medium"
- image_keywords: 3-4 English words for a professional stock photo (e.g. "woman smartphone social media" or "modern office laptop team"). NO abstract terms, use visually descriptive words.
- content_ideas: Array with 2 objects [{title, description, format}]
- hashtags: Array with 3-4 hashtags
- audience_fit: Target audience (short)

Format: [{"name":"...","description":"...","platform":"...","category":"...","trend_type":"...","popularity_index":85,"hook":"...","ai_tip":"...","estimated_virality":"high","image_keywords":"woman smartphone content","content_ideas":[{"title":"...","description":"...","format":"reel"}],"hashtags":["#..."],"audience_fit":"..."}]`,
  };
}

// ─── Pexels Image Search ───

async function searchPexelsImage(query: string, pexelsApiKey: string): Promise<string | null> {
  try {
    const clean = query.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    if (!clean) return null;

    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(clean)}&per_page=5&orientation=landscape`,
      { headers: { Authorization: pexelsApiKey } }
    );

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.photos?.length) return null;

    // Pick best landscape photo
    const best = data.photos.reduce((a: any, b: any) => {
      const aScore = a.width / Math.max(a.height, 1);
      const bScore = b.width / Math.max(b.height, 1);
      return bScore > aScore ? b : a;
    });
    return best.src.large || best.src.medium;
  } catch {
    return null;
  }
}

// Category fallback keywords for image search
const CATEGORY_IMAGE_FALLBACK: Record<string, string> = {
  "social-media": "smartphone social media content creator",
  "ecommerce": "online shopping product packaging",
  "lifestyle": "wellness healthy living aesthetic",
  "business": "modern office professional workspace",
  "finance": "investment charts money desk",
  "motivation": "success person sunrise mountains",
};

async function enrichTrendsWithImages(trends: any[], pexelsApiKey: string): Promise<any[]> {
  console.log(`Enriching ${trends.length} trends with Pexels images...`);
  const enriched = [...trends];
  const batchSize = 8;

  for (let i = 0; i < enriched.length; i += batchSize) {
    const batch = enriched.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (trend) => {
        // Use AI-provided image_keywords first, fallback to category
        const keywords = trend.data_json?.image_keywords || CATEGORY_IMAGE_FALLBACK[trend.category] || trend.name;
        let url = await searchPexelsImage(keywords, pexelsApiKey);
        // Fallback to category if keywords fail
        if (!url && CATEGORY_IMAGE_FALLBACK[trend.category]) {
          url = await searchPexelsImage(CATEGORY_IMAGE_FALLBACK[trend.category], pexelsApiKey);
        }
        return url;
      })
    );

    results.forEach((result, j) => {
      const idx = i + j;
      if (result.status === "fulfilled" && result.value) {
        enriched[idx] = {
          ...enriched[idx],
          data_json: {
            ...enriched[idx].data_json,
            image_url: result.value,
          },
        };
      }
    });

    if (i + batchSize < enriched.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const withImages = enriched.filter((t) => t.data_json?.image_url).length;
  console.log(`Enriched ${withImages}/${enriched.length} trends with images`);
  return enriched;
}

// ─── Minimal Fallback Trends (only used if API fails) ───

function getFallbackTrends(lang: string): any[] {
  const fallbacks = [
    { name: "#AIContentBoom", description: "AI-powered content creation tools are transforming how creators produce high-quality posts.", platform: "instagram", category: "social-media", trend_type: "content", popularity_index: 92, image_keywords: "woman laptop creative workspace" },
    { name: "#ShortFormVideo", description: "Under-60-second videos continue to dominate engagement across all platforms.", platform: "tiktok", category: "social-media", trend_type: "format", popularity_index: 95, image_keywords: "person filming smartphone tripod" },
    { name: "#SocialCommerce", description: "Direct shopping through social media feeds is redefining e-commerce conversion.", platform: "instagram", category: "ecommerce", trend_type: "strategy", popularity_index: 88, image_keywords: "online shopping smartphone product" },
    { name: "#MindfulContent", description: "Wellness-focused content that promotes mental health awareness is resonating.", platform: "youtube", category: "lifestyle", trend_type: "content", popularity_index: 82, image_keywords: "meditation nature peaceful person" },
    { name: "#PersonalBranding", description: "Building authentic personal brands on LinkedIn drives business growth.", platform: "linkedin", category: "business", trend_type: "strategy", popularity_index: 86, image_keywords: "professional headshot modern office" },
    { name: "#CryptoEducation", description: "Financial literacy content about crypto and investing is growing rapidly.", platform: "youtube", category: "finance", trend_type: "content", popularity_index: 78, image_keywords: "finance charts investment desk" },
    { name: "#MorningRoutine", description: "Sharing productive morning routines as motivational content.", platform: "tiktok", category: "motivation", trend_type: "content", popularity_index: 84, image_keywords: "sunrise person workout morning" },
    { name: "#UGCCreator", description: "User-generated content creators are in high demand from brands.", platform: "tiktok", category: "ecommerce", trend_type: "strategy", popularity_index: 90, image_keywords: "content creator filming product" },
    { name: "#LinkedInCarousel", description: "Multi-slide carousels on LinkedIn generate highest engagement.", platform: "linkedin", category: "business", trend_type: "format", popularity_index: 85, image_keywords: "business presentation slides desk" },
    { name: "#GratitudeJournal", description: "Sharing daily gratitude practices builds authentic communities.", platform: "instagram", category: "motivation", trend_type: "content", popularity_index: 76, image_keywords: "journal writing coffee morning" },
  ];

  return fallbacks.map((t, i) => ({
    id: crypto.randomUUID(),
    name: t.name,
    description: t.description,
    platform: t.platform,
    category: t.category,
    trend_type: t.trend_type,
    popularity_index: t.popularity_index,
    language: lang,
    region: "global",
    data_json: {
      hook: t.description,
      ai_tip: "Create authentic content around this trend.",
      estimated_virality: "high",
      image_keywords: t.image_keywords,
      content_ideas: [{ title: "Quick Take", description: "Share your perspective", format: "reel" }],
      hashtags: [t.name],
      audience_fit: "Content creators",
    },
  }));
}

// ─── Main Handler ───

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Input validation
    const requestSchema = z.object({
      language: z.string().regex(/^[a-z]{2}$/).optional().default("en"),
      platform: z.string().max(50).optional().nullable(),
      category: z.string().max(100).optional().nullable(),
      force: z.boolean().optional().default(false),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: validation.error.issues }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { language, platform, category, force } = validation.data;
    console.log(`[trends] lang=${language} force=${force} platform=${platform} category=${category}`);

    // ─── Cache Check ───
    if (!force) {
      const { data: latestTrend } = await supabase
        .from("trend_entries")
        .select("created_at")
        .eq("language", language)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestTrend) {
        const hoursSince = (Date.now() - new Date(latestTrend.created_at).getTime()) / (1000 * 60 * 60);
        if (hoursSince < CACHE_TTL_HOURS) {
          console.log(`[trends] Cache hit (${hoursSince.toFixed(1)}h old)`);

          // Return from DB
          let query = supabase
            .from("trend_entries")
            .select("*")
            .eq("language", language)
            .order("popularity_index", { ascending: false });

          if (platform && platform !== "all") query = query.eq("platform", platform);
          if (category && category !== "all") query = query.eq("category", category);

          const { data: cachedTrends } = await query;
          const trends = cachedTrends || [];

          // Enrich with images if needed
          if (PEXELS_API_KEY) {
            const needsImages = trends.filter((t) => !t.data_json?.image_url);
            if (needsImages.length > 0) {
              const enriched = await enrichTrendsWithImages(trends, PEXELS_API_KEY);
              return new Response(JSON.stringify({ trends: enriched, source: "cache" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }

          return new Response(JSON.stringify({ trends, source: "cache" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // ─── Generate via Perplexity ───
    if (!PERPLEXITY_API_KEY) {
      console.log("[trends] No PERPLEXITY_API_KEY, using fallback");
      const fallback = getFallbackTrends(language);
      // Insert to DB
      const { error: insErr } = await supabase.from("trend_entries").insert(
        fallback.map((t) => ({
          name: t.name,
          description: t.description,
          category: t.category,
          platform: t.platform,
          popularity_index: t.popularity_index,
          language: t.language,
          region: t.region,
          trend_type: t.trend_type,
          data_json: t.data_json,
        }))
      );
      if (insErr) console.error("[trends] Fallback insert error:", insErr);

      if (PEXELS_API_KEY) {
        const enriched = await enrichTrendsWithImages(fallback, PEXELS_API_KEY);
        return new Response(JSON.stringify({ trends: enriched, source: "fallback" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ trends: fallback, source: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[trends] Generating via Perplexity...");
    const { systemPrompt, userPrompt } = getPrompt(language);

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 12000,
        search_recency_filter: "week",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[trends] Perplexity error ${response.status}:`, errText);
      // Use fallback
      const fallback = getFallbackTrends(language);
      if (PEXELS_API_KEY) {
        const enriched = await enrichTrendsWithImages(fallback, PEXELS_API_KEY);
        return new Response(JSON.stringify({ trends: enriched, source: "fallback" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ trends: fallback, source: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON
    let rawTrends: any[];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error("[trends] No JSON found:", content.slice(0, 500));
        throw new Error("No JSON array in response");
      }
      rawTrends = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("[trends] Parse fail:", content.slice(0, 500));
      const fallback = getFallbackTrends(language);
      if (PEXELS_API_KEY) {
        const enriched = await enrichTrendsWithImages(fallback, PEXELS_API_KEY);
        return new Response(JSON.stringify({ trends: enriched, source: "fallback" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ trends: fallback, source: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[trends] Got ${rawTrends.length} trends from Perplexity`);

    // Validate and transform
    const validCategories = new Set(CATEGORIES);
    const validPlatforms = new Set(PLATFORMS);

    const validTrends = rawTrends
      .filter((t: any) => {
        if (!t.name || !t.description || !t.platform || !t.category) return false;
        if (!validCategories.has(t.category)) return false;
        if (!validPlatforms.has(t.platform)) return false;
        return true;
      })
      .map((t: any) => ({
        name: (t.name || "").slice(0, 100),
        description: (t.description || "").slice(0, 500),
        platform: t.platform,
        category: t.category,
        trend_type: t.trend_type || "content",
        popularity_index: Math.min(98, Math.max(50, t.popularity_index || 75)),
        language,
        region: "global",
        data_json: {
          hook: t.hook || t.description,
          ai_tip: t.ai_tip || "",
          estimated_virality: t.estimated_virality || "high",
          image_keywords: t.image_keywords || "",
          content_ideas: Array.isArray(t.content_ideas) ? t.content_ideas.slice(0, 3) : [],
          hashtags: Array.isArray(t.hashtags) ? t.hashtags.slice(0, 5) : [],
          audience_fit: t.audience_fit || "",
        },
      }));

    console.log(`[trends] ${validTrends.length} valid after filter`);

    if (validTrends.length === 0) {
      const fallback = getFallbackTrends(language);
      return new Response(JSON.stringify({ trends: fallback, source: "fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete old trends for this language, then insert new
    const { error: delErr } = await supabase
      .from("trend_entries")
      .delete()
      .eq("language", language);

    if (delErr) console.error("[trends] Delete error:", delErr);

    const { data: inserted, error: insErr } = await supabase
      .from("trend_entries")
      .insert(validTrends)
      .select();

    if (insErr) {
      console.error("[trends] Insert error:", insErr);
    } else {
      console.log(`[trends] Inserted ${inserted?.length} trends for ${language}`);
    }

    // Use inserted data (with DB-generated IDs) for response
    const trendResults = inserted || validTrends;

    // Enrich with images
    if (PEXELS_API_KEY) {
      const enriched = await enrichTrendsWithImages(trendResults, PEXELS_API_KEY);

      // Apply filters
      let filtered = enriched;
      if (platform && platform !== "all") filtered = filtered.filter((t) => t.platform === platform);
      if (category && category !== "all") filtered = filtered.filter((t) => t.category === category);

      return new Response(JSON.stringify({ trends: filtered, source: "generated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apply filters
    let filtered = trendResults;
    if (platform && platform !== "all") filtered = filtered.filter((t: any) => t.platform === platform);
    if (category && category !== "all") filtered = filtered.filter((t: any) => t.category === category);

    return new Response(JSON.stringify({ trends: filtered, source: "generated" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[trends] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch trends" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
