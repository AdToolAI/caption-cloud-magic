import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Mark posts as missed if pending and >2h past scheduled_at
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: missed, error: missedError } = await supabase
      .from("strategy_posts")
      .update({ status: "missed" })
      .eq("status", "pending")
      .lt("scheduled_at", twoHoursAgo)
      .select("id, user_id");

    if (missedError) console.error("missed update error:", missedError);

    // 2. Self-healing: ensure every strategy-mode user has posts for current + next week
    function getMonday(d: Date): Date {
      const x = new Date(d);
      const day = x.getDay();
      const diff = x.getDate() - day + (day === 0 ? -6 : 1);
      x.setDate(diff);
      x.setHours(0, 0, 0, 0);
      return x;
    }

    const now = new Date();
    const currentMonday = getMonday(now);
    const nextMonday = new Date(currentMonday);
    nextMonday.setDate(nextMonday.getDate() + 7);
    const currentMondayStr = currentMonday.toISOString().split("T")[0];
    const nextMondayStr = nextMonday.toISOString().split("T")[0];

    let regenerated = 0;
    let levelEvaluated = 0;
    const isSundayNight = now.getUTCDay() === 0 && now.getUTCHours() >= 22;

    const { data: users } = await supabase
      .from("profiles")
      .select("id")
      .eq("strategy_mode_enabled", true);

    // Sunday night: evaluate creator levels BEFORE generating new week
    if (isSundayNight) {
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/evaluate-creator-level`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          },
          body: JSON.stringify({}),
        });
        levelEvaluated = (users || []).length;
      } catch (e) {
        console.error("evaluate-creator-level call failed:", e);
      }
    }

    for (const u of users || []) {
      // Check both weeks
      const { data: existing } = await supabase
        .from("strategy_posts")
        .select("week_start")
        .eq("user_id", u.id)
        .in("week_start", [currentMondayStr, nextMondayStr]);

      const haveCurrent = (existing || []).some((r: any) => r.week_start === currentMondayStr);
      const haveNext = (existing || []).some((r: any) => r.week_start === nextMondayStr);

      if (haveCurrent && haveNext) continue;

      // Generate the missing week(s) — start from the earliest missing
      const startWeek = !haveCurrent ? currentMondayStr : nextMondayStr;
      const weeksAhead = !haveCurrent && !haveNext ? 2 : 1;

      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-week-strategy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          },
          body: JSON.stringify({ week_start: startWeek, user_id: u.id, weeks_ahead: weeksAhead }),
        });
        regenerated++;
      } catch (e) {
        console.error(`self-heal regen failed for ${u.id}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ marked_missed: missed?.length ?? 0, regenerated, level_evaluated: levelEvaluated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("tick-strategy-posts error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
