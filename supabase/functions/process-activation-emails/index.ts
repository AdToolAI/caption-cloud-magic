import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { renderActivationEmail, type ActivationStage, type Lang } from "./templates.ts";
import { sendEmail } from "../_shared/email-send.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { canSendMarketingEmail, markMarketingEmailSent } from "../_shared/emailFrequency.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://useadtool.ai";

const normalizeLang = (raw?: string | null): Lang => {
  const v = (raw || "en").toLowerCase().slice(0, 2);
  if (v === "de") return "de";
  if (v === "es") return "es";
  return "en";
};

// v402 Activation Contract — max 5 emails in 14 days, behaviour-gated.
// Day 0 and Day 13 are the only unconditional touchpoints.
type StageKey = "day_0" | "day_2" | "day_5" | "day_9" | "day_13";
const STAGE_DAYS: Record<StageKey, number> = {
  day_0: 0,
  day_2: 2,
  day_5: 5,
  day_9: 9,
  day_13: 13,
};
const STAGES: StageKey[] = ["day_0", "day_2", "day_5", "day_9", "day_13"];

const MAX_ACTIVATION_EMAILS = 5;
const MIN_GAP_MS = 48 * 3600000; // 48h between any two activation emails
const ACTIVITY_SILENCE_MS = 72 * 3600000; // active in the last 72h -> no nudge

/** Number of finished clips the user has produced. */
async function countFinishedClips(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("video_creations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("output_url", "is", null);
  if (error) {
    console.error("[activation] clip count error:", error);
    return 0;
  }
  return count ?? 0;
}

async function processStage(
  supabase: ReturnType<typeof createClient>,
  stage: StageKey
): Promise<{ sent: number; skipped: number }> {
  const days = STAGE_DAYS[stage];
  const now = Date.now();
  // Window anchored to email_verified_at (not created_at) so day_0 only fires AFTER verification
  const lower = new Date(now - (days + 1) * 86400000).toISOString();
  const upper = new Date(now - days * 86400000).toISOString();
  const activeCutoff = new Date(now - ACTIVITY_SILENCE_MS).toISOString();

  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, email, language, created_at, email_verified_at, last_active_at, activation_emails_sent, trial_status, email_verified")
    .eq("trial_status", "active")
    .eq("email_verified", true)
    .not("email_verified_at", "is", null)
    .gte("email_verified_at", lower)
    .lt("email_verified_at", upper)
    .limit(500);

  if (error) {
    console.error(`[activation:${stage}] query error:`, error);
    return { sent: 0, skipped: 0 };
  }
  if (!users || users.length === 0) return { sent: 0, skipped: 0 };

  let sent = 0, skipped = 0;
  for (const u of users) {
    const sentMap = (u.activation_emails_sent as Record<string, string>) || {};
    const sentKeys = Object.keys(sentMap);

    // Idempotency: this stage (in either variant) already went out
    if (sentMap[stage] || (stage === "day_5" && sentMap["day_5_series"])) {
      skipped++;
      continue;
    }

    // Hard cap: never more than 5 activation emails per user
    if (sentKeys.length >= MAX_ACTIVATION_EMAILS) {
      skipped++;
      continue;
    }

    // Minimum 48h gap between any two activation emails
    const lastSentAt = sentKeys
      .map((k) => Date.parse(sentMap[k]))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => b - a)[0];
    if (lastSentAt && now - lastSentAt < MIN_GAP_MS) {
      skipped++;
      continue;
    }

    const isNudge = stage === "day_2" || stage === "day_5" || stage === "day_9";

    // Activity suppression: an active creator does not need nudges (day_0 / day_13 exempt)
    if (isNudge && u.last_active_at && (u.last_active_at as string) > activeCutoff) {
      skipped++;
      continue;
    }

    // Behaviour gate
    let templateStage: ActivationStage = stage;
    if (isNudge) {
      const clips = await countFinishedClips(supabase, u.id as string);
      if (stage === "day_2" && clips > 0) {
        skipped++;
        continue;
      }
      if (stage === "day_5") {
        // With a finished clip the user gets exactly one "make it a series" email
        templateStage = clips > 0 ? "day_5_series" : "day_5";
      }
      if (stage === "day_9" && clips > 0) {
        // Producers exit the sequence after the series email
        skipped++;
        continue;
      }
    }

    // Global frequency cap for pure nudges (day_0 welcome and day_13 trial notice bypass)
    const tpl = `activation_${templateStage}`;
    if (isNudge && !(await canSendMarketingEmail(supabase, u.id, tpl))) {
      skipped++;
      continue;
    }

    try {
      const lang = normalizeLang(u.language as string);
      const { subject, html } = renderActivationEmail({
        stage: templateStage,
        lang,
        appUrl: APP_URL,
        userEmail: u.email as string,
      });
      await sendEmail({
        to: u.email as string,
        subject,
        html,
        template: tpl,
        category: isNudge ? "marketing" : "transactional",
      });

      // Mark as sent (store under the canonical stage key + variant marker)
      const stamp = new Date().toISOString();
      const nextMap: Record<string, string> = { ...sentMap, [templateStage]: stamp };
      if (templateStage === "day_5_series") nextMap["day_5"] = stamp;
      await supabase
        .from("profiles")
        .update({ activation_emails_sent: nextMap })
        .eq("id", u.id);

      await markMarketingEmailSent(supabase, u.id);

      sent++;
    } catch (e) {
      console.error(`[activation:${stage}] send error for ${u.email}:`, e);
    }
  }
  return { sent, skipped };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "process-activation-emails" });


  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const startedAt = Date.now();
  const results: Record<string, { sent: number; skipped: number }> = {};

  try {
    for (const stage of STAGES) {
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
