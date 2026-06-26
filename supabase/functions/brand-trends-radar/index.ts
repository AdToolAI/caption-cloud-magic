// Brand-Trends Radar — fetches 3-5 industry+tonality trends with 24h cache.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "brand-trends-radar", trends: [{ headline: "Mock trend", insight: "stub" }] });
  }

  try {
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    const userId = JSON.parse(atob(authHeader.replace("Bearer ", "").split(".")[1])).sub;

    const { brandKitId, locale = "de", refresh = false } = await req.json();
    const { data: kit } = await supa.from("brand_kits").select("*").eq("id", brandKitId).eq("user_id", userId).single();
    if (!kit) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: corsHeaders });

    const industry = (kit as any).industry || kit.target_audience || "creator economy";

    if (!refresh) {
      const { data: cached } = await supa
        .from("brand_trends_cache")
        .select("*")
        .eq("brand_kit_id", brandKitId)
        .gt("expires_at", new Date().toISOString())
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached?.trends) {
        return new Response(JSON.stringify({ ok: true, cached: true, trends: cached.trends }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return new Response(JSON.stringify({ error: "missing_ai_key" }), { status: 500, headers: corsHeaders });

    const sys = `You are a brand-trend analyst. Output ONLY a JSON array of 4 items: [{headline, insight, action, color_suggestion (optional hex), confidence (0-100)}]. Focus on current visual + tonal trends for the given industry + brand tone. Language: ${locale}.`;
    const user = `Industry: ${industry}\nBrand tone: ${kit.brand_tone ?? "balanced"}\nCurrent primary color: ${kit.primary_color ?? "n/a"}\nReturn 4 actionable trend items for this week.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "system", content: sys }, { role: "user", content: user }] }),
    });
    const aiJson = await aiRes.json();
    const text: string = aiJson?.choices?.[0]?.message?.content ?? "[]";
    const match = text.match(/\[[\s\S]*\]/);
    const trends = match ? JSON.parse(match[0]) : [];

    await supa.from("brand_trends_cache").insert({
      brand_kit_id: brandKitId,
      industry,
      locale,
      trends,
    });

    return new Response(JSON.stringify({ ok: true, cached: false, trends }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("brand-trends-radar error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
