import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Level = "beginner" | "intermediate" | "advanced";

const POSTS_PER_WEEK_FOR_LEVEL: Record<Level, number> = {
  beginner: 3,
  intermediate: 5,
  advanced: 7,
};

function nextLevel(level: Level): Level | null {
  if (level === "beginner") return "intermediate";
  if (level === "intermediate") return "advanced";
  return null;
}

function meetsThreshold(target: Level, posts: number, avgEr: number, completion: number): boolean {
  if (target === "intermediate") return posts >= 8 && avgEr >= 2.5 && completion >= 0.6;
  if (target === "advanced") return posts >= 16 && avgEr >= 4.5 && completion >= 0.7;
  return false;
}

async function evaluateUser(supabase: any, userId: string) {
  // Skip if pause active
  const { data: profile } = await supabase
    .from("profiles")
    .select("level_auto_pause_until")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.level_auto_pause_until && new Date(profile.level_auto_pause_until) > new Date()) {
    return { userId, skipped: "paused" };
  }

  const { data: onboarding } = await supabase
    .from("onboarding_profiles")
    .select("experience_level, posts_per_week")
    .eq("user_id", userId)
    .maybeSingle();

  const rawLevel = (onboarding?.experience_level || "beginner").toLowerCase();
  const currentLevel: Level = ["beginner", "intermediate", "advanced"].includes(rawLevel)
    ? (rawLevel as Level)
    : "beginner";

  const target = nextLevel(currentLevel);
  if (!target) return { userId, skipped: "max_level" };

  // Window: last 28 days
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: metrics }, { data: published }, { data: stratAll }, { data: stratDone }] = await Promise.all([
    supabase.from("post_metrics")
      .select("engagement_rate")
      .eq("user_id", userId)
      .gte("posted_at", since),
    supabase.from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("created_by", userId)
      .eq("status", "published")
      .gte("published_at", since),
    supabase.from("strategy_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("scheduled_at", since),
    supabase.from("strategy_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("scheduled_at", since),
  ]);

  const erValues = (metrics || []).map((m: any) => m.engagement_rate || 0).filter((v: number) => v > 0);
  const avgEr = erValues.length > 0 ? erValues.reduce((a: number, b: number) => a + b, 0) / erValues.length : 0;
  const postCount = (published as any)?.count ?? (Array.isArray(published) ? published.length : 0);
  const stratTotal = (stratAll as any)?.count ?? 0;
  const stratCompleted = (stratDone as any)?.count ?? 0;
  const completion = stratTotal > 0 ? stratCompleted / stratTotal : 0;

  const snapshot = {
    window_days: 28,
    posts_published: postCount,
    avg_engagement_rate: Number(avgEr.toFixed(2)),
    strategy_total: stratTotal,
    strategy_completed: stratCompleted,
    completion_rate: Number(completion.toFixed(2)),
  };

  if (!meetsThreshold(target, postCount, avgEr, completion)) {
    return { userId, currentLevel, snapshot, upgraded: false };
  }

  // Upgrade!
  const newPostsPerWeek = POSTS_PER_WEEK_FOR_LEVEL[target];

  await supabase
    .from("onboarding_profiles")
    .update({ experience_level: target, posts_per_week: newPostsPerWeek })
    .eq("user_id", userId);

  await supabase.from("creator_level_history").insert({
    user_id: userId,
    level_from: currentLevel,
    level_to: target,
    trigger: "auto",
    metrics_snapshot: snapshot,
    reason: `Auto-upgrade based on ${postCount} posts, ${snapshot.avg_engagement_rate}% avg ER, ${Math.round(completion * 100)}% completion (28d).`,
  });

  return { userId, currentLevel, newLevel: target, snapshot, upgraded: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json().catch(() => ({}));

    let userIds: string[] = [];
    if (body.user_id) {
      userIds = [body.user_id];
    } else {
      // Evaluate all users with strategy mode enabled
      const { data: users } = await supabase
        .from("profiles")
        .select("id")
        .eq("strategy_mode_enabled", true);
      userIds = (users || []).map((u: any) => u.id);
    }

    const results = [];
    for (const uid of userIds) {
      try {
        const r = await evaluateUser(supabase, uid);
        results.push(r);
      } catch (e) {
        console.error(`evaluate failed for ${uid}:`, e);
        results.push({ userId: uid, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    return new Response(
      JSON.stringify({
        evaluated: results.length,
        upgraded: results.filter((r: any) => r.upgraded).length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("evaluate-creator-level error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
