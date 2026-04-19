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

type Level = "beginner" | "intermediate" | "advanced";

function levelConfig(level: Level, isDE: boolean) {
  if (level === "advanced") {
    return {
      minPosts: 7,
      maxPosts: 7,
      tone: isDE
        ? "Datengetrieben, knapp, Profi-Sprache. Nutze konkrete Slots, Serien-Konzepte und Multi-Plattform-Strategien."
        : "Data-driven, concise, expert language. Use concrete slots, series concepts and multi-platform strategies.",
      complexity: isDE
        ? "Multi-Plattform-Mix, Serien (Teil 1/2/3), datenbasierte Empfehlungen mit Performance-Bezug, Cross-Posting-Strategien."
        : "Multi-platform mix, series (part 1/2/3), data-driven recommendations referencing performance, cross-posting strategies.",
    };
  }
  if (level === "intermediate") {
    return {
      minPosts: 5,
      maxPosts: 5,
      tone: isDE
        ? "Konkret, mit Performance-Hinweisen. Direkt und motivierend, aber nicht zu fachlich."
        : "Concrete, with performance hints. Direct and motivating, but not too technical.",
      complexity: isDE
        ? "Mix aus Reels/Karussell/Story, Trend-Anlehnung, A/B-Hooks, klare CTAs."
        : "Mix of Reels/Carousel/Story, trend-leaning, A/B hooks, clear CTAs.",
    };
  }
  // beginner
  return {
    minPosts: 3,
    maxPosts: 3,
    tone: isDE
      ? "Erkläre einfach, ermutigend, keine Fachbegriffe. Schritt-für-Schritt, motivierend."
      : "Explain simply, encouraging, no jargon. Step-by-step, motivating.",
    complexity: isDE
      ? "Einfache Formate (Foto + Caption), klare Hooks, Schritt-für-Schritt Ideen, leicht umsetzbar."
      : "Simple formats (photo + caption), clear hooks, step-by-step ideas, easy to execute.",
  };
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
    const baseWeekStart = body.week_start ? new Date(body.week_start) : getMonday(new Date());
    baseWeekStart.setHours(0, 0, 0, 0);
    const weeksAhead = Math.max(1, Math.min(4, body.weeks_ahead ?? 2));
    const force = !!body.force;

    // Gather context: last 90 days metrics + profile + onboarding (level)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [{ data: metrics }, { data: profile }, { data: onboarding }] = await Promise.all([
      supabase.from("post_metrics")
        .select("provider, posted_at, engagement_rate, likes, comments, shares, impressions, caption_text")
        .eq("user_id", user.id)
        .gte("posted_at", ninetyDaysAgo.toISOString())
        .order("engagement_rate", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("brand_name, language, timezone").eq("id", user.id).maybeSingle(),
      supabase.from("onboarding_profiles")
        .select("experience_level, posts_per_week, niche, business_type, platforms")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const rawLevel = (onboarding?.experience_level || "beginner").toLowerCase();
    const level: Level = ["beginner", "intermediate", "advanced"].includes(rawLevel)
      ? (rawLevel as Level)
      : "beginner";

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

    const onboardingPlatforms = Array.isArray(onboarding?.platforms) && onboarding!.platforms.length > 0
      ? onboarding!.platforms
      : null;
    const platforms = Object.keys(platformStats).length > 0
      ? Object.keys(platformStats)
      : (onboardingPlatforms || ["instagram", "tiktok", "linkedin"]);

    const lang = profile?.language || "de";
    const isDE = lang === "de";
    const cfg = levelConfig(level, isDE);

    const levelLabelDE = level === "advanced" ? "Profi" : level === "intermediate" ? "Fortgeschritten" : "Anfänger";
    const levelLabelEN = level === "advanced" ? "Advanced" : level === "intermediate" ? "Intermediate" : "Beginner";

    const systemPrompt = isDE
      ? `Du bist ein Social-Media-Stratege. Erstelle einen 7-Tage-Wochenplan mit GENAU ${cfg.minPosts} Postvorschlägen, abgestimmt auf das Creator-Level "${levelLabelDE}". Tonalität: ${cfg.tone} Komplexität: ${cfg.complexity} Antworte ausschließlich über den Tool-Call.`
      : `You are a social media strategist. Create a 7-day weekly plan with EXACTLY ${cfg.minPosts} post suggestions, tuned for creator level "${levelLabelEN}". Tone: ${cfg.tone} Complexity: ${cfg.complexity} Respond only via the tool call.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const allInserted: any[] = [];
    const allBatches: string[] = [];
    const skipped: string[] = [];

    for (let w = 0; w < weeksAhead; w++) {
      const weekStart = new Date(baseWeekStart);
      weekStart.setDate(weekStart.getDate() + w * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekStartStr = weekStart.toISOString().split("T")[0];

      // Idempotent skip unless force
      const { data: existing } = await supabase
        .from("strategy_posts")
        .select("id")
        .eq("user_id", user.id)
        .eq("week_start", weekStartStr)
        .limit(1);

      if (existing && existing.length > 0 && !force) {
        skipped.push(weekStartStr);
        continue;
      }

      const weekDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        weekDates.push(d.toISOString().split("T")[0]);
      }

      const userPrompt = isDE ? `Wochenplan für ${weekStartStr} (Mo) bis ${weekDates[6]} (So).

Creator-Level: ${levelLabelDE}
Nische: ${onboarding?.niche || "allgemein"} | Business: ${onboarding?.business_type || "—"}
Verfügbare Plattformen: ${platforms.join(", ")}
Performance der letzten 90 Tage:
${JSON.stringify(platformStats, null, 2)}

Top 5 Captions (zur Inspiration):
${(metrics || []).slice(0, 5).map(m => `- [${m.provider}] ${(m.caption_text || "").substring(0, 80)} (ER: ${m.engagement_rate?.toFixed(1) || 0}%)`).join("\n")}

Erstelle GENAU ${cfg.minPosts} Vorschläge. Verteile sie über die Woche, nutze die besten Posting-Zeiten pro Plattform, mische Plattformen, gib pro Vorschlag eine kurze Begründung (Tonalität dem Level "${levelLabelDE}" entsprechend).

Wochentage (YYYY-MM-DD): ${weekDates.join(", ")}` : `Weekly plan for ${weekStartStr} (Mon) to ${weekDates[6]} (Sun).

Creator level: ${levelLabelEN}
Niche: ${onboarding?.niche || "general"} | Business: ${onboarding?.business_type || "—"}
Available platforms: ${platforms.join(", ")}
Performance last 90 days:
${JSON.stringify(platformStats, null, 2)}

Top 5 captions (inspiration):
${(metrics || []).slice(0, 5).map(m => `- [${m.provider}] ${(m.caption_text || "").substring(0, 80)} (ER: ${m.engagement_rate?.toFixed(1) || 0}%)`).join("\n")}

Create EXACTLY ${cfg.minPosts} suggestions. Spread across the week, use best posting times per platform, mix platforms, provide reasoning per suggestion (tone matching level "${levelLabelEN}").

Weekdays (YYYY-MM-DD): ${weekDates.join(", ")}`;

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
                        tips: {
                          type: "array",
                          items: { type: "string" },
                          description: "3-5 concrete actionable tips for maximum impact (each max 80 chars)",
                          minItems: 3,
                          maxItems: 5,
                        },
                        phase: {
                          type: "string",
                          enum: ["Awareness", "Trust Building", "Conversion", "Retention", "Community"],
                          description: "Strategic phase this post belongs to",
                        },
                      },
                      required: ["date", "time", "platform", "content_idea", "caption_draft", "hashtags", "reasoning", "tips", "phase"],
                      additionalProperties: false,
                    },
                    minItems: cfg.minPosts,
                    maxItems: cfg.maxPosts,
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
      allBatches.push(batchId);

      if (force) {
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
      if (inserted) allInserted.push(...inserted);
    }

    return new Response(
      JSON.stringify({
        posts: allInserted,
        generated: allInserted.length > 0,
        skipped_weeks: skipped,
        batch_ids: allBatches,
        weeks_ahead: weeksAhead,
        level,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-week-strategy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
