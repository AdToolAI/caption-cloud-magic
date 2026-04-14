import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CACHE_TTL_HOURS = 4;
const MAX_ARTICLES_PER_LANG = 200;
const BATCH_SIZE = 14;

const CATEGORIES = [
  { key: "platform", label: "Social Media Platform Updates" },
  { key: "ai_tools", label: "AI Tools & Marketing Automation" },
  { key: "analytics", label: "Analytics & Data Insights" },
  { key: "monetization", label: "Creator Economy & Monetization" },
  { key: "community", label: "Community Management & Engagement" },
  { key: "business_finance", label: "Tech Company Financials, Stock Forecasts & Market Analysis" },
  { key: "strategy", label: "Digital Marketing Strategy & Growth Tactics" },
];

// Language-specific source recommendations & prompts
function getLocalizedPromptConfig(lang: string) {
  const categoryList = CATEGORIES.map((c) => `- ${c.key}: ${c.label}`).join("\n");

  if (lang === "de") {
    return {
      systemPrompt: `Du bist ein professioneller Nachrichten-Analyst für Social Media Marketing im deutschsprachigen Raum. Antworte NUR mit einem gültigen JSON-Array. Keine Erklärungen, kein Markdown. source_url MUSS eine vollständige Artikel-URL sein, NIEMALS eine Domain-Root-Seite.`,
      userPrompt: `Finde ${BATCH_SIZE} der wichtigsten und aktuellsten deutschsprachigen Nachrichten-Artikel von HEUTE oder den letzten 24 Stunden zu diesen Kategorien:\n\n${categoryList}\n\nBevorzuge deutschsprachige Quellen wie: t3n, OMR, Horizont, W&V (Werben & Verkaufen), OnlineMarketing.de, AllFacebook.de, Meedia, Absatzwirtschaft, Internet World Business, Golem.de, Heise, CHIP, Gründerszene, deutsche Nachrichtenagenturen.\n\nFür jeden Artikel liefere:\n1. Eine prägnante DEUTSCHE Überschrift (max 120 Zeichen)\n2. Eine detaillierte DEUTSCHE Zusammenfassung (2-3 Sätze mit Fakten, Zahlen, Auswirkungen)\n3. Den category key aus der obigen Liste\n4. Den Quellennamen (z.B. "t3n", "OMR")\n5. Die VOLLSTÄNDIGE Quell-URL — muss eine komplette, funktionierende Artikel-URL sein (z.B. "https://t3n.de/news/artikel-titel-12345/"), NICHT nur die Domain\n\nWICHTIG: Alle Inhalte MÜSSEN auf Deutsch sein. source_url MUSS die direkte URL zum vollständigen Artikel sein.\n\nReturn ONLY valid JSON array:\n[{"headline":"...","summary":"...","category":"...","source":"...","source_url":"https://full-url.de/path/to/article"}]`,
    };
  }

  if (lang === "es") {
    return {
      systemPrompt: `Eres un analista profesional de noticias de marketing en redes sociales para el mercado hispanohablante. Responde SOLO con un array JSON válido. Sin explicaciones, sin markdown. source_url DEBE ser una URL completa del artículo, NUNCA una raíz de dominio.`,
      userPrompt: `Encuentra ${BATCH_SIZE} de las noticias más importantes y recientes en español de HOY o las últimas 24 horas sobre estas categorías:\n\n${categoryList}\n\nPrefiere fuentes en español como: Marketing4eCommerce, Reason Why, PuroMarketing, MarketingDirecto, TreceBits, Merca2.0, Genbeta, Xataka, Hipertextual, El Publicista, IPMARK, Brandemia.\n\nPara cada artículo proporciona:\n1. Un titular conciso EN ESPAÑOL (máx 120 caracteres)\n2. Un resumen detallado EN ESPAÑOL (2-3 frases con datos clave, cifras, implicaciones)\n3. La clave de categoría de la lista anterior\n4. El nombre de la fuente (ej. "Marketing4eCommerce", "Reason Why")\n5. La URL COMPLETA de la fuente — debe ser un enlace directo y funcional al artículo (ej. "https://marketing4ecommerce.net/articulo/"), NO solo el dominio\n\nIMPORTANTE: Todo el contenido DEBE estar en español. source_url DEBE ser el enlace directo al artículo completo.\n\nReturn ONLY valid JSON array:\n[{"headline":"...","summary":"...","category":"...","source":"...","source_url":"https://full-url.es/path/to/article"}]`,
    };
  }

  // English (default)
  return {
    systemPrompt: `You are a professional social media marketing news analyst. Return ONLY valid JSON arrays. No markdown, no explanations. source_url MUST be full article URLs, never domain roots.`,
    userPrompt: `Find ${BATCH_SIZE} of the most important and recent English-language news articles from TODAY or the last 24 hours covering these categories:\n\n${categoryList}\n\nPrefer English-language sources like: TechCrunch, Social Media Today, The Verge, Adweek, Marketing Land, Search Engine Journal, HubSpot Blog, Buffer Blog, Sprout Social Insights, Hootsuite Blog, Later Blog, Mashable, Digiday, AdAge.\n\nFor each article provide:\n1. A concise headline (max 120 chars)\n2. A detailed summary (2-3 sentences with key facts, numbers, implications)\n3. The category key from the list above\n4. The source name (e.g. "TechCrunch", "Social Media Today")\n5. The FULL source URL — must be a complete, working article URL (e.g. "https://techcrunch.com/2026/04/14/article-title"), NOT just a domain root\n\nIMPORTANT: All content MUST be in English. source_url MUST be the direct link to the full article.\n\nReturn ONLY valid JSON array:\n[{"headline":"...","summary":"...","category":"...","source":"...","source_url":"https://full-article-url.com/path/to/article"}]`,
  };
}

