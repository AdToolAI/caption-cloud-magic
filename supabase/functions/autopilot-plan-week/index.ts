// Generates a 14-day content plan based on the brief, optimal posting times and live trends.
// Inserts draft slots into autopilot_queue.
//
// Session D upgrade: pulls real trends from `trend_entries` + `news_hub_articles`
// and aligns slot scheduling with `posting_slots` (high-score windows per platform).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  user_id?: string;
}

type SupaClient = ReturnType<typeof createClient>;

interface TrendCtx {
  platform: string;
  language: string;
  name: string;
  description: string | null;
  popularity_index: number | null;
}

interface NewsCtx {
  language: string;
  headline: string;
  category: string | null;
  source: string | null;
}

interface PostingSlot {
  platform: string;
  slot_start: string; // ISO
  score: number;
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

    const postsPerWeek = (brief.posts_per_week ?? {}) as Record<string, number>;
    const platforms: string[] = brief.platforms ?? [];
    const languages: string[] = brief.languages ?? ["en"];
    const forbidden: string[] = brief.forbidden_topics ?? [];

    // Idempotency — count existing future slots per platform
    const horizon = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    const { data: existing } = await admin
      .from("autopilot_queue")
      .select("platform")
      .eq("user_id", userId)
      .lte("scheduled_at", horizon)
      .in("status", ["draft", "generating", "qa_review", "scheduled"]);
    const existingByPlat = new Map<string, number>();
    (existing ?? []).forEach((s) => existingByPlat.set(s.platform as string, (existingByPlat.get(s.platform as string) ?? 0) + 1));

    // ---------------- 1. Pull trends + news context ----------------
    const trends = await fetchTrends(admin, platforms, languages);
    const news = await fetchNews(admin, languages);

    // ---------------- 2. Resolve high-score posting windows ----------------
    const postingWindows = await fetchPostingWindows(admin, userId, platforms);

    // ---------------- 2b. Pull performance insights (Session F) ----------------
    const { data: insights } = await admin
      .from("autopilot_performance_insights")
      .select("top_pillars, weakest_pillars, top_platforms, top_post_hours, top_formats, recommendation_text, total_posts_analyzed, avg_engagement_rate")
      .eq("brief_id", brief.id)
      .maybeSingle();
    const hasInsights = insights && (insights.total_posts_analyzed ?? 0) >= 10;

    // ---------------- 3. Ask AI for plan with full context ----------------
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const performanceBlock = hasInsights
      ? `\nPERFORMANCE-LERNDATEN (basierend auf ${insights!.total_posts_analyzed} echten Posts, ⌀ Engagement ${((insights!.avg_engagement_rate ?? 0) * 100).toFixed(1)}%):
- Top-Themen die performt haben: ${(insights!.top_pillars as string[] ?? []).join(", ") || "(keine)"} → diese MÜSSEN 2× häufiger vorkommen
- Schwächste Themen: ${(insights!.weakest_pillars as string[] ?? []).join(", ") || "(keine)"} → reduzieren oder neu framen
- Beste Plattform: ${((insights!.top_platforms as Array<{platform: string}>)[0]?.platform ?? "—").toUpperCase()} → mehr Inhalte dorthin lenken
- Empfehlung: ${insights!.recommendation_text ?? ""}
NUTZE DIESE LERNDATEN AKTIV — sie sind echte historische Performance, kein Bauchgefühl.`
      : "";

