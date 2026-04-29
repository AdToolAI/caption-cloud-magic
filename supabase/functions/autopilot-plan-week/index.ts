// Generates a 14-day content plan based on the brief, optimal posting times and trends.
// Inserts draft slots into autopilot_queue.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  user_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, service);

    let body: Body = {};
    try { body = (await req.json()) as Body; } catch { /* cron may send empty */ }

    let userId = body.user_id;
    if (!userId) {
      // Authed call without user_id → derive from JWT
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      const { data: u } = await userClient.auth.getUser();
      userId = u?.user?.id;
    }
    if (!userId) return json({ ok: false, error: "missing user_id" }, 400);

    const { data: brief } = await admin
      .from("autopilot_briefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!brief) return json({ ok: false, error: "no brief" }, 404);
    if (!brief.is_active) return json({ ok: false, error: "autopilot_inactive" }, 200);
    if (brief.paused_until && new Date(brief.paused_until) > new Date()) {
      return json({ ok: false, error: "paused" }, 200);
    }
    if (brief.locked_until && new Date(brief.locked_until) > new Date()) {
      return json({ ok: false, error: "locked" }, 200);
    }

    // Build slot frame: next 14 days × posts_per_week per platform
    const postsPerWeek = (brief.posts_per_week ?? {}) as Record<string, number>;
    const platforms: string[] = brief.platforms ?? [];
    const languages: string[] = brief.languages ?? ["en"];

    // Skip platforms that already have queued/scheduled slots for the next 14 days (idempotent)
    const horizon = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    const { data: existing } = await admin
      .from("autopilot_queue")
      .select("platform, scheduled_at, status")
      .eq("user_id", userId)
      .lte("scheduled_at", horizon)
      .in("status", ["draft", "generating", "qa_review", "scheduled"]);
    const existingByPlat = new Map<string, number>();
    (existing ?? []).forEach((s) => existingByPlat.set(s.platform, (existingByPlat.get(s.platform) ?? 0) + 1));

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    // Ask AI for 14-day topic ideas (per platform) using tool-calling
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Du bist ein Senior Social Media Strategist. Generiere einen 14-Tage Content-Plan basierend auf dem Brief.
Regeln: Keine politischen, medizinischen, juristischen Aussagen. Keine Markennamen Dritter. Keine Personen-Likenesses ohne Erwähnung. Tonalität strikt einhalten.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              topic_pillars: brief.topic_pillars,
              forbidden_topics: brief.forbidden_topics,
              tonality: brief.tonality,
              platforms,
              languages,
              posts_per_week: postsPerWeek,
            }),
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_plan",
            description: "Liefere einen Content-Plan mit Topic-Ideen pro Plattform.",
            parameters: {
              type: "object",
              properties: {
                ideas: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      platform: { type: "string" },
                      language: { type: "string" },
                      topic_hint: { type: "string", description: "Konkrete Content-Idee (max 120 Zeichen)." },
                      format_hint: { type: "string", enum: ["short_video", "image_carousel", "single_image", "talking_head"] },
                    },
                    required: ["platform", "language", "topic_hint", "format_hint"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["ideas"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_plan" } },
      }),
    });

    if (aiResp.status === 429 || aiResp.status === 402) {
      return json({ ok: false, error: aiResp.status === 429 ? "rate_limited" : "credits_exhausted" }, aiResp.status);
    }
    if (!aiResp.ok) throw new Error(`AI ${aiResp.status}`);

    const data = await aiResp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const ideas: Array<{ platform: string; language: string; topic_hint: string; format_hint: string }> =
      args ? JSON.parse(args).ideas ?? [] : [];

    // Distribute slots over 14 days using slot times (10:00, 14:00, 19:00 local UTC fallback)
    const SLOT_HOURS = [10, 14, 19];
    const slotsToInsert: Array<Record<string, unknown>> = [];

    for (const platform of platforms) {
      const targetCount = Math.min((postsPerWeek[platform] ?? 3) * 2, 21); // 2 weeks
      const already = existingByPlat.get(platform) ?? 0;
      const need = Math.max(0, targetCount - already);
      const platformIdeas = ideas.filter((i) => i.platform === platform);
      for (let i = 0; i < need; i++) {
        const idea = platformIdeas[i % Math.max(1, platformIdeas.length)] ?? {
          platform, language: languages[0], topic_hint: brief.topic_pillars[0] ?? "Content", format_hint: "short_video",
        };
        const dayOffset = Math.floor(i / SLOT_HOURS.length);
        const hour = SLOT_HOURS[i % SLOT_HOURS.length];
        const scheduled = new Date();
        scheduled.setUTCDate(scheduled.getUTCDate() + dayOffset + 1);
        scheduled.setUTCHours(hour, 0, 0, 0);

        slotsToInsert.push({
          user_id: userId,
          brief_id: brief.id,
          platform: idea.platform,
          language: idea.language,
          topic_hint: idea.topic_hint,
          scheduled_at: scheduled.toISOString(),
          status: "draft",
          content_payload: { format_hint: idea.format_hint },
        });
      }
    }

    if (slotsToInsert.length > 0) {
      const { error } = await admin.from("autopilot_queue").insert(slotsToInsert);
      if (error) throw error;
    }

    await admin.from("autopilot_briefs")
      .update({ last_plan_generated_at: new Date().toISOString() })
      .eq("id", brief.id);

    await admin.from("autopilot_activity_log").insert({
      user_id: userId,
      event_type: "plan_generated",
      actor: "ai",
      payload: { slots_created: slotsToInsert.length, model: "gemini-2.5-flash" },
    });

    return json({ ok: true, slots_created: slotsToInsert.length });
  } catch (e) {
    console.error("plan-week error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
