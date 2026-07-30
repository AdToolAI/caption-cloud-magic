// Autopilot Warte-Lounge: tagesaktuelle Signale, gerankt auf das Brand-Kit.
// 24h-Cache pro Nutzer + Brand-Kit + Sprache; `refresh` erzwingt Neuberechnung.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface FeedItem {
  headline: string;
  insight?: string;
  action?: string;
  relevance?: string;
  source?: string;
  source_url?: string;
  category?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const { data: authData } = await supa.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = authData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const brandKitId: string | null = body?.brandKitId ?? null;
    const language: string = typeof body?.language === "string" ? body.language.slice(0, 5) : "de";
    const refresh = body?.refresh === true;

    // ---------------------------------------------------------------- Cache
    if (!refresh) {
      let cacheQuery = supa
        .from("autopilot_lounge_feed_cache")
        .select("payload")
        .eq("user_id", user.id)
        .eq("language", language)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      cacheQuery = brandKitId
        ? cacheQuery.eq("brand_kit_id", brandKitId)
        : cacheQuery.is("brand_kit_id", null);
      const { data: cached } = await cacheQuery.maybeSingle();
      if (cached?.payload) {
        return json({ ok: true, cached: true, items: cached.payload });
      }
    }

    // -------------------------------------------------------------- Quellen
    const [kitRes, newsRes, trendsRes] = await Promise.all([
      brandKitId
        ? supa
            .from("brand_kits")
            .select("brand_name, industry, target_audience, brand_tone, mood")
            .eq("id", brandKitId)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supa
        .from("news_hub_articles")
        .select("headline, summary, category, source, source_url, published_at")
        .order("published_at", { ascending: false })
        .limit(24),
      brandKitId
        ? supa
            .from("brand_trends_cache")
            .select("trends")
            .eq("brand_kit_id", brandKitId)
            .order("generated_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const kit = (kitRes as { data: Record<string, unknown> | null }).data;
    const articles = (newsRes.data ?? []) as Array<Record<string, unknown>>;
    const trends = ((trendsRes as { data: { trends?: unknown[] } | null }).data?.trends ??
      []) as Array<Record<string, unknown>>;

    const fallback: FeedItem[] = articles.slice(0, 6).map((a) => ({
      headline: String(a.headline ?? ""),
      insight: (a.summary as string) ?? undefined,
      source: (a.source as string) ?? undefined,
      source_url: (a.source_url as string) ?? undefined,
      category: (a.category as string) ?? undefined,
    }));

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey || (articles.length === 0 && trends.length === 0)) {
      return json({ ok: true, cached: false, items: fallback });
    }

    // ------------------------------------------------------------- Ranking
    const brandLine = kit
      ? `Marke: ${kit.brand_name ?? "n/a"} · Branche: ${kit.industry ?? kit.target_audience ?? "Creator Economy"} · Tonalität: ${kit.brand_tone ?? "ausgewogen"}`
      : "Marke: unbekannt — nimm allgemeine Creator-/Marketing-Relevanz an.";

    const sys = `Du bist Brand-Analyst. Wähle aus den Rohsignalen die 6 relevantesten für diese Marke aus und gib AUSSCHLIESSLICH ein JSON-Array zurück: [{headline, insight, action, relevance, source, source_url, category}]. "relevance" ist ein Halbsatz, warum es für genau diese Marke zählt. "action" ist ein konkreter, sofort umsetzbarer Impuls. Sprache der Ausgabe: ${language}. Keine Erfindungen: nutze nur die gelieferten Signale.`;

    const payload = {
      brand: brandLine,
      news: articles.map((a) => ({
        headline: a.headline,
        summary: a.summary,
        category: a.category,
        source: a.source,
        source_url: a.source_url,
      })),
      trends,
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });

    if (!aiRes.ok) {
      const details = await aiRes.text();
      console.error(`lounge-feed ai error [${aiRes.status}]: ${details}`);
      return json({ ok: true, cached: false, items: fallback });
    }

    const aiJson = await aiRes.json();
    const text: string = aiJson?.choices?.[0]?.message?.content ?? "[]";
    const match = text.match(/\[[\s\S]*\]/);
    let items: FeedItem[] = [];
    try {
      items = match ? JSON.parse(match[0]) : [];
    } catch {
      items = [];
    }
    if (!Array.isArray(items) || items.length === 0) items = fallback;

    await supa.from("autopilot_lounge_feed_cache").insert({
      user_id: user.id,
      brand_kit_id: brandKitId,
      language,
      payload: items,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    return json({ ok: true, cached: false, items });
  } catch (e) {
    console.error("autopilot-lounge-feed error:", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
