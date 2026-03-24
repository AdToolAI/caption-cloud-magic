import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather metrics
    const { data: metrics } = await supabase
      .from("post_metrics")
      .select("provider, impressions, likes, comments, shares, saves, engagement_rate, posted_at, caption_text")
      .eq("user_id", user.id)
      .order("posted_at", { ascending: false })
      .limit(100);

    const { data: goals } = await supabase
      .from("social_goals")
      .select("goal_type, target_value, current_value, status")
      .eq("user_id", user.id)
      .eq("status", "active");

    // Build summary per platform
    const platformSummary: Record<string, any> = {};
    for (const m of (metrics || [])) {
      const p = m.provider;
      if (!platformSummary[p]) {
        platformSummary[p] = { posts: 0, views: 0, likes: 0, comments: 0, shares: 0, engagementSum: 0 };
      }
      platformSummary[p].posts++;
      platformSummary[p].views += m.impressions || 0;
      platformSummary[p].likes += m.likes || 0;
      platformSummary[p].comments += m.comments || 0;
      platformSummary[p].shares += m.shares || 0;
      platformSummary[p].engagementSum += m.engagement_rate || 0;
    }

    for (const p in platformSummary) {
      platformSummary[p].avgEngagement = platformSummary[p].posts > 0
        ? (platformSummary[p].engagementSum / platformSummary[p].posts).toFixed(2)
        : 0;
    }

    const prompt = `Du bist ein erfahrener Social-Media-Stratege. Analysiere die folgenden Performance-Daten und gib eine strukturierte Analyse zurück.

Plattform-Zusammenfassung:
${JSON.stringify(platformSummary, null, 2)}

Aktive Ziele:
${JSON.stringify(goals || [], null, 2)}

Letzte 5 Posts (Captions):
${(metrics || []).slice(0, 5).map(m => `- [${m.provider}] ${m.caption_text?.substring(0, 100) || 'Kein Text'} (Engagement: ${m.engagement_rate?.toFixed(1) || 0}%)`).join('\n')}

Antworte AUF DEUTSCH in folgendem JSON-Format:
{
  "strengths": ["Stärke 1", "Stärke 2", ...],
  "weaknesses": ["Schwäche 1", "Schwäche 2", ...],
  "tips": ["Konkreter Tipp 1", "Konkreter Tipp 2", ...],
  "strategy": "Ausführliche Strategie-Empfehlung in Markdown (2-3 Absätze, kosteneffektive Wachstumstipps)"
}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Du bist ein Social-Media-Strategie-Experte. Antworte immer auf Deutsch." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_analysis",
              description: "Provide structured performance analysis",
              parameters: {
                type: "object",
                properties: {
                  strengths: { type: "array", items: { type: "string" } },
                  weaknesses: { type: "array", items: { type: "string" } },
                  tips: { type: "array", items: { type: "string" } },
                  strategy: { type: "string" },
                },
                required: ["strengths", "weaknesses", "tips", "strategy"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "provide_analysis" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI Gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    let analysis;

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      analysis = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try parsing content as JSON
      const content = aiData.choices?.[0]?.message?.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { strengths: [], weaknesses: [], tips: [], strategy: content };
    }

    // Cache in DB
    await supabase.from("performance_analyses").insert({
      user_id: user.id,
      platform: "all",
      analysis_json: analysis,
    });

    return new Response(
      JSON.stringify({ analysis, requestId: crypto.randomUUID() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("analyze-performance-strategy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
