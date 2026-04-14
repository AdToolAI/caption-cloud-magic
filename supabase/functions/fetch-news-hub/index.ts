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

function getLocalizedPromptConfig(lang: string) {
  const categoryList = CATEGORIES.map((c) => `- ${c.key}: ${c.label}`).join("\n");

  // CRITICAL: The prompt now asks the model to embed citation references [1], [2] etc.
  // in its response, which we can then map back to the citations array.

  if (lang === "de") {
    return {
      systemPrompt: `Du bist ein professioneller Nachrichten-Kurator für Social Media Marketing im DACH-Raum.

REGELN:
- Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Array
- KEIN Markdown, KEINE Erklärungen, NUR das JSON-Array
- Alle Inhalte MÜSSEN auf Deutsch sein
- Jeder Artikel MUSS eine ANDERE, EINZIGARTIGE Quelle haben
- Verwende NIEMALS die gleiche Quelle/URL für mehrere Artikel
- Kennzeichne jede Quelle mit einer Referenznummer [1], [2] etc. in der Zusammenfassung`,
      userPrompt: `Recherchiere ${BATCH_SIZE} aktuelle deutschsprachige Nachrichten von HEUTE aus diesen Kategorien:

${categoryList}

QUELLEN (verwende VERSCHIEDENE Quellen für jeden Artikel):
t3n, OMR, Horizont, W&V, OnlineMarketing.de, AllFacebook.de, Meedia, Absatzwirtschaft, Internet World Business, Golem.de, Heise, CHIP, Gründerszene, deutsche Nachrichtenagenturen

Für jeden Artikel:
- headline: Deutsche Überschrift (max 120 Zeichen)  
- summary: Deutsche Zusammenfassung (2-3 Sätze, mit Quellenreferenz wie [1], [2] etc.)
- category: Kategorie-Key von oben
- source: Name der Quelle (z.B. "t3n", "OMR") — JEDER Artikel braucht eine ANDERE Quelle
- source_url: Vollständige Artikel-URL (NICHT die Startseite! z.B. https://t3n.de/news/konkreter-artikel-12345/)

WICHTIG: Jeder source_url MUSS ein EINZIGARTIGER, VERSCHIEDENER Link sein. NIEMALS die gleiche URL wiederverwenden. NIEMALS nur eine Domain-Root wie "https://t3n.de/" verwenden.

Antworte NUR mit dem JSON-Array:
[{"headline":"...","summary":"... [1]","category":"...","source":"...","source_url":"https://..."}]`,
    };
  }

  if (lang === "es") {
    return {
      systemPrompt: `Eres un curador profesional de noticias de marketing en redes sociales para el mercado hispanohablante.

REGLAS:
- Responde EXCLUSIVAMENTE con un array JSON válido
- SIN markdown, SIN explicaciones, SOLO el array JSON
- Todo el contenido DEBE estar en español
- Cada artículo DEBE tener una fuente DIFERENTE y ÚNICA
- NUNCA uses la misma fuente/URL para múltiples artículos
- Marca cada fuente con un número de referencia [1], [2] etc. en el resumen`,
      userPrompt: `Investiga ${BATCH_SIZE} noticias actuales en español de HOY sobre estas categorías:

${categoryList}

FUENTES (usa fuentes DIFERENTES para cada artículo):
Marketing4eCommerce, Reason Why, PuroMarketing, MarketingDirecto, TreceBits, Merca2.0, Genbeta, Xataka, Hipertextual, El Publicista, IPMARK, Brandemia

Para cada artículo:
- headline: Titular en español (máx 120 caracteres)
- summary: Resumen en español (2-3 frases, con referencia como [1], [2] etc.)
- category: Clave de categoría de arriba
- source: Nombre de la fuente (ej. "Xataka") — cada artículo necesita una fuente DIFERENTE
- source_url: URL completa del artículo (NO la página principal! ej. https://xataka.com/articulo-concreto)

IMPORTANTE: Cada source_url DEBE ser un enlace ÚNICO y DIFERENTE. NUNCA reutilizar la misma URL. NUNCA usar solo un dominio raíz.

Responde SOLO con el array JSON:
[{"headline":"...","summary":"... [1]","category":"...","source":"...","source_url":"https://..."}]`,
    };
  }

  // English (default)
  return {
    systemPrompt: `You are a professional social media marketing news curator.

RULES:
- Respond EXCLUSIVELY with a valid JSON array
- NO markdown, NO explanations, ONLY the JSON array
- All content MUST be in English
- Each article MUST have a DIFFERENT, UNIQUE source
- NEVER use the same source/URL for multiple articles
- Mark each source with a reference number [1], [2] etc. in the summary`,
    userPrompt: `Research ${BATCH_SIZE} current English-language news articles from TODAY covering these categories:

${categoryList}

SOURCES (use DIFFERENT sources for each article):
TechCrunch, Social Media Today, The Verge, Adweek, Marketing Land, Search Engine Journal, HubSpot Blog, Buffer Blog, Sprout Social Insights, Hootsuite Blog, Later Blog, Mashable, Digiday, AdAge

For each article:
- headline: Concise headline (max 120 chars)
- summary: Detailed summary (2-3 sentences, with source reference like [1], [2] etc.)
- category: Category key from above
- source: Source name (e.g. "TechCrunch") — each article needs a DIFFERENT source
- source_url: Full article URL (NOT the homepage! e.g. https://techcrunch.com/2026/04/14/specific-article)

IMPORTANT: Each source_url MUST be a UNIQUE, DIFFERENT link. NEVER reuse the same URL. NEVER use just a domain root like "https://techcrunch.com/".

Return ONLY the JSON array:
[{"headline":"...","summary":"... [1]","category":"...","source":"...","source_url":"https://..."}]`,
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

function isRootUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" || parsed.pathname === "";
  } catch {
    return true;
  }
}

