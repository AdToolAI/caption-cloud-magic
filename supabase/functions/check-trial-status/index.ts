import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderTrialExpiredEmail, type Lang } from "../process-activation-emails/templates.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const startedAt = Date.now();
  let processed = 0, paused = 0, emailsSent = 0;

  try {
    // Find users whose trial just expired and who have no active paid subscription
    const { data: expiredUsers, error } = await supabase
      .from("profiles")
      .select("id, email, language, trial_ends_at, plan, stripe_customer_id")
      .eq("trial_status", "active")
      .lt("trial_ends_at", new Date().toISOString())
      .limit(500);

    if (error) throw error;
    if (!expiredUsers || expiredUsers.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, paused: 0, emailsSent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const user of expiredUsers) {
      processed++;

      // Check wallet for paid plan
      const { data: wallet } = await supabase
        .from("wallets")
        .select("plan_code")
        .eq("user_id", user.id)
        .maybeSingle();

      const hasPaidPlan =
        (user.plan && ["basic", "pro", "enterprise"].includes(user.plan)) ||
        (wallet?.plan_code && ["basic", "pro", "enterprise"].includes(wallet.plan_code) && wallet.plan_code !== "enterprise") ||
        !!user.stripe_customer_id;

      if (hasPaidPlan) {
        // Convert — no pause
        await supabase
          .from("profiles")
          .update({ trial_status: "converted", account_paused: false })
          .eq("id", user.id);
        continue;
      }

      // Pause account + downgrade wallet to free
      await supabase
        .from("profiles")
        .update({ trial_status: "expired", account_paused: true })
        .eq("id", user.id);

      await supabase
        .from("wallets")
        .update({ plan_code: "free", balance: 0, monthly_credits: 100 })
        .eq("user_id", user.id);

      paused++;

      // Send trial-expired email
      try {
        const lang = normalizeLang(user.language);
        const { subject, html } = renderTrialExpiredEmail({
          lang,
          appUrl: APP_URL,
          userEmail: user.email,
        });
        await resend.emails.send({
          from: "AdTool <hello@useadtool.ai>",
          to: [user.email],
          subject,
          html,
        });
        emailsSent++;
      } catch (e) {
        console.error("[check-trial-status] email error:", e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed, paused, emailsSent, durationMs: Date.now() - startedAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[check-trial-status] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