    // Session H — Goal & Budget Block
    const contentMix = (brief.content_mix ?? { ai_video: 33, stock_reel: 33, static: 34 }) as Record<string, number>;
    const budgetEur = brief.weekly_budget_eur ?? 25;
    const goalMap: Record<string, string> = {
      awareness: "REICHWEITE & neue Follower (große Hooks, virale Mechaniken, trending sounds/topics)",
      engagement: "COMMUNITY-INTERAKTION (Fragen, Polls, Reactions, Saves, persönliche Stories)",
      traffic: "KLICKS auf Website/Link in Bio (klare CTAs, Preview-Snippets, Cliffhanger)",
      leads: "E-MAIL-SIGNUPS / DMs / Anfragen (Lead-Magnets, Free-Resources, Soft-Pitches)",
      sales: "DIREKTER VERKAUF (Produkt-Demos, USPs, Social Proof, harte CTAs)",
    };
    const isLowBudget = budgetEur < 20;
    const allowedFormats = isLowBudget
      ? "single_image, image_carousel (KI-Video DEAKTIVIERT wegen Budget < 20€)"
      : "short_video, image_carousel, single_image, talking_head";

    const goalBudgetBlock = `
CHANNEL-ZIEL DIESER WOCHE: ${goalMap[brief.channel_goal as string] ?? brief.channel_goal}
WOCHEN-BUDGET: ${budgetEur}€ (≈ ${brief.weekly_credit_budget} Credits)
CONTENT-MIX (Soll-Verteilung): ${contentMix.ai_video}% KI-Video / ${contentMix.stock_reel}% Stock+KI-Bild / ${contentMix.static}% Static
ZIELGRUPPE: ${brief.target_audience || "(nicht definiert)"}
USP: ${brief.usp || "(nicht definiert)"}
ERLAUBTE FORMATE: ${allowedFormats}
${isLowBudget ? "⚠️ Bei niedrigem Budget MAXIMAL Static-Posts und Image-Carousels einsetzen — keine ai-video!" : ""}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Du bist ein Senior Social Media Strategist. Generiere einen 14-Tage Content-Plan basierend auf Brief, aktuellen Trends und Nachrichten.
Strikte Regeln:
- Keine politischen, medizinischen, juristischen Aussagen.
- Keine Markennamen Dritter.
- Keine Personen-Likenesses ohne Erwähnung.
- Tonalität strikt einhalten.
- Verbots-Themen niemals: ${forbidden.join(", ") || "(keine)"}
- Nutze die übergebenen Trends, um relevante Hooks zu erzeugen — aber kein direkter Newsjacking von Politik/Tragödien.
- Sprache jeder Idee MUSS einer der erlaubten Sprachen entsprechen: ${languages.join(", ")}.${performanceBlock}${goalBudgetBlock}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              brief: {
                topic_pillars: brief.topic_pillars,
                tonality: brief.tonality,
                platforms,
                languages,
                posts_per_week: postsPerWeek,
              },
              live_trends: trends.slice(0, 30),
              live_news_headlines: news.slice(0, 20),
              performance_insights: hasInsights ? {
                top_pillars: insights!.top_pillars,
                weakest_pillars: insights!.weakest_pillars,
                top_platforms: insights!.top_platforms,
                top_post_hours: insights!.top_post_hours,
                top_formats: insights!.top_formats,
              } : null,
            }),
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_plan",
            description: "Liefere einen Content-Plan mit konkreten Topic-Ideen pro Plattform, jeweils mit Trend-Bezug und Format.",
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
                      trend_anchor: { type: "string", description: "Optional: Bezug zu einem live_trend oder live_news Headline." },
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
    const ideas: Array<{
      platform: string;
      language: string;
      topic_hint: string;
      format_hint: string;
      trend_anchor?: string;
    }> = args ? JSON.parse(args).ideas ?? [] : [];

    // ---------------- 4. Schedule using high-score posting windows ----------------
    const slotsToInsert: Array<Record<string, unknown>> = [];

    for (const platform of platforms) {
      const targetCount = Math.min((postsPerWeek[platform] ?? 3) * 2, 21);
      const already = existingByPlat.get(platform) ?? 0;
      const need = Math.max(0, targetCount - already);
      if (need === 0) continue;

      const platformIdeas = ideas.filter((i) => i.platform === platform);
      const windows = pickWindowsForPlatform(postingWindows, platform, need);

      for (let i = 0; i < need; i++) {
        const idea = platformIdeas[i % Math.max(1, platformIdeas.length)] ?? {
          platform,
          language: languages[0],
          topic_hint: brief.topic_pillars[0] ?? "Content",
          format_hint: "short_video",
        };
        const scheduledAt = windows[i] ?? fallbackSlot(i);

        slotsToInsert.push({
          user_id: userId,
          brief_id: brief.id,
          platform: idea.platform,
          language: idea.language,
          topic_hint: idea.topic_hint,
          scheduled_at: scheduledAt,
          status: "draft",
          content_payload: {
            format_hint: idea.format_hint,
            trend_anchor: idea.trend_anchor ?? null,
            scheduling_source: windows[i] ? "posting_slots" : "fallback",
          },
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
      payload: {
        slots_created: slotsToInsert.length,
        model: "gemini-2.5-flash",
        trends_used: trends.length,
        news_used: news.length,
        posting_windows_used: Array.from(new Set(slotsToInsert.map((s) => (s.content_payload as Record<string, unknown>).scheduling_source))),
      },
    });

    return json({
      ok: true,
      slots_created: slotsToInsert.length,
      context: {
        trends: trends.length,
        news: news.length,
        windows_per_platform: Object.fromEntries(
          platforms.map((p) => [p, postingWindows.filter((w) => w.platform === p).length]),
        ),
      },
    });
  } catch (e) {
    console.error("plan-week error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

/* ===================== Helpers ===================== */

async function fetchTrends(admin: SupaClient, platforms: string[], languages: string[]): Promise<TrendCtx[]> {
  // Pull most recent + popular trends matching brief platforms+languages.
  // Falls back to language-only if no platform match.
  const { data } = await admin
    .from("trend_entries")
    .select("platform, language, name, description, popularity_index")
    .in("language", languages)
    .order("popularity_index", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(60);

  const all = (data ?? []) as TrendCtx[];
  const matchPlatform = all.filter((t) => platforms.includes(t.platform));
  return (matchPlatform.length >= 10 ? matchPlatform : all).slice(0, 30);
}

async function fetchNews(admin: SupaClient, languages: string[]): Promise<NewsCtx[]> {
  const { data } = await admin
    .from("news_hub_articles")
    .select("language, headline, category, source")
    .in("language", languages)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(20);
  return (data ?? []) as NewsCtx[];
}

async function fetchPostingWindows(admin: SupaClient, userId: string, platforms: string[]): Promise<PostingSlot[]> {
  // Pull stored top windows for the user across the next 14 days.
  const horizon = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  const now = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // skip past hour
  const { data } = await admin
    .from("posting_slots")
    .select("platform, slot_start, score")
    .eq("user_id", userId)
    .in("platform", platforms)
    .gte("slot_start", now)
    .lte("slot_start", horizon)
    .order("score", { ascending: false })
    .limit(200);
  return (data ?? []) as PostingSlot[];
}

/**
 * Pick `count` highest-scoring windows for a platform, but enforce ≥6h spacing
 * so we don't stack three posts within the same morning.
 */
function pickWindowsForPlatform(all: PostingSlot[], platform: string, count: number): string[] {
  const candidates = all
    .filter((s) => s.platform === platform)
    .sort((a, b) => b.score - a.score);
  const picked: Date[] = [];
  const out: string[] = [];
  for (const c of candidates) {
    if (out.length >= count) break;
    const d = new Date(c.slot_start);
    const tooClose = picked.some((p) => Math.abs(p.getTime() - d.getTime()) < 6 * 3600 * 1000);
    if (tooClose) continue;
    picked.push(d);
    out.push(d.toISOString());
  }
  // Sort chronologically for clean queue ordering
  return out.sort();
}

/** Fallback when no posting_slots exist yet — distribute every other day at 19:00 UTC. */
function fallbackSlot(index: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Math.floor(index / 2) + 1);
  d.setUTCHours(index % 2 === 0 ? 14 : 19, 0, 0, 0);
  return d.toISOString();
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