/**
 * Match a citation URL to an article by source name.
 * E.g. if source is "t3n", find a citation containing "t3n.de"
 */
function findCitationBySource(sourceName: string, citations: string[], usedCitations: Set<string>): string | null {
  if (!citations || citations.length === 0 || !sourceName) return null;

  const sourceLC = sourceName.toLowerCase().replace(/\s+/g, "");
  
  // Common source name → domain mappings
  const domainMap: Record<string, string[]> = {
    "t3n": ["t3n.de"],
    "omr": ["omr.com"],
    "horizont": ["horizont.net"],
    "w&v": ["wuv.de"],
    "werben&verkaufen": ["wuv.de"],
    "onlinemarketing.de": ["onlinemarketing.de"],
    "allfacebook.de": ["allfacebook.de"],
    "meedia": ["meedia.de"],
    "golem.de": ["golem.de"],
    "heise": ["heise.de"],
    "chip": ["chip.de"],
    "gründerszene": ["gruenderszene.de"],
    "techcrunch": ["techcrunch.com"],
    "socialmediatoday": ["socialmediatoday.com"],
    "theverge": ["theverge.com"],
    "adweek": ["adweek.com"],
    "mashable": ["mashable.com"],
    "digiday": ["digiday.com"],
    "adage": ["adage.com"],
    "marketing4ecommerce": ["marketing4ecommerce.net", "marketing4ecommerce.com"],
    "reasonwhy": ["reasonwhy.es"],
    "puromarketing": ["puromarketing.com"],
    "marketingdirecto": ["marketingdirecto.com"],
    "xataka": ["xataka.com"],
    "genbeta": ["genbeta.com"],
    "hipertextual": ["hipertextual.com"],
    "merca2.0": ["merca20.com"],
    "trecebits": ["trecebits.com"],
    "searchenginejournal": ["searchenginejournal.com"],
    "hubspot": ["hubspot.com", "blog.hubspot.com"],
    "buffer": ["buffer.com"],
    "sproutsocial": ["sproutsocial.com"],
    "hootsuite": ["hootsuite.com", "blog.hootsuite.com"],
    "later": ["later.com"],
  };

  // Try domain map first
  const domains = domainMap[sourceLC] || [];
  
  // Also try matching by just checking if the source name appears in the URL
  for (const citation of citations) {
    if (usedCitations.has(citation)) continue;
    if (isRootUrl(citation)) continue;
    
    const citationLC = citation.toLowerCase();
    
    // Check domain map
    for (const domain of domains) {
      if (citationLC.includes(domain)) {
        usedCitations.add(citation);
        return citation;
      }
    }
    
    // Check source name directly in URL
    if (citationLC.includes(sourceLC)) {
      usedCitations.add(citation);
      return citation;
    }
  }

  return null;
}

