// Session H — Wochen-Review (Samstag 10:00 UTC)
// Aggregiert die letzten 7 Tage und schlägt eine neue Strategie + Budget für die kommende Woche vor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, service);

    let body: { user_id?: string } = {};
    try { body = await req.json(); } catch { /* cron */ }

    // Either review for one user (manual trigger) or all active briefs (cron)
    const briefs = body.user_id
      ? await admin.from("autopilot_briefs").select("*").eq("user_id", body.user_id)
      : await admin.from("autopilot_briefs").select("*").eq("is_active", true);

    const briefList = (briefs.data ?? []) as Array<Record<string, unknown>>;
    const results: Array<Record<string, unknown>> = [];

    for (const brief of briefList) {
      const userId = brief.user_id as string;
      const briefId = brief.id as string;

      const periodEnd = new Date();
      const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 3600 * 1000);

      // Aggregate slot performance
      const { data: slots } = await admin
        .from("autopilot_queue")
        .select("id, status, platform, topic_hint, generation_cost_credits, posted_at, social_post_id")
        .eq("user_id", userId)
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString());

      const slotList = (slots ?? []) as Array<Record<string, unknown>>;
      const postsPublished = slotList.filter((s) => s.status === "posted").length;
      const postsGenerated = slotList.filter((s) => ["scheduled", "posted", "qa_review"].includes(s.status as string)).length;
      const postsRejected = slotList.filter((s) => ["blocked", "failed", "skipped"].includes(s.status as string)).length;
      const creditsSpent = slotList.reduce((sum, s) => sum + ((s.generation_cost_credits as number) ?? 0), 0);

      // Engagement from post_metrics (joined via social_post_id)
      const socialIds = slotList.map((s) => s.social_post_id).filter(Boolean) as string[];
      let totalEngagement = 0;
      if (socialIds.length > 0) {
        const { data: metrics } = await admin
          .from("post_metrics")
          .select("likes, comments, shares, saves")
          .in("post_id", socialIds);
        totalEngagement = (metrics ?? []).reduce((sum, m: Record<string, unknown>) =>
          sum + ((m.likes as number) ?? 0) + ((m.comments as number) ?? 0) + ((m.shares as number) ?? 0) + ((m.saves as number) ?? 0), 0);
      }

      // Platform breakdown
      const platformBreakdown: Record<string, number> = {};
      for (const s of slotList) {
        const p = s.platform as string;
        platformBreakdown[p] = (platformBreakdown[p] ?? 0) + 1;
      }

      // Top/weak pillar from session F insights
      const { data: insights } = await admin
        .from("autopilot_performance_insights")
        .select("top_pillars, weakest_pillars")
        .eq("brief_id", briefId)
        .maybeSingle();
      const topPillar = (insights?.top_pillars as string[] | undefined)?.[0] ?? null;
      const weakestPillar = (insights?.weakest_pillars as string[] | undefined)?.[0] ?? null;

      // AI strategy suggestion
      let aiRecommendation: Record<string, unknown> = {
        strategy_text: "Nicht genug Daten für eine Empfehlung — weiter sammeln.",
        suggested_budget_eur: brief.weekly_budget_eur,
        suggested_mix: brief.content_mix,
      };

      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (apiKey && postsGenerated >= 3) {
        try {
          const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content: "Du bist ein Senior Social Media Strategist. Analysiere die Wochendaten und schlage konkret eine Strategie + Budget für nächste Woche vor. Sei präzise und actionable.",
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    channel_goal: brief.channel_goal,
                    budget_eur: brief.weekly_budget_eur,
                    current_mix: brief.content_mix,
                    week_results: {
                      posts_published: postsPublished,
                      posts_rejected: postsRejected,
                      total_engagement: totalEngagement,
                      credits_spent: creditsSpent,
                      credits_budgeted: brief.weekly_credit_budget,
                      top_pillar: topPillar,
                      weakest_pillar: weakestPillar,
                      platforms: platformBreakdown,
                    },
                  }),
                },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "weekly_strategy",
                  description: "Liefere eine kurze Strategie und einen Budget-Vorschlag.",
                  parameters: {
                    type: "object",
                    properties: {
                      strategy_text: { type: "string", description: "Max 3 Sätze: was ändern, was beibehalten." },
                      suggested_budget_eur: { type: "number", description: "Empfohlenes Budget in EUR für nächste Woche." },
                      suggested_mix: {
                        type: "object",
                        properties: {
                          ai_video: { type: "number" },
                          stock_reel: { type: "number" },
                          static: { type: "number" },
                        },
                        required: ["ai_video", "stock_reel", "static"],
                        additionalProperties: false,
                      },
                      key_actions: {
                        type: "array",
                        items: { type: "string" },
                        description: "2-4 konkrete Aktionen für nächste Woche.",
                      },
                    },
                    required: ["strategy_text", "suggested_budget_eur", "suggested_mix", "key_actions"],
                    additionalProperties: false,
                  },
                },
              }],
              tool_choice: { type: "function", function: { name: "weekly_strategy" } },
            }),
          });
          if (aiResp.ok) {
            const data = await aiResp.json();
            const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
            if (args) aiRecommendation = JSON.parse(args);
          }
        } catch (e) {
          console.error("AI strategy failed:", e);
        }
      }

      // Insert review
      const { data: review, error: revErr } = await admin
        .from("autopilot_weekly_reviews")
        .insert({
          brief_id: briefId,
          user_id: userId,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          posts_published: postsPublished,
          posts_generated: postsGenerated,
          posts_rejected: postsRejected,
          total_engagement: totalEngagement,
          credits_spent: creditsSpent,
          credits_budgeted: brief.weekly_credit_budget,
          top_pillar: topPillar,
          weakest_pillar: weakestPillar,
          platform_breakdown: platformBreakdown,
          ai_recommendation: aiRecommendation,
          user_decision: "pending",
        })
        .select()
        .single();

      if (revErr) {
        console.error("review insert err", revErr);
        continue;
      }

      // Set briefing deadline = next Sunday 18:00 UTC
      const deadline = new Date();
      const daysUntilSunday = (7 - deadline.getUTCDay()) % 7 || 7;
      deadline.setUTCDate(deadline.getUTCDate() + (daysUntilSunday === 0 ? 1 : daysUntilSunday));
      deadline.setUTCHours(18, 0, 0, 0);

      await admin.from("autopilot_briefs")
        .update({
          briefing_required_until: deadline.toISOString(),
          last_review_completed_at: new Date().toISOString(),
        })
        .eq("id", briefId);

      // Notification
      try {
        await admin.functions.invoke("autopilot-emit-notification", {
          body: {
            user_id: userId,
            kind: "autopilot_weekly_review_ready",
            title: "Wochen-Review bereit",
            body: `Deine Strategie für die kommende Woche wartet. Bitte bis Sonntag 18:00 UTC bestätigen.`,
            payload: { review_id: review!.id, deadline: deadline.toISOString() },
          },
        });
      } catch { /* ignore */ }

      results.push({ user_id: userId, review_id: review!.id });
    }

    return json({ ok: true, reviewed: results.length, results });
  } catch (e) {
    console.error("weekly-review error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
