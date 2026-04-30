// Session H — Safety-Check (stündlich)
// Pausiert Autopilot wenn:
//  1. Briefing-Deadline überschritten
//  2. User-Credits unter Mindest-Schwelle
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const MIN_CREDIT_THRESHOLD = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, service);

    const { data: briefs } = await admin
      .from("autopilot_briefs")
      .select("id, user_id, briefing_required_until, paused_until, is_active")
      .eq("is_active", true);

    const briefList = (briefs ?? []) as Array<Record<string, unknown>>;
    const now = new Date();
    let briefingPaused = 0;
    let creditPaused = 0;

    for (const brief of briefList) {
      const userId = brief.user_id as string;
      const alreadyPaused = brief.paused_until && new Date(brief.paused_until as string) > now;

      // 1. Briefing-Deadline überschritten
      const deadline = brief.briefing_required_until ? new Date(brief.briefing_required_until as string) : null;
      if (deadline && deadline < now && !alreadyPaused) {
        const pauseUntil = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();
        await admin.from("autopilot_briefs")
          .update({ paused_until: pauseUntil })
          .eq("id", brief.id);

        await safeEmit(admin, userId, "autopilot_paused_briefing_missing",
          "Autopilot pausiert: Briefing fehlt",
          "Du hast die Briefing-Deadline (Sonntag 18:00 UTC) verpasst. Bitte bestätige das Wochen-Review, um den Autopiloten wieder zu starten.");
        briefingPaused++;
        continue;
      }

      // 2. Credit-Stand prüfen
      if (alreadyPaused) continue;

      // Find workspace for user (owner_user_id)
      const { data: ws } = await admin
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", userId)
        .limit(1)
        .maybeSingle();

      let balance = 0;
      if (ws?.id) {
        const { data: txs } = await admin
          .from("credit_transactions")
          .select("delta")
          .eq("workspace_id", ws.id);
        balance = (txs ?? []).reduce((sum, t: Record<string, unknown>) => sum + ((t.delta as number) ?? 0), 0);
      }

      if (balance < MIN_CREDIT_THRESHOLD) {
        const pauseUntil = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
        await admin.from("autopilot_briefs")
          .update({ paused_until: pauseUntil })
          .eq("id", brief.id);

        await safeEmit(admin, userId, "autopilot_paused_low_credits",
          "Autopilot pausiert: Credits aufgebraucht",
          `Dein Credit-Stand (${balance}) liegt unter der Mindest-Schwelle (${MIN_CREDIT_THRESHOLD}). Bitte aufladen, um fortzufahren.`);
        creditPaused++;
      }
    }

    return json({ ok: true, checked: briefList.length, briefing_paused: briefingPaused, credit_paused: creditPaused });
  } catch (e) {
    console.error("safety-check error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function safeEmit(admin: ReturnType<typeof createClient>, userId: string, kind: string, title: string, body: string) {
  try {
    await admin.functions.invoke("autopilot-emit-notification", {
      body: { user_id: userId, kind, title, body, payload: {} },
    });
  } catch { /* ignore */ }
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