/**
 * Extract citation reference numbers from summary text like [1], [2]
 * and map them to the citations array (0-indexed)
 */
function extractCitationFromSummary(summary: string, citations: string[], usedCitations: Set<string>): string | null {
  if (!summary || !citations || citations.length === 0) return null;

  const refMatches = summary.match(/\[(\d+)\]/g);
  if (!refMatches) return null;

  for (const ref of refMatches) {
    const idx = parseInt(ref.replace(/[\[\]]/g, ""), 10) - 1; // Citations are 1-indexed in text
    if (idx >= 0 && idx < citations.length) {
      const url = citations[idx];
      if (!isRootUrl(url) && !usedCitations.has(url)) {
        usedCitations.add(url);
        return url;
      }
    }
  }

  return null;
}

/**
 * Last resort: find any unused non-root citation
 */
function findAnyUnusedCitation(citations: string[], usedCitations: Set<string>): string | null {
  for (const citation of citations) {
    if (!usedCitations.has(citation) && !isRootUrl(citation)) {
      usedCitations.add(citation);
      return citation;
    }
  }
  return null;
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
        // Backfill images for articles missing them
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
        search_recency_filter: "day",
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
    console.log(`Citations:`, JSON.stringify(citations));

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

    // Track which citations have been used to avoid duplicates
    const usedCitations = new Set<string>();
    const usedSourceUrls = new Set<string>();

    // Enrich with proper source URLs, Pexels images and YouTube links
    const newArticles = [];
    for (const a of filteredArticles) {
      // Multi-layer source URL resolution:
      // 1. Try matching citation by source name (most reliable)
      // 2. Try extracting citation reference [N] from summary
      // 3. Use the model-provided URL if it's not a root
      // 4. Fall back to any unused citation
      let sourceUrl: string | null = null;

      // Layer 1: Match by source name
      sourceUrl = findCitationBySource(a.source || "", citations, usedCitations);

      // Layer 2: Extract from summary references
      if (!sourceUrl) {
        sourceUrl = extractCitationFromSummary(a.summary || "", citations, usedCitations);
      }

      // Layer 3: Use model-provided URL if valid and unique
      if (!sourceUrl && a.source_url && !isRootUrl(a.source_url) && !usedSourceUrls.has(a.source_url)) {
        sourceUrl = a.source_url;
      }

      // Layer 4: Any unused non-root citation
      if (!sourceUrl) {
        sourceUrl = findAnyUnusedCitation(citations, usedCitations);
      }

      // Ensure no duplicate source URLs
      if (sourceUrl && usedSourceUrls.has(sourceUrl)) {
        sourceUrl = findAnyUnusedCitation(citations, usedCitations);
      }

      if (sourceUrl) {
        usedSourceUrls.add(sourceUrl);
      }

      // Fetch Pexels image
      let imageUrl: string | null = null;
      if (PEXELS_API_KEY) {
        imageUrl = await fetchPexelsImage(a.headline, PEXELS_API_KEY);
      }

      // Generate YouTube search link
      const videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(a.headline)}`;

      // Clean summary: remove [1], [2] references from display text
      let cleanSummary = a.summary?.replace(/\s*\[\d+\]/g, "").trim() || null;

      newArticles.push({
        headline: a.headline.slice(0, 200),
        summary: cleanSummary?.slice(0, 500) || null,
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

    console.log(`Successfully inserted ${newArticles.length} articles for ${language}`);

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
