import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Administrative closure / reopening of a Video Enhance cost investigation.
 *
 * A run whose provider cost never became authoritative stays true-up eligible
 * forever. The ONLY way out of that queue is an explicit, admin-only, audited
 * closure with a mandatory reason — never a silent field reset. Reopening is
 * equally explicit and audited.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // AuthN / AuthZ — admin only.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData?.user) return json({ error: "unauthorized" }, 401);
  const { data: isAdmin, error: roleError } = await admin.rpc("has_role", {
    _user_id: callerData.user.id,
    _role: "admin",
  });
  if (roleError || isAdmin !== true) return json({ error: "forbidden" }, 403);

  let body: { runId?: string; action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const action = body.action === "close" || body.action === "reopen" ? body.action : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!runId) return json({ error: "runId_required" }, 400);
  if (!action) return json({ error: "action_must_be_close_or_reopen" }, 400);
  if (reason.length < 3) return json({ error: "reason_required" }, 400);

  const { data: run } = await admin
    .from("video_enhance_runs")
    .select("id, cost_closed_at, provider_cost_usd_actual")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return json({ error: "run_not_found" }, 404);

  if (action === "close" && run.cost_closed_at) {
    return json({ ok: true, deduplicated: true, state: "closed" });
  }
  if (action === "reopen" && !run.cost_closed_at) {
    return json({ ok: true, deduplicated: true, state: "open" });
  }

  const patch = action === "close"
    ? {
      cost_closed_at: new Date().toISOString(),
      cost_closed_by: callerData.user.id,
      cost_closure_reason: reason,
      next_late_check_at: null,
    }
    : {
      cost_closed_at: null,
      cost_closed_by: null,
      cost_closure_reason: null,
      late_cost_attempts: 0,
      next_late_check_at: new Date().toISOString(),
    };

  const { error: updateError } = await admin
    .from("video_enhance_runs")
    .update(patch)
    .eq("id", runId);
  if (updateError) return json({ error: "update_failed", details: updateError.message }, 500);

  await admin.from("video_enhance_cost_closure_audit").insert({
    run_id: runId,
    action,
    reason,
    admin_user_id: callerData.user.id,
  });

  return json({ ok: true, state: action === "close" ? "closed" : "open" });
});
