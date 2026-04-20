import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderActivationEmail, type ActivationStage, type Lang } from "./templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://useadtool.ai";
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const normalizeLang = (raw?: string | null): Lang => {
  const v = (raw || "en").toLowerCase().slice(0, 2);
  if (v === "de") return "de";
  if (v === "es") return "es";
  return "en";
};

const STAGE_DAYS: Record<ActivationStage, number> = {
  day_0: 0,
  day_1: 1,
  day_3: 3,
  day_7: 7,
};

async function processStage(
  supabase: ReturnType<typeof createClient>,
  stage: ActivationStage
): Promise<{ sent: number; skipped: number }> {
  const days = STAGE_DAYS[stage];
  const now = Date.now();
  // Window: users created between [days+1, days] days ago (24h window)
  const lower = new Date(now - (days + 1) * 86400000).toISOString();
  const upper = new Date(now - days * 86400000).toISOString();
  const activeCutoff = new Date(now - 24 * 3600000).toISOString();

  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, email, language, created_at, last_active_at, activation_emails_sent, trial_status")
    .eq("trial_status", "active")
    .gte("created_at", lower)
    .lt("created_at", upper)
    .limit(500);

  if (error) {
    console.error(`[activation:${stage}] query error:`, error);
    return { sent: 0, skipped: 0 };
  }
  if (!users || users.length === 0) return { sent: 0, skipped: 0 };

  let sent = 0, skipped = 0;
  for (const u of users) {
    // Idempotency
    const sentMap = (u.activation_emails_sent as Record<string, string>) || {};
    if (sentMap[stage]) {
      skipped++;
      continue;
    }

    // Activity-suppression for day_1+ (skip if active in last 24h)
    if (stage !== "day_0" && u.last_active_at && u.last_active_at > activeCutoff) {
      skipped++;
      continue;
    }

    try {
      const lang = normalizeLang(u.language as string);
      const { subject, html } = renderActivationEmail({
        stage,
        lang,
        appUrl: APP_URL,
        userEmail: u.email as string,
      });
      await resend.emails.send({
        from: "AdTool <hello@useadtool.ai>",
        to: [u.email as string],
        subject,
        html,
      });

      // Mark as sent
      await supabase
        .from("profiles")
        .update({
          activation_emails_sent: { ...sentMap, [stage]: new Date().toISOString() },
        })
        .eq("id", u.id);

      sent++;
    } catch (e) {
      console.error(`[activation:${stage}] send error for ${u.email}:`, e);
    }
  }
  return { sent, skipped };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const startedAt = Date.now();
  const results: Record<string, { sent: number; skipped: number }> = {};

  try {
    for (const stage of ["day_0", "day_1", "day_3", "day_7"] as ActivationStage[]) {
      results[stage] = await processStage(supabase, stage);
    }
    return new Response(
      JSON.stringify({ ok: true, results, durationMs: Date.now() - startedAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[activation] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
