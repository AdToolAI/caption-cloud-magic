// Bond QA — Finalize a Deep Sweep run that's stuck in "running" because the
// orchestrator edge function exceeded its wall-clock budget. Admin-only.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate user
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Admin gate
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", claims.claims.sub);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { run_id } = await req.json().catch(() => ({}));
    if (!run_id) {
      return new Response(JSON.stringify({ error: "run_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recompute counters from flow results
    const { data: flows } = await admin
      .from("qa_deep_sweep_flow_results")
      .select("status, actual_cost_eur")
      .eq("run_id", run_id);

    const succeeded = (flows ?? []).filter((f: any) => f.status === "success").length;
    const failed = (flows ?? []).filter((f: any) => f.status === "failed" || f.status === "timeout").length;
    const skipped = (flows ?? []).filter((f: any) => f.status === "budget_skipped" || f.status === "skipped").length;
    const totalCost = (flows ?? []).reduce(
      (sum: number, f: any) => sum + Number(f.actual_cost_eur ?? 0),
      0,
    );

    const { error: updErr } = await admin
      .from("qa_deep_sweep_runs")
      .update({
        status: "timeout",
        finished_at: new Date().toISOString(),
        flows_succeeded: succeeded,
        flows_failed: failed,
        flows_skipped: skipped,
        total_cost_eur: totalCost,
        notes:
          "Edge function wall-clock exceeded — finalized by watchdog (one or more flows likely still running on Lambda async)",
      })
      .eq("id", run_id);

    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({ ok: true, run_id, succeeded, failed, skipped, total_cost_eur: totalCost }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[qa-deep-sweep-finalize-stale] error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
