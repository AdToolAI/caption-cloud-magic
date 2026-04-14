import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CACHE_TTL_HOURS = 5;
const MAX_ARTICLES_PER_LANG = 200;
const BATCH_SIZE = 40;

const CATEGORIES = [
  { key: "platform", label: "Social Media Platform Updates" },
  { key: "ai_tools", label: "AI Tools & Marketing Automation" },
  { key: "analytics", label: "Analytics & Data Insights" },
  { key: "monetization", label: "Creator Economy & Monetization" },
  { key: "community", label: "Community Management & Engagement" },
  { key: "business_finance", label: "Tech Company Financials, Stock Forecasts & Market Analysis" },
  { key: "strategy", label: "Digital Marketing Strategy & Growth Tactics" },
];

// Source name → domain mapping for URL validation
const SOURCE_DOMAINS: Record<string, string[]> = {
  "t3n": ["t3n.de"], "omr": ["omr.com"], "horizont": ["horizont.net"],
  "w&v": ["wuv.de"], "onlinemarketing.de": ["onlinemarketing.de"],
  "allfacebook.de": ["allfacebook.de"], "meedia": ["meedia.de"],
  "golem.de": ["golem.de"], "golem": ["golem.de"],
  "heise": ["heise.de"], "chip": ["chip.de"],
  "gründerszene": ["gruenderszene.de"], "absatzwirtschaft": ["absatzwirtschaft.de"],
  "techcrunch": ["techcrunch.com"], "socialmediatoday": ["socialmediatoday.com"],
  "social media today": ["socialmediatoday.com"],
  "theverge": ["theverge.com"], "the verge": ["theverge.com"],
  "adweek": ["adweek.com"], "mashable": ["mashable.com"],
  "digiday": ["digiday.com"], "adage": ["adage.com"],
  "searchenginejournal": ["searchenginejournal.com"],
  "search engine journal": ["searchenginejournal.com"],
  "hubspot": ["hubspot.com", "blog.hubspot.com"],
  "buffer": ["buffer.com"], "sproutsocial": ["sproutsocial.com"],
  "sprout social": ["sproutsocial.com"],
  "hootsuite": ["hootsuite.com", "blog.hootsuite.com"],
  "later": ["later.com"], "marketing4ecommerce": ["marketing4ecommerce.net"],
  "reasonwhy": ["reasonwhy.es"], "reason why": ["reasonwhy.es"],
  "puromarketing": ["puromarketing.com"], "marketingdirecto": ["marketingdirecto.com"],
  "xataka": ["xataka.com"], "genbeta": ["genbeta.com"],
  "hipertextual": ["hipertextual.com"], "merca2.0": ["merca20.com"],
  "trecebits": ["trecebits.com"],
  // Generic sources that Perplexity may use
  "wired": ["wired.com"], "zdnet": ["zdnet.com", "zdnet.de"],
  "reuters": ["reuters.com"], "bloomberg": ["bloomberg.com"],
  "theinformation": ["theinformation.com"], "the information": ["theinformation.com"],
  "engadget": ["engadget.com"], "arstechnica": ["arstechnica.com"],
  "ars technica": ["arstechnica.com"], "9to5mac": ["9to5mac.com"],
  "9to5google": ["9to5google.com"], "netzwelt": ["netzwelt.de"],
  "computerbase": ["computerbase.de"], "stadt-bremerhaven": ["stadt-bremerhaven.de"],
  "caschys blog": ["stadt-bremerhaven.de"], "spiegel": ["spiegel.de"],
  "handelsblatt": ["handelsblatt.com"], "manager magazin": ["manager-magazin.de"],
  "wirtschaftswoche": ["wiwo.de"],
};

function isRootUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return path === "" || path.length <= 1;
  } catch {
    return true;
  }
}

function domainMatchesSource(url: string, sourceName: string): boolean {
  const sourceLC = sourceName.toLowerCase().trim();
  const domains = SOURCE_DOMAINS[sourceLC];
  if (!domains) {
    // Fallback: check if source name appears in hostname
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const cleanSource = sourceLC.replace(/\s+/g, "").replace(/\./g, "");
      return hostname.includes(cleanSource);
    } catch {
      return false;
    }
  }
  return domains.some((d) => url.toLowerCase().includes(d));
}