async function fetchPexelsImage(query: string, apiKey: string): Promise<string | null> {
  try {
    const keywords = query
      .replace(/[^a-zA-ZäöüÄÖÜñáéíóú0-9\s]/g, "")
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

    // Parse language from body
    let language = "de";
    try {
      const body = await req.json();
      if (body?.language && ["de", "en", "es"].includes(body.language)) {
        language = body.language;
      }
    } catch {
      // No body or invalid JSON — use default
    }

    console.log(`Fetching news for language: ${language}`);

    // Check cache PER LANGUAGE
    const { data: latestArticle } = await supabase
      .from("news_hub_articles")
      .select("created_at")
      .eq("language", language)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestArticle) {
      const hoursSince = (Date.now() - new Date(latestArticle.created_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < CACHE_TTL_HOURS) {
        // Backfill images for articles missing them (language-scoped)
        if (PEXELS_API_KEY) {
          const { data: noImage } = await supabase
            .from("news_hub_articles")
            .select("id, headline")
            .eq("language", language)
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
          JSON.stringify({ status: "cached", language, message: `Last fetch was ${hoursSince.toFixed(1)}h ago, skipping.` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Dedup PER LANGUAGE
    const { data: recentArticles } = await supabase
      .from("news_hub_articles")
      .select("headline")
      .eq("language", language)
      .order("created_at", { ascending: false })
      .limit(50);

    const existingHeadlines = (recentArticles || []).map((a) => a.headline.toLowerCase());

    // Get localized prompt
    const { systemPrompt, userPrompt } = getLocalizedPromptConfig(language);

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

    console.log(`Perplexity returned ${citations.length} citations for ${language}`);

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

      // Fix source_url: use citations as primary source for real URLs
      let sourceUrl = a.source_url || null;

      // Check if the provided URL is just a domain root
      if (sourceUrl) {
        try {
          const parsed = new URL(sourceUrl);
          const isRoot = parsed.pathname === "/" || parsed.pathname === "";
          if (isRoot) {
            // Try citation first
            sourceUrl = citations[i] || null;
          }
        } catch {
          sourceUrl = citations[i] || null;
        }
      } else {
        sourceUrl = citations[i] || null;
      }

      // Second pass: if we still have no URL or a root, try keyword-matching citations
      if (!sourceUrl || isRootUrl(sourceUrl)) {
        const matched = findBestCitation(a.headline, citations);
        if (matched) sourceUrl = matched;
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
        language,
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

    // Cleanup PER LANGUAGE
    const { data: allArticles } = await supabase
      .from("news_hub_articles")
      .select("id")
      .eq("language", language)
      .order("published_at", { ascending: false });

    if (allArticles && allArticles.length > MAX_ARTICLES_PER_LANG) {
      const idsToDelete = allArticles.slice(MAX_ARTICLES_PER_LANG).map((a) => a.id);
      await supabase.from("news_hub_articles").delete().in("id", idsToDelete);
    }

    return new Response(
      JSON.stringify({ status: "success", language, inserted: newArticles.length, batch_id: batchId }),
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

function isRootUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" || parsed.pathname === "";
  } catch {
    return true;
  }
}

function findBestCitation(headline: string, citations: string[]): string | null {
  if (!citations || citations.length === 0) return null;

  const words = headline
    .toLowerCase()
    .replace(/[^a-zA-ZäöüÄÖÜñáéíóú0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  let bestUrl: string | null = null;
  let bestScore = 0;

  for (const citation of citations) {
    if (isRootUrl(citation)) continue;

    const urlLower = citation.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (urlLower.includes(word)) score++;
    }

    if (score > bestScore) {
      bestScore = score;
      bestUrl = citation;
    }
  }

  // If no keyword match, just use first non-root citation
  if (!bestUrl) {
    bestUrl = citations.find((c) => !isRootUrl(c)) || null;
  }

  return bestUrl;
}
