import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { renderReminderEmail, type Lang } from "./templates.ts";

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

  try {
    const now = Date.now();
    const lower = new Date(now - 72 * 3600000).toISOString(); // 72h ago
    const upper = new Date(now - 24 * 3600000).toISOString(); // 24h ago

    // Find unverified users registered 24-72h ago, no reminder sent yet
    const { data: users, error } = await supabase
      .from("profiles")
      .select("id, email, language, created_at")
      .eq("email_verified", false)
      .is("verify_reminder_sent_at", null)
      .gte("created_at", lower)
      .lt("created_at", upper)
      .limit(200);

    if (error) {
      console.error("[verify-reminders] query error:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: "no candidates" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let failed = 0;

    for (const u of users) {
      try {
        // Generate fresh verification token (24h lifetime)
        const verificationToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

        const { error: tokenErr } = await supabase
          .from("email_verification_tokens")
          .upsert({
            user_id: u.id,
            token: verificationToken,
            email: u.email as string,
            expires_at: expiresAt,
            verified_at: null,
            created_at: new Date().toISOString(),
          }, { onConflict: "user_id" });

        if (tokenErr) {
          console.error(`[verify-reminders] token upsert failed for ${u.email}:`, tokenErr);
          failed++;
          continue;
        }

        const lang = normalizeLang(u.language as string);
        const verifyUrl = `${APP_URL}/verify-email?token=${verificationToken}`;
        const { subject, html } = renderReminderEmail({
          lang,
          appUrl: APP_URL,
          verifyUrl,
          userEmail: u.email as string,
        });

        await resend.emails.send({
          from: "AdTool <hello@useadtool.ai>",
          to: [u.email as string],
          subject,
          html,
        });

        // Mark reminder as sent (idempotency)
        await supabase
          .from("profiles")
          .update({ verify_reminder_sent_at: new Date().toISOString() })
          .eq("id", u.id);

        sent++;
      } catch (e) {
        console.error(`[verify-reminders] send error for ${u.email}:`, e);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent, failed, candidates: users.length, durationMs: Date.now() - startedAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[verify-reminders] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