function getPrompt(lang: string) {
  const categoryList = CATEGORIES.map((c) => `- ${c.key}: ${c.label}`).join("\n");

  if (lang === "de") {
    return {
      systemPrompt: `Du bist ein Nachrichten-Kurator für Social Media, Marketing und Technologie.

REGELN:
- Antworte NUR mit einem JSON-Array, kein Markdown
- Inhalte auf DEUTSCH
- Jeder Artikel hat eine ANDERE Quelle
- Verwende [1], [2] etc. im Summary als Quellenreferenzen — diese müssen den Quellen entsprechen, die du gefunden hast`,
      userPrompt: `Finde ${BATCH_SIZE} aktuelle Nachrichten über Social Media Marketing, KI-Tools, Creator Economy und Digital Marketing.

Kategorien:
${categoryList}

WICHTIG: Stelle sicher, dass JEDE der 7 Kategorien mit MINDESTENS 5 Artikeln vertreten ist. Verteile die Artikel gleichmäßig über alle Kategorien. Durchsuche deutschsprachige und internationale Tech/Marketing-Quellen. Jeder Artikel muss eine andere Quelle haben. 

Pro Artikel:
- headline: Deutsche Überschrift (max 120 Zeichen)
- summary: Deutsche Zusammenfassung (2-3 Sätze), mit Quellenreferenz [N] am Ende
- category: Einer der Keys oben
- source: Name der echten Quelle

Format: [{"headline":"...","summary":"... [1]","category":"...","source":"..."}]`,
    };
  }

  if (lang === "es") {
    return {
      systemPrompt: `Eres un curador de noticias de marketing digital y redes sociales.

REGLAS:
- Responde SOLO con un array JSON, sin markdown
- Contenido en ESPAÑOL
- Cada artículo tiene una fuente DIFERENTE
- Usa [1], [2] etc. en el resumen como referencias`,
      userPrompt: `Encuentra ${BATCH_SIZE} noticias actuales sobre marketing en redes sociales, herramientas de IA, economía de creadores y marketing digital.

Categorías:
${categoryList}

IMPORTANTE: Asegúrate de que CADA una de las 7 categorías tenga AL MENOS 5 artículos. Distribuye los artículos equitativamente entre todas las categorías. Busca en fuentes de tecnología y marketing en español e internacionales. Cada artículo debe tener una fuente diferente.

Por artículo:
- headline: Titular en español (máx 120 caracteres)
- summary: Resumen en español (2-3 frases), con referencia [N] al final
- category: Uno de los keys de arriba
- source: Nombre de la fuente real

Formato: [{"headline":"...","summary":"... [1]","category":"...","source":"..."}]`,
    };
  }

  // English
  return {
    systemPrompt: `You are a social media marketing and tech news curator.

RULES:
- Respond ONLY with a JSON array, no markdown
- Content in ENGLISH
- Each article has a DIFFERENT source
- Use [1], [2] etc. in summary as source references`,
    userPrompt: `Find ${BATCH_SIZE} current news about social media marketing, AI tools, creator economy, and digital marketing.

Categories:
${categoryList}

IMPORTANT: Ensure EACH of the 7 categories has AT LEAST 5 articles. Distribute articles evenly across all categories. Search English-language tech and marketing sources. Each article must have a different source.

Per article:
- headline: Concise headline (max 120 chars)
- summary: Summary (2-3 sentences), with source reference [N] at the end
- category: One of the keys above
- source: Name of the real source

Format: [{"headline":"...","summary":"... [1]","category":"...","source":"..."}]`,
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
 * Resolve the best URL for an article using Perplexity citations.
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

  // Fallback: Google search link targeting the source domain
  const sourceLC = sourceName.replace(/\s+/g, "").replace(/\./g, "");
  const domains = SOURCE_DOMAINS[sourceName];
  const domain = domains?.[0] || (sourceLC.length > 2 ? `${sourceLC}.com` : null);
  if (domain && article.summary) {
    const headlineWords = (article.summary || "").replace(/\[.*?\]/g, "").trim().split(/\s+/).slice(0, 6).join(" ");
    const fallback = `https://www.google.com/search?q=site:${domain}+${encodeURIComponent(headlineWords)}`;
    return fallback;
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

    let language = "de";
    let forceRefresh = false;
    try {
      const body = await req.json();
      if (body?.language && ["de", "en", "es"].includes(body.language)) language = body.language;
      if (body?.force === true) forceRefresh = true;
    } catch {}

    console.log(`[news-hub] lang=${language} force=${forceRefresh}`);

    // Cache check
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
                if (imgUrl) await supabase.from("news_hub_articles").update({ image_url: imgUrl }).eq("id", art.id);
              }
            }
          }
          return new Response(
            JSON.stringify({ status: "cached", language }),
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

    // Perplexity call
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
        max_tokens: 12000,
        search_recency_filter: "week",
      }),
    });

    if (!response.ok) {
      throw new Error(`Perplexity [${response.status}]: ${await response.text()}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations: string[] = data.citations || [];

    console.log(`[news-hub] ${citations.length} citations`);

    // Parse JSON
    let articles: any[];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error("[news-hub] No JSON found:", content.slice(0, 500));
        throw new Error("No JSON array in response");
      }
      articles = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("[news-hub] Parse fail:", content.slice(0, 500));
      throw new Error("JSON parse failed");
    }

    const batchId = crypto.randomUUID();
    const validCategories = CATEGORIES.map((c) => c.key);

    const filtered = articles.filter((a: any) => {
      if (!a.headline || !a.category) return false;
      if (!validCategories.includes(a.category)) return false;
      if (existingHeadlines.includes(a.headline.toLowerCase())) return false;
      return true;
    });

    console.log(`[news-hub] ${filtered.length}/${articles.length} pass filter`);

    // Resolve URLs + enrich
    const usedUrls = new Set<string>();
    const newArticles = [];

    for (const a of filtered) {
      const sourceUrl = resolveUrl(a, citations, usedUrls);

      let imageUrl: string | null = null;
      if (PEXELS_API_KEY) {
        imageUrl = await fetchPexelsImage(a.headline, PEXELS_API_KEY);
      }

      const videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(a.headline)}`;
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
    console.log(`[news-hub] ${withUrls}/${newArticles.length} have URLs`);

    if (newArticles.length > 0) {
      const { error: insertError } = await supabase.from("news_hub_articles").insert(newArticles);
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

    console.log(`[news-hub] Done: ${newArticles.length} for ${language}`);

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
