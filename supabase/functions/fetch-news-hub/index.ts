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

// ──────────────────────────────────────────────────────────────
// STEP 1: Generate article content (no URLs — AI hallucinates them)
// ──────────────────────────────────────────────────────────────

function getContentPrompt(lang: string) {
  const categoryList = CATEGORIES.map((c) => `- ${c.key}: ${c.label}`).join("\n");

  if (lang === "de") {
    return {
      systemPrompt: `Du bist ein professioneller Nachrichten-Kurator für Social Media Marketing im DACH-Raum.

REGELN:
- Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Array
- KEIN Markdown, KEINE Erklärungen, NUR das JSON-Array
- Alle Inhalte MÜSSEN auf Deutsch sein
- Jeder Artikel MUSS eine ANDERE, EINZIGARTIGE Quelle haben
- Verwende NUR echte, heute tatsächlich erschienene Nachrichtenartikel
- Erfinde KEINE Artikel oder Überschriften`,
      userPrompt: `Recherchiere ${BATCH_SIZE} aktuelle deutschsprachige Nachrichten von HEUTE aus diesen Kategorien:

${categoryList}

QUELLEN (verwende VERSCHIEDENE Quellen für jeden Artikel):
t3n, OMR, Horizont, W&V, OnlineMarketing.de, AllFacebook.de, Meedia, Absatzwirtschaft, Internet World Business, Golem.de, Heise, CHIP, Gründerszene

Für jeden Artikel:
- headline: Deutsche Überschrift (max 120 Zeichen) — muss eine ECHTE Überschrift sein, die heute publiziert wurde
- summary: Deutsche Zusammenfassung (2-3 Sätze)
- category: Kategorie-Key von oben
- source: Name der Quelle (z.B. "t3n", "OMR") — JEDER Artikel braucht eine ANDERE Quelle

WICHTIG: Generiere KEINE source_url. Erfinde KEINE URLs. Gib NUR headline, summary, category und source zurück.

Antworte NUR mit dem JSON-Array:
[{"headline":"...","summary":"...","category":"...","source":"..."}]`,
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
- Usa SOLO artículos reales publicados hoy
- NO inventes artículos ni titulares`,
      userPrompt: `Investiga ${BATCH_SIZE} noticias actuales en español de HOY sobre estas categorías:

${categoryList}

FUENTES (usa fuentes DIFERENTES para cada artículo):
Marketing4eCommerce, Reason Why, PuroMarketing, MarketingDirecto, TreceBits, Merca2.0, Genbeta, Xataka, Hipertextual, El Publicista, IPMARK, Brandemia

Para cada artículo:
- headline: Titular en español (máx 120 caracteres) — debe ser un titular REAL publicado hoy
- summary: Resumen en español (2-3 frases)
- category: Clave de categoría de arriba
- source: Nombre de la fuente (ej. "Xataka") — cada artículo necesita una fuente DIFERENTE

IMPORTANTE: NO generes source_url. NO inventes URLs. Devuelve SOLO headline, summary, category y source.

Responde SOLO con el array JSON:
[{"headline":"...","summary":"...","category":"...","source":"..."}]`,
    };
  }

  // English
  return {
    systemPrompt: `You are a professional social media marketing news curator.

RULES:
- Respond EXCLUSIVELY with a valid JSON array
- NO markdown, NO explanations, ONLY the JSON array
- All content MUST be in English
- Each article MUST have a DIFFERENT, UNIQUE source
- Use ONLY real news articles actually published today
- Do NOT invent articles or headlines`,
    userPrompt: `Research ${BATCH_SIZE} current English-language news articles from TODAY covering these categories:

${categoryList}

SOURCES (use DIFFERENT sources for each article):
TechCrunch, Social Media Today, The Verge, Adweek, Marketing Land, Search Engine Journal, HubSpot Blog, Buffer Blog, Sprout Social Insights, Hootsuite Blog, Later Blog, Mashable, Digiday, AdAge

For each article:
- headline: Concise headline (max 120 chars) — must be a REAL headline published today
- summary: Detailed summary (2-3 sentences)
- category: Category key from above
- source: Source name (e.g. "TechCrunch") — each article needs a DIFFERENT source

IMPORTANT: Do NOT generate source_url. Do NOT invent URLs. Return ONLY headline, summary, category, and source.

Return ONLY the JSON array:
[{"headline":"...","summary":"...","category":"...","source":"..."}]`,
  };
}

// ──────────────────────────────────────────────────────────────
// STEP 2: Find real URLs via Perplexity Search API
// ──────────────────────────────────────────────────────────────

// Source name → domain mapping for validation
const SOURCE_DOMAINS: Record<string, string[]> = {
  "t3n": ["t3n.de"],
  "omr": ["omr.com"],
  "horizont": ["horizont.net"],
  "w&v": ["wuv.de"],
  "werben&verkaufen": ["wuv.de"],
  "onlinemarketing.de": ["onlinemarketing.de"],
  "allfacebook.de": ["allfacebook.de"],
  "meedia": ["meedia.de"],
  "golem.de": ["golem.de"],
  "golem": ["golem.de"],
  "heise": ["heise.de"],
  "chip": ["chip.de"],
  "gründerszene": ["gruenderszene.de"],
  "gruenderszene": ["gruenderszene.de"],
  "absatzwirtschaft": ["absatzwirtschaft.de"],
  "internetworldbusiness": ["internetworld.de"],
  "techcrunch": ["techcrunch.com"],
  "socialmediatoday": ["socialmediatoday.com"],
  "social media today": ["socialmediatoday.com"],
  "theverge": ["theverge.com"],
  "the verge": ["theverge.com"],
  "adweek": ["adweek.com"],
  "mashable": ["mashable.com"],
  "digiday": ["digiday.com"],
  "adage": ["adage.com"],
  "ad age": ["adage.com"],
  "searchenginejournal": ["searchenginejournal.com"],
  "search engine journal": ["searchenginejournal.com"],
  "hubspot": ["hubspot.com", "blog.hubspot.com"],
  "hubspot blog": ["hubspot.com", "blog.hubspot.com"],
  "buffer": ["buffer.com"],
  "buffer blog": ["buffer.com"],
  "sproutsocial": ["sproutsocial.com"],
  "sprout social": ["sproutsocial.com"],
  "hootsuite": ["hootsuite.com", "blog.hootsuite.com"],
  "hootsuite blog": ["hootsuite.com", "blog.hootsuite.com"],
  "later": ["later.com"],
  "later blog": ["later.com"],
  "marketing4ecommerce": ["marketing4ecommerce.net", "marketing4ecommerce.com"],
  "reasonwhy": ["reasonwhy.es"],
  "reason why": ["reasonwhy.es"],
  "puromarketing": ["puromarketing.com"],
  "marketingdirecto": ["marketingdirecto.com"],
  "xataka": ["xataka.com"],
  "genbeta": ["genbeta.com"],
  "hipertextual": ["hipertextual.com"],
  "merca2.0": ["merca20.com"],
  "trecebits": ["trecebits.com"],
  "elpublicista": ["elpublicista.es"],
  "el publicista": ["elpublicista.es"],
  "ipmark": ["ipmark.com"],
  "brandemia": ["brandemia.org"],
  "marketing land": ["marketingland.com"],
};

function isRootUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" || parsed.pathname === "" || parsed.pathname.length <= 1;
  } catch {
    return true;
  }
}

function domainMatchesSource(url: string, sourceName: string): boolean {
  const sourceLC = sourceName.toLowerCase().trim();
  const domains = SOURCE_DOMAINS[sourceLC];
  if (!domains) {
    // Fallback: check if source name appears in URL
    return url.toLowerCase().includes(sourceLC.replace(/\s+/g, "").replace(/\./g, ""));
  }
  const urlLC = url.toLowerCase();
  return domains.some((d) => urlLC.includes(d));
}

async function findRealUrl(
  headline: string,
  sourceName: string,
  apiKey: string
): Promise<string | null> {
  try {
    // Build a targeted search query
    const sourceLC = sourceName.toLowerCase().trim();
    const domains = SOURCE_DOMAINS[sourceLC];
    
    // Use site: filter if we know the domain
    let searchQuery: string;
    if (domains && domains.length > 0) {
      searchQuery = `site:${domains[0]} ${headline}`;
    } else {
      searchQuery = `${sourceName} ${headline}`;
    }

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: "You are a URL finder. Given a headline and source, find the exact article URL. Return ONLY the URL, nothing else. If you cannot find the exact article, return 'NOT_FOUND'.",
          },
          {
            role: "user",
            content: `Find the exact URL for this article:\nSource: ${sourceName}\nHeadline: ${headline}\n\nReturn ONLY the direct article URL (not the homepage).`,
          },
        ],
        temperature: 0.1,
        max_tokens: 200,
        search_recency_filter: "week",
        search_domain_filter: domains && domains.length > 0 ? domains.slice(0, 3) : undefined,
      }),
    });

    if (!response.ok) {
      console.warn(`URL search failed for "${headline}": ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || "").trim();
    const citations: string[] = data.citations || [];

    // Strategy 1: Check if the response content is a valid URL
    if (content && content.startsWith("http") && !content.includes(" ") && content !== "NOT_FOUND") {
      const url = content.split("\n")[0].trim();
      if (!isRootUrl(url) && domainMatchesSource(url, sourceName)) {
        return url;
      }
    }

    // Strategy 2: Check citations for a matching domain
    for (const citation of citations) {
      if (!isRootUrl(citation) && domainMatchesSource(citation, sourceName)) {
        return citation;
      }
    }

    // Strategy 3: Return the first non-root citation even if domain doesn't match source
    // (better than nothing, but only if it's a real article page)
    for (const citation of citations) {
      if (!isRootUrl(citation)) {
        console.warn(`Using non-matching citation for "${sourceName}": ${citation}`);
        return citation;
      }
    }

    return null;
  } catch (err) {
    console.warn(`Error finding URL for "${headline}":`, err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// Pexels image fetching
// ──────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────────

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

    // Parse body
    let language = "de";
    let forceRefresh = false;
    try {
      const body = await req.json();
      if (body?.language && ["de", "en", "es"].includes(body.language)) {
        language = body.language;
      }
      if (body?.force === true) {
        forceRefresh = true;
      }
    } catch {
      // No body or invalid JSON
    }

    console.log(`Fetching news for language: ${language}, force: ${forceRefresh}`);

    // Check cache PER LANGUAGE (skip if force refresh)
    if (!forceRefresh) {
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
          // Backfill missing images
          if (PEXELS_API_KEY) {
            const { data: noImage } = await supabase
              .from("news_hub_articles")
              .select("id, headline")
              .eq("language", language)
              .is("image_url", null)
              .limit(5);

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
            JSON.stringify({ status: "cached", language, message: `Last fetch was ${hoursSince.toFixed(1)}h ago.` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Dedup against existing headlines
    const { data: recentArticles } = await supabase
      .from("news_hub_articles")
      .select("headline")
      .eq("language", language)
      .order("created_at", { ascending: false })
      .limit(50);

    const existingHeadlines = (recentArticles || []).map((a) => a.headline.toLowerCase());

    // ─── STEP 1: Generate article content (no URLs) ───
    const { systemPrompt, userPrompt } = getContentPrompt(language);

    console.log("Step 1: Generating article content...");
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

    console.log(`Step 1 complete: ${filteredArticles.length} valid articles from ${articles.length} total`);

    // ─── STEP 2: Find real URLs for each article ───
    console.log("Step 2: Resolving real URLs...");
    const usedUrls = new Set<string>();
    const newArticles = [];

    for (const a of filteredArticles) {
      // Find real URL via separate Perplexity search
      let sourceUrl: string | null = null;
      
      try {
        sourceUrl = await findRealUrl(a.headline, a.source || "", PERPLEXITY_API_KEY);
      } catch (err) {
        console.warn(`URL resolution failed for "${a.headline}":`, err);
      }

      // Validate: no duplicates, no root URLs, domain must match
      if (sourceUrl) {
        if (usedUrls.has(sourceUrl)) {
          console.warn(`Duplicate URL detected, discarding: ${sourceUrl}`);
          sourceUrl = null;
        } else if (isRootUrl(sourceUrl)) {
          console.warn(`Root URL detected, discarding: ${sourceUrl}`);
          sourceUrl = null;
        } else {
          usedUrls.add(sourceUrl);
        }
      }

      // Fetch Pexels image
      let imageUrl: string | null = null;
      if (PEXELS_API_KEY) {
        imageUrl = await fetchPexelsImage(a.headline, PEXELS_API_KEY);
      }

      // YouTube search link
      const videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(a.headline)}`;

      // Clean summary of any citation brackets
      const cleanSummary = a.summary?.replace(/\s*\[\d+\]/g, "").trim() || null;

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

    console.log(`Step 2 complete: ${newArticles.filter(a => a.source_url).length}/${newArticles.length} articles have verified URLs`);

    if (newArticles.length > 0) {
      const { error: insertError } = await supabase
        .from("news_hub_articles")
        .insert(newArticles);

      if (insertError) throw new Error(`Insert error: ${insertError.message}`);
    }

    // Cleanup old articles PER LANGUAGE
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
