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

    // 2. Sunday 22:00-23:59 UTC: evaluate levels + regenerate next week for users with mode enabled
    const now = new Date();
    const isSundayNight = now.getUTCDay() === 0 && now.getUTCHours() >= 22;
    let regenerated = 0;
    let levelEvaluated = 0;

    if (isSundayNight) {
      const { data: users } = await supabase
        .from("profiles")
        .select("id")
        .eq("strategy_mode_enabled", true);

      // First: evaluate creator levels (auto-upgrade) BEFORE generating new week
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

      for (const u of users || []) {
        // Compute next Monday
        const nextMonday = new Date();
        nextMonday.setUTCDate(nextMonday.getUTCDate() + 1);
        nextMonday.setUTCHours(0, 0, 0, 0);
        const weekStartStr = nextMonday.toISOString().split("T")[0];

        const { data: existing } = await supabase
          .from("strategy_posts")
          .select("id")
          .eq("user_id", u.id)
          .eq("week_start", weekStartStr)
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Trigger generation via edge function call (best effort)
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-week-strategy`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            },
            body: JSON.stringify({ week_start: weekStartStr, user_id: u.id }),
          });
          regenerated++;
        } catch (e) {
          console.error(`regen failed for ${u.id}:`, e);
        }
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
