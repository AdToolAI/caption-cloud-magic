// Nightly analysis: pulls real engagement from post_metrics, computes top patterns
// per autopilot brief, persists insights for plan-week to consume.
// Joins post_metrics ↔ autopilot_queue via (user_id, provider/platform, posted_at ±15min).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const MIN_POSTS_FOR_ANALYSIS = 10;
const ANALYSIS_WINDOW_DAYS = 30;
const MATCH_TOLERANCE_MIN = 15;

interface SlotRow {
  id: string;
  brief_id: string;
  platform: string;
  posted_at: string;
  topic_hint: string | null;
  content_payload: Record<string, unknown>;
}
interface MetricRow {
  provider: string;
  posted_at: string;
  engagement_rate: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  reach: number | null;
  impressions: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1) Fetch all active briefs with performance loop enabled
  const { data: briefs } = await admin
    .from("autopilot_briefs")
    .select("id, user_id, topic_pillars, performance_loop_enabled")
    .eq("performance_loop_enabled", true);

  if (!briefs || briefs.length === 0) {
    return json({ ok: true, analyzed_briefs: 0, message: "no eligible briefs" });
  }

  const since = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 86_400_000).toISOString();
  const analyzedUntil = new Date().toISOString();

  let analyzed = 0;
  let skippedTooFew = 0;

  for (const brief of briefs) {
    try {
      // Fetch all posted slots for this brief
      const { data: slots } = await admin
        .from("autopilot_queue")
        .select("id, brief_id, platform, posted_at, topic_hint, content_payload")
        .eq("brief_id", brief.id)
        .eq("status", "posted")
        .gte("posted_at", since)
        .not("posted_at", "is", null)
        .order("posted_at", { ascending: false });

      const slotList = (slots ?? []) as SlotRow[];
      if (slotList.length < MIN_POSTS_FOR_ANALYSIS) {
        skippedTooFew++;
        continue;
      }

      // Fetch all metrics for this user in window
      const { data: metrics } = await admin
        .from("post_metrics")
        .select("provider, posted_at, engagement_rate, likes, comments, shares, reach, impressions")
        .eq("user_id", brief.user_id)
        .gte("posted_at", since);

      const metricsList = (metrics ?? []) as MetricRow[];

      // 2) Match each slot to nearest metric (same platform, within tolerance)
      const enriched: Array<{
        slot: SlotRow;
        engagement: number;
      }> = [];

      for (const slot of slotList) {
        const slotTime = new Date(slot.posted_at).getTime();
        let best: MetricRow | null = null;
        let bestDelta = Infinity;
        for (const m of metricsList) {
          if (m.provider !== slot.platform) continue;
          const delta = Math.abs(new Date(m.posted_at).getTime() - slotTime);
          if (delta < bestDelta && delta <= MATCH_TOLERANCE_MIN * 60_000) {
            best = m;
            bestDelta = delta;
          }
        }
        if (!best) continue;

        // Compute engagement: prefer engagement_rate, else (likes+comments+shares)/reach
        let eng = best.engagement_rate ?? null;
        if (eng === null) {
          const interactions = (best.likes ?? 0) + (best.comments ?? 0) + (best.shares ?? 0);
          const denom = best.reach ?? best.impressions ?? 0;
          eng = denom > 0 ? interactions / denom : null;
        }
        if (eng === null || !isFinite(eng)) continue;
        enriched.push({ slot, engagement: eng });
      }

      if (enriched.length < MIN_POSTS_FOR_ANALYSIS / 2) {
        skippedTooFew++;
        continue;
      }

      // 3) Aggregate: pillars (matched against brief.topic_pillars by simple substring)
      const pillarStats = new Map<string, number[]>();
      for (const e of enriched) {
        const text = `${e.slot.topic_hint ?? ""} ${(e.slot.content_payload?.format_hint ?? "")}`.toLowerCase();
        for (const p of (brief.topic_pillars ?? []) as string[]) {
          if (text.includes(p.toLowerCase())) {
            (pillarStats.get(p) ?? pillarStats.set(p, []).get(p)!).push(e.engagement);
          }
        }
      }

      const pillarScores = [...pillarStats.entries()]
        .filter(([, v]) => v.length >= 2)
        .map(([k, v]) => ({ pillar: k, score: median(v), n: v.length }))
        .sort((a, b) => b.score - a.score);

      const topPillars = pillarScores.slice(0, 3).map((p) => p.pillar);
      const weakestPillars = pillarScores.slice(-3).reverse().map((p) => p.pillar);

      // 4) Platforms
      const platformStats = new Map<string, number[]>();
      for (const e of enriched) {
        (platformStats.get(e.slot.platform) ?? platformStats.set(e.slot.platform, []).get(e.slot.platform)!).push(e.engagement);
      }
      const topPlatforms = [...platformStats.entries()]
        .map(([platform, v]) => ({ platform, avg_engagement: round(median(v)), posts_count: v.length }))
        .sort((a, b) => b.avg_engagement - a.avg_engagement);

      // 5) Best posting hours per platform
      const hourStats = new Map<string, Map<number, number[]>>();
      for (const e of enriched) {
        const hour = new Date(e.slot.posted_at).getUTCHours();
        const platMap = hourStats.get(e.slot.platform) ?? new Map<number, number[]>();
        const arr = platMap.get(hour) ?? [];
        arr.push(e.engagement);
        platMap.set(hour, arr);
        hourStats.set(e.slot.platform, platMap);
      }
      const topHours: Record<string, Array<{ hour: number; score: number }>> = {};
      for (const [plat, hMap] of hourStats.entries()) {
        topHours[plat] = [...hMap.entries()]
          .filter(([, v]) => v.length >= 1)
          .map(([h, v]) => ({ hour: h, score: round(median(v)) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
      }

      // 6) Formats (from content_payload.format_hint)
      const formatStats = new Map<string, number[]>();
      for (const e of enriched) {
        const fmt = String(e.slot.content_payload?.format_hint ?? "single_image").toLowerCase();
        (formatStats.get(fmt) ?? formatStats.set(fmt, []).get(fmt)!).push(e.engagement);
      }
      const topFormats = [...formatStats.entries()]
        .map(([format, v]) => ({ format, avg_engagement: round(median(v)), posts_count: v.length }))
        .sort((a, b) => b.avg_engagement - a.avg_engagement);

      const overallAvg = round(median(enriched.map((e) => e.engagement)));

      // 7) Build recommendation
      const rec: string[] = [];
      if (topPillars.length > 0) rec.push(`Top-Themen: ${topPillars.join(", ")} → 2× verstärken.`);
      if (weakestPillars.length > 0 && weakestPillars[0] !== topPillars[0]) {
        rec.push(`Schwache Themen: ${weakestPillars.join(", ")} → reduzieren oder umformulieren.`);
      }
      if (topPlatforms.length > 0) rec.push(`Beste Plattform: ${topPlatforms[0].platform.toUpperCase()} (${(topPlatforms[0].avg_engagement * 100).toFixed(1)}%).`);
      const bestHourPlat = Object.entries(topHours).sort((a, b) => (b[1][0]?.score ?? 0) - (a[1][0]?.score ?? 0))[0];
      if (bestHourPlat) rec.push(`Bester Slot: ${bestHourPlat[0].toUpperCase()} um ${bestHourPlat[1][0].hour}:00 UTC.`);

      // 8) Upsert insights row
      const { error: upErr } = await admin.from("autopilot_performance_insights").upsert({
        user_id: brief.user_id,
        brief_id: brief.id,
        total_posts_analyzed: enriched.length,
        avg_engagement_rate: overallAvg,
        top_pillars: topPillars,
        weakest_pillars: weakestPillars,
        top_platforms: topPlatforms,
        top_post_hours: topHours,
        top_formats: topFormats,
        recommendation_text: rec.join(" "),
        analyzed_until: analyzedUntil,
      }, { onConflict: "brief_id" });

      if (upErr) {
        console.error("[performance-analyze] upsert error", brief.id, upErr);
        continue;
      }

      // 9) Update brief timestamp
      await admin.from("autopilot_briefs")
        .update({ last_performance_analysis_at: analyzedUntil })
        .eq("id", brief.id);

      // 10) Activity log
      await admin.from("autopilot_activity_log").insert({
        user_id: brief.user_id,
        event_type: "performance_analyzed",
        actor: "system",
        slot_id: null,
        payload: {
          posts_analyzed: enriched.length,
          avg_engagement: overallAvg,
          top_pillar: topPillars[0] ?? null,
          top_platform: topPlatforms[0]?.platform ?? null,
        },
      });

      // 11) Notification only if first analysis OR major shift
      const isFirst = !brief.performance_loop_enabled; // never reachable; we send always after first run
      if (enriched.length >= MIN_POSTS_FOR_ANALYSIS) {
        await admin.functions.invoke("autopilot-emit-notification", {
          body: {
            user_id: brief.user_id,
            type: "autopilot_insights_ready",
            title: "📊 Neue Performance-Erkenntnisse",
            message: rec[0] ?? `Auswertung von ${enriched.length} Posts bereit.`,
            metadata: { brief_id: brief.id, posts_analyzed: enriched.length },
            push_url: "/autopilot",
            push: false,
          },
        }).catch(() => {});
      }

      analyzed++;
    } catch (e) {
      console.error("[performance-analyze] brief error", brief.id, e);
    }
  }

  return json({
    ok: true,
    analyzed_briefs: analyzed,
    skipped_too_few_posts: skippedTooFew,
    total_eligible: briefs.length,
  });
});

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round(n: number, decimals = 4): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
