import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const weekStart = body.week_start ? new Date(body.week_start) : getMonday(new Date());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    // Check if already exists for this week
    const { data: existing } = await supabase
      .from("strategy_posts")
      .select("id")
      .eq("user_id", user.id)
      .eq("week_start", weekStartStr)
      .limit(1);

    if (existing && existing.length > 0 && !body.force) {
      const { data: posts } = await supabase
        .from("strategy_posts")
        .select("*")
        .eq("user_id", user.id)
        .eq("week_start", weekStartStr)
        .order("scheduled_at", { ascending: true });
      return new Response(JSON.stringify({ posts, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather context: last 90 days metrics + profile
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [{ data: metrics }, { data: profile }] = await Promise.all([
      supabase.from("post_metrics")
        .select("provider, posted_at, engagement_rate, likes, comments, shares, impressions, caption_text")
        .eq("user_id", user.id)
        .gte("posted_at", ninetyDaysAgo.toISOString())
        .order("engagement_rate", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("brand_name, language, timezone").eq("id", user.id).single(),
    ]);

    // Compute platform performance
    const platformStats: Record<string, { posts: number; avgEr: number; bestHour: number }> = {};
    const hourBuckets: Record<string, Record<number, number[]>> = {};

    for (const m of metrics || []) {
      const p = m.provider || "instagram";
      if (!platformStats[p]) {
        platformStats[p] = { posts: 0, avgEr: 0, bestHour: 19 };
        hourBuckets[p] = {};
      }
      platformStats[p].posts++;
      platformStats[p].avgEr += m.engagement_rate || 0;
      if (m.posted_at) {
        const hour = new Date(m.posted_at).getHours();
        if (!hourBuckets[p][hour]) hourBuckets[p][hour] = [];
        hourBuckets[p][hour].push(m.engagement_rate || 0);
      }
    }

    for (const p in platformStats) {
      platformStats[p].avgEr = platformStats[p].posts > 0 ? platformStats[p].avgEr / platformStats[p].posts : 0;
      let bestHour = 19, bestScore = 0;
      for (const h in hourBuckets[p]) {
        const scores = hourBuckets[p][h as any];
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg > bestScore) { bestScore = avg; bestHour = parseInt(h); }
      }
      platformStats[p].bestHour = bestHour;
    }

    const platforms = Object.keys(platformStats).length > 0
      ? Object.keys(platformStats)
      : ["instagram", "tiktok", "linkedin"];

    const lang = profile?.language || "de";
    const isDE = lang === "de";

    const systemPrompt = isDE
      ? "Du bist ein Social-Media-Stratege. Erstelle einen datenbasierten 7-Tage-Wochenplan mit 5-7 Postvorschlägen. Antworte ausschließlich über den Tool-Call."
      : "You are a social media strategist. Create a data-driven 7-day weekly plan with 5-7 post suggestions. Respond only via the tool call.";

    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      weekDates.push(d.toISOString().split("T")[0]);
    }

    const userPrompt = `Wochenplan für ${weekStartStr} (Mo) bis ${weekDates[6]} (So).

Verfügbare Plattformen: ${platforms.join(", ")}
Performance der letzten 90 Tage:
${JSON.stringify(platformStats, null, 2)}

Top 5 Captions (zur Inspiration):
${(metrics || []).slice(0, 5).map(m => `- [${m.provider}] ${(m.caption_text || "").substring(0, 80)} (ER: ${m.engagement_rate?.toFixed(1) || 0}%)`).join("\n")}

Erstelle 5-7 abwechslungsreiche Vorschläge. Verteile sie über die Woche, nutze die besten Posting-Zeiten pro Plattform, mische Plattformen, gib pro Vorschlag eine kurze Begründung.

Wochentage (YYYY-MM-DD): ${weekDates.join(", ")}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_week_plan",
            description: "Create a weekly content strategy plan",
            parameters: {
              type: "object",
              properties: {
                posts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: { type: "string", description: "YYYY-MM-DD" },
                      time: { type: "string", description: "HH:MM 24h" },
                      platform: { type: "string", enum: platforms },
                      content_idea: { type: "string", description: "Short title (max 60 chars)" },
                      caption_draft: { type: "string", description: "Ready-to-post caption (80-200 chars)" },
                      hashtags: { type: "array", items: { type: "string" } },
                      reasoning: { type: "string", description: "Why this suggestion (max 120 chars)" },
                    },
                    required: ["date", "time", "platform", "content_idea", "caption_draft", "hashtags", "reasoning"],
                    additionalProperties: false,
                  },
                  minItems: 5,
                  maxItems: 7,
                },
              },
              required: ["posts"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_week_plan" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI Gateway: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const plan = JSON.parse(toolCall.function.arguments);
    const batchId = crypto.randomUUID();

    // Delete existing for this week if force
    if (body.force) {
      await supabase.from("strategy_posts")
        .delete()
        .eq("user_id", user.id)
        .eq("week_start", weekStartStr)
        .eq("status", "pending");
    }

    const rows = (plan.posts || []).map((p: any) => {
      const scheduledAt = new Date(`${p.date}T${p.time}:00`);
      return {
        user_id: user.id,
        week_start: weekStartStr,
        scheduled_at: scheduledAt.toISOString(),
        platform: p.platform,
        content_idea: p.content_idea,
        caption_draft: p.caption_draft,
        hashtags: p.hashtags || [],
        reasoning: p.reasoning,
        status: "pending",
        generation_batch_id: batchId,
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from("strategy_posts")
      .insert(rows)
      .select();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ posts: inserted, generated: true, batch_id: batchId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-week-strategy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
