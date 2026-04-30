// Terminates an account on Critical-Strike: archives data, locks autopilot, signs out, marks profile.
// Hard-deletion runs separately after retention period; this function is the immediate termination trigger.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface Body {
  user_id: string;
  reason: string;
  evidence?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { user_id, reason, evidence } = (await req.json()) as Body;
    if (!user_id || !reason) return json({ ok: false, error: "missing params" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Idempotency — skip if already terminated
    const { data: prof } = await admin.from("profiles").select("terminated_at, email").eq("id", user_id).maybeSingle();
    if (prof?.terminated_at) {
      return json({ ok: true, idempotent: true });
    }

    // Snapshot strikes + consent
    const { data: strikes } = await admin.from("autopilot_strikes").select("*").eq("user_id", user_id);
    const { data: consents } = await admin.from("autopilot_consent_log").select("*").eq("user_id", user_id);

    // Archive
    await admin.from("terminated_accounts_archive").insert({
      original_user_id: user_id,
      email: prof?.email ?? null,
      termination_reason: reason,
      evidence_json: evidence ?? {},
      strikes_snapshot: strikes ?? [],
      consent_snapshot: consents ?? [],
      terminated_by: "system_autopilot",
      hard_delete_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(), // 30d retention
    });

    // Mark profile
    await admin.from("profiles").update({
      terminated_at: new Date().toISOString(),
      autopilot_permanently_locked: true,
      autopilot_lock_reason: reason,
    }).eq("id", user_id);

    // Hard-lock brief + cancel queued slots
    await admin.from("autopilot_briefs").update({
      is_active: false,
      locked_until: new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000).toISOString(),
    }).eq("user_id", user_id);

    await admin.from("autopilot_queue").update({
      status: "blocked",
      block_reason: `account_terminated:${reason}`,
    }).eq("user_id", user_id).in("status", ["draft", "generating", "qa_review", "scheduled"]);

    // Activity log
    await admin.from("autopilot_activity_log").insert({
      user_id,
      event_type: "account_terminated",
      actor: "system",
      payload: { reason, evidence: evidence ?? {} },
    });

    // Force sign-out (revoke sessions)
    try {
      // @ts-expect-error admin API
      await admin.auth.admin.signOut(user_id, "global");
    } catch (e) {
      console.warn("signOut failed", e);
    }

    return json({ ok: true, terminated: true });
  } catch (e) {
    console.error("terminate-autopilot-abuse error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
