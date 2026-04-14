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
    return url.toLowerCase().includes(sourceLC.replace(/\s+/g, "").replace(/\./g, ""));
  }
  return domains.some((d) => url.toLowerCase().includes(d));
}

function getPrompt(lang: string) {
  const categoryList = CATEGORIES.map((c) => `- ${c.key}: ${c.label}`).join("\n");

  // The key insight: we ask Perplexity to embed citation references [1], [2] in its text.
  // Perplexity's citations array contains the REAL URLs it found during search.
  // We map [N] references to citations[N-1] and validate domain matches.

  if (lang === "de") {
    return {
      systemPrompt: `Du bist ein Nachrichten-Kurator für Social Media Marketing. Deine Aufgabe: ECHTE, AKTUELLE Nachrichten von heute als JSON liefern.

REGELN:
- Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Array
- KEIN Markdown, KEINE Erklärungen, NUR JSON
- Alle Inhalte auf DEUTSCH
- Jeder Artikel braucht eine ANDERE Quelle
- Verwende Quellenreferenzen [1], [2] etc. im Summary — diese werden den echten Quellen-URLs zugeordnet`,
      userPrompt: `Finde ${BATCH_SIZE} aktuelle deutschsprachige Nachrichten von HEUTE:

Kategorien:
${categoryList}

Quellen (VERSCHIEDENE pro Artikel): t3n, OMR, Horizont, W&V, OnlineMarketing.de, AllFacebook.de, Meedia, Golem.de, Heise, CHIP, Gründerszene

Für jeden Artikel:
- headline: Deutsche Überschrift (max 120 Zeichen)
- summary: 2-3 Sätze, mit Quellenreferenz [N] am Ende (z.B. "... berichtet t3n. [1]")
- category: Key von oben
- source: Quellenname (z.B. "t3n")

WICHTIG: Die [N]-Referenzen im Summary MÜSSEN den echten Quellen entsprechen, von denen du die Info hast. Verwende für jeden Artikel eine ANDERE Referenznummer.

JSON-Array:
[{"headline":"...","summary":"... [1]","category":"...","source":"..."}]`,
    };
  }

  if (lang === "es") {
    return {
      systemPrompt: `Eres un curador de noticias de marketing en redes sociales. Tu tarea: entregar noticias REALES y ACTUALES de hoy como JSON.

REGLAS:
- Responde EXCLUSIVAMENTE con un array JSON válido
- SIN markdown, SIN explicaciones, SOLO JSON
- Todo en ESPAÑOL
- Cada artículo necesita una fuente DIFERENTE
- Usa referencias [1], [2] etc. en el resumen — estas se mapean a las URLs reales`,
      userPrompt: `Encuentra ${BATCH_SIZE} noticias actuales en español de HOY:

Categorías:
${categoryList}

Fuentes (DIFERENTES por artículo): Marketing4eCommerce, Reason Why, PuroMarketing, MarketingDirecto, TreceBits, Merca2.0, Genbeta, Xataka, Hipertextual, El Publicista, IPMARK, Brandemia

Para cada artículo:
- headline: Titular en español (máx 120 caracteres)
- summary: 2-3 frases, con referencia [N] al final (ej. "... según Xataka. [1]")
- category: Clave de arriba
- source: Nombre de la fuente (ej. "Xataka")

IMPORTANTE: Las referencias [N] DEBEN corresponder a las fuentes reales. Usa un número DIFERENTE para cada artículo.

Array JSON:
[{"headline":"...","summary":"... [1]","category":"...","source":"..."}]`,
    };
  }

  // English
  return {
    systemPrompt: `You are a social media marketing news curator. Your task: deliver REAL, CURRENT news from today as JSON.

RULES:
- Respond EXCLUSIVELY with a valid JSON array
- NO markdown, NO explanations, ONLY JSON
- All content in ENGLISH
- Each article needs a DIFFERENT source
- Use source references [1], [2] etc. in the summary — these map to real source URLs`,
    userPrompt: `Find ${BATCH_SIZE} current English-language news from TODAY:

Categories:
${categoryList}

Sources (DIFFERENT per article): TechCrunch, Social Media Today, The Verge, Adweek, Search Engine Journal, HubSpot Blog, Buffer Blog, Sprout Social, Hootsuite Blog, Later Blog, Mashable, Digiday, AdAge

For each article:
- headline: Concise headline (max 120 chars)
- summary: 2-3 sentences, with source reference [N] at the end (e.g. "... reports TechCrunch. [1]")
- category: Key from above
- source: Source name (e.g. "TechCrunch")

IMPORTANT: The [N] references MUST correspond to the real sources. Use a DIFFERENT reference number for each article.

JSON array:
[{"headline":"...","summary":"... [1]","category":"...","source":"..."}]`,
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

/**
 * Resolve the best URL for an article using citations from Perplexity.
 * 
 * Strategy (in order of preference):
 * 1. Extract [N] reference from summary → use citations[N-1] if domain matches source
 * 2. Find any citation whose domain matches the source name
 * 3. Extract [N] reference → use citations[N-1] even without domain match (it's from Perplexity's search)
 * 4. null (no URL rather than a wrong one)
 */
function resolveUrl(
  article: { summary?: string; source?: string },
  citations: string[],
  usedUrls: Set<string>
): string | null {
  const sourceName = (article.source || "").toLowerCase().trim();
  
  // Extract reference numbers from summary
  const refMatches = (article.summary || "").match(/\[(\d+)\]/g);
  const refIndices = (refMatches || [])
    .map((r) => parseInt(r.replace(/[\[\]]/g, ""), 10) - 1)
    .filter((i) => i >= 0 && i < citations.length);

  // Strategy 1: Referenced citation with matching domain
  for (const idx of refIndices) {
    const url = citations[idx];
    if (url && !isRootUrl(url) && !usedUrls.has(url) && domainMatchesSource(url, sourceName)) {
      usedUrls.add(url);
      return url;
    }
  }

  // Strategy 2: Any citation matching the source domain
  for (const url of citations) {
    if (!isRootUrl(url) && !usedUrls.has(url) && domainMatchesSource(url, sourceName)) {
      usedUrls.add(url);
      return url;
    }
  }

  // Strategy 3: Referenced citation (even without domain match — Perplexity found it via search)
  for (const idx of refIndices) {
    const url = citations[idx];
    if (url && !isRootUrl(url) && !usedUrls.has(url)) {
      usedUrls.add(url);
      return url;
    }
  }

  // No reliable URL found — return null instead of a wrong link
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
      // defaults
    }

    console.log(`[news-hub] lang=${language} force=${forceRefresh}`);

    // Cache check (skip if force)
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
          // Backfill images
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
            JSON.stringify({ status: "cached", language, message: `Cache valid (${hoursSince.toFixed(1)}h)` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Dedup
    const { data: recentArticles } = await supabase
      .from("news_hub_articles")
      .select("headline")
      .eq("language", language)
      .order("created_at", { ascending: false })
      .limit(50);

    const existingHeadlines = (recentArticles || []).map((a) => a.headline.toLowerCase());

    // Single Perplexity call for content + citations
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
        temperature: 0.3,
        max_tokens: 5000,
        search_recency_filter: "day",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity error [${response.status}]: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations: string[] = data.citations || [];

    console.log(`[news-hub] ${citations.length} citations received`);
    console.log(`[news-hub] citations:`, JSON.stringify(citations.slice(0, 10)));

    // Parse JSON
    let articles: any[];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array found in response");
      articles = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("[news-hub] Parse error. Content:", content.slice(0, 500));
      throw new Error("Failed to parse response as JSON");
    }

    const batchId = crypto.randomUUID();
    const validCategories = CATEGORIES.map((c) => c.key);

    // Filter
    const filtered = articles.filter((a: any) => {
      if (!a.headline || !a.category) return false;
      if (!validCategories.includes(a.category)) return false;
      if (existingHeadlines.includes(a.headline.toLowerCase())) return false;
      return true;
    });

    console.log(`[news-hub] ${filtered.length}/${articles.length} articles pass filter`);

    // Resolve URLs and enrich
    const usedUrls = new Set<string>();
    const newArticles = [];

    for (const a of filtered) {
      const sourceUrl = resolveUrl(a, citations, usedUrls);

      // Pexels image
      let imageUrl: string | null = null;
      if (PEXELS_API_KEY) {
        imageUrl = await fetchPexelsImage(a.headline, PEXELS_API_KEY);
      }

      // YouTube search
      const videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(a.headline)}`;

      // Clean summary
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

    const withUrls = newArticles.filter((a) => a.source_url).length;
    console.log(`[news-hub] ${withUrls}/${newArticles.length} have verified URLs`);

    if (newArticles.length > 0) {
      const { error: insertError } = await supabase
        .from("news_hub_articles")
        .insert(newArticles);

      if (insertError) throw new Error(`Insert: ${insertError.message}`);
    }

    // Cleanup old
    const { data: allArticles } = await supabase
      .from("news_hub_articles")
      .select("id")
      .eq("language", language)
      .order("published_at", { ascending: false });

    if (allArticles && allArticles.length > MAX_ARTICLES_PER_LANG) {
      const idsToDelete = allArticles.slice(MAX_ARTICLES_PER_LANG).map((a) => a.id);
      await supabase.from("news_hub_articles").delete().in("id", idsToDelete);
    }

    console.log(`[news-hub] Done: ${newArticles.length} inserted for ${language}`);

    return new Response(
      JSON.stringify({ status: "success", language, inserted: newArticles.length, withUrls, batch_id: batchId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[news-hub] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
