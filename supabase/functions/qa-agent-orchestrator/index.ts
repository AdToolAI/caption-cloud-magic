// QA Agent Orchestrator
// Cron-triggered: chooses tier by weekday, picks next mission, dispatches execute-mission.
// Manual trigger via { mission_id, force_real_providers? } also supported.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const manualMissionId: string | undefined = body?.mission_id;
    const triggerSource: string = body?.triggered_by ?? "cron";

    // Determine tier from weekday (UTC)
    const day = new Date().getUTCDay(); // 0=Sun, 6=Sat
    let tier: string;
    if (day === 6) tier = "regression";
    else if (day === 0) tier = "performance";
    else tier = "smoke";

    // Pick mission
    let mission;
    if (manualMissionId) {
      const { data } = await supabase
        .from("qa_missions")
        .select("*")
        .eq("id", manualMissionId)
        .maybeSingle();
      mission = data;
    } else {
      // Bug-yield-per-cent ranking: missions not run in last `rate_limit_minutes`,
      // ordered by oldest last_run_at first (round-robin fairness).
      const { data } = await supabase
        .from("qa_missions")
        .select("*")
        .eq("enabled", true)
        .eq("tier", tier)
        .order("last_run_at", { ascending: true, nullsFirst: true })
        .limit(1);
      mission = data?.[0];
    }

    if (!mission) {
      return new Response(
        JSON.stringify({ ok: false, reason: "no_eligible_mission", tier }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Rate-limit check (skip for any manual trigger, with or without mission_id)
    const isManual = triggerSource === "manual" || !!manualMissionId;
    if (!isManual && mission.last_run_at) {
      const minutesSince =
        (Date.now() - new Date(mission.last_run_at).getTime()) / 60000;
      if (minutesSince < (mission.rate_limit_minutes ?? 240)) {
        return new Response(
          JSON.stringify({
            ok: false,
            reason: "rate_limited",
            mission: mission.name,
            minutes_since: Math.round(minutesSince),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    // Create run row
    const { data: run, error: runErr } = await supabase
      .from("qa_test_runs")
      .insert({
        mission_id: mission.id,
        mission_name: mission.name,
        tier: mission.tier,
        status: "pending",
        steps_total: Array.isArray(mission.steps) ? mission.steps.length : 0,
        cost_budgeted_cents: mission.cost_cap_cents,
        triggered_by: triggerSource,
      })
      .select()
      .single();

    if (runErr || !run) throw runErr ?? new Error("Failed to create run");

    await supabase
      .from("qa_missions")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", mission.id);

    // Fire-and-forget execute-mission
    const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/qa-agent-execute-mission`;
    fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ run_id: run.id }),
    }).catch((e) => console.error("[orchestrator] dispatch failed:", e));

    return new Response(
      JSON.stringify({ ok: true, run_id: run.id, mission: mission.name, tier: mission.tier }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e: any) {
    console.error("[qa-agent-orchestrator] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
