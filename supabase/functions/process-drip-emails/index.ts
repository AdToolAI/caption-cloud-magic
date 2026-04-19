// process-drip-emails
// Cron-triggered (hourly). Sends drip emails at 24h / 72h / 7d after signup.
// Idempotent: drip_email_log unique index prevents double-sends.
// Dry-run mode: ?dry_run=true&user_id=<uuid>&step=1 sends without DB log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { renderDripEmail, isSupportedLang } from "../_shared/drip-templates/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "AdTool <notify@useadtool.ai>";
const BASE_URL = "https://useadtool.ai";

interface ProgressInput {
  userId: string;
}

async function computeProgress(supabase: any, userId: string) {
  const [onboardingRes, videoRes, socialRes, calendarRes, brandRes] = await Promise.all([
    supabase.from("onboarding_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase.from("video_creations").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("social_connections").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("calendar_events").select("id", { count: "exact", head: true }).eq("created_by", userId),
    supabase.from("brand_kits").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const steps = [
    { key: "onboarding", done: !!onboardingRes.data, route: "/onboarding" },
    { key: "first_video", done: (videoRes.count ?? 0) > 0, route: "/hailuo-video-studio" },
    { key: "social_connected", done: (socialRes.count ?? 0) > 0, route: "/hub/social-management" },
    { key: "post_planned", done: (calendarRes.count ?? 0) > 0, route: "/calendar" },
    { key: "brand_kit", done: (brandRes.count ?? 0) > 0, route: "/brand-kit" },
  ];
  const completedCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  const percent = Math.round((completedCount / totalCount) * 100);
  const firstOpen = steps.find((s) => !s.done);
  return { steps, completedCount, totalCount, percent, firstOpen };
}

const STEP_LABELS: Record<string, Record<"de" | "en" | "es", string>> = {
  onboarding: { de: "Onboarding abschließen", en: "Complete onboarding", es: "Completar incorporación" },
  first_video: { de: "Erstes Video erstellen", en: "Create your first video", es: "Crear tu primer video" },
  social_connected: { de: "Social-Konto verbinden", en: "Connect a social account", es: "Conectar cuenta social" },
  post_planned: { de: "Post planen", en: "Schedule a post", es: "Programar una publicación" },
  brand_kit: { de: "Brand Kit anlegen", en: "Create your Brand Kit", es: "Crear tu Brand Kit" },
};

async function sendOneDrip(
  supabase: any,
  user: { id: string; email: string; created_at: string },
  step: 1 | 3 | 7,
  options: { dryRun: boolean; overrideEmail?: string }
): Promise<{ status: string; messageId?: string; error?: string; progress?: number }> {
  // Load profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, language, drip_emails_enabled, unsubscribe_token, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return { status: "skipped", error: "no_profile" };
  if (!options.dryRun && profile.drip_emails_enabled === false) {
    return { status: "skipped", error: "user_unsubscribed" };
  }

  // Compute progress
  const progress = await computeProgress(supabase, user.id);

  // Threshold: skip if user already done enough
  if (!options.dryRun) {
    if (step === 1 && progress.percent >= 100) return { status: "skipped", error: "threshold_met" };
    if (step === 3 && progress.percent >= 60) return { status: "skipped", error: "threshold_met" };
    if (step === 7 && progress.percent >= 100) return { status: "skipped", error: "threshold_met" };
  }

  const lang = isSupportedLang(profile.language);
  const firstOpen = progress.firstOpen ?? progress.steps[0];
  const nextStepLabel = STEP_LABELS[firstOpen.key]?.[lang] ?? firstOpen.key;
  const nextStepUrl = `${BASE_URL}${firstOpen.route}`;
  const unsubscribeUrl = `${BASE_URL}/email-preferences?token=${profile.unsubscribe_token}`;
  const firstName = profile.full_name?.split(" ")[0];

  const { subject, html, text } = renderDripEmail(step, lang, {
    firstName,
    progressPercent: progress.percent,
    completedCount: progress.completedCount,
    totalCount: progress.totalCount,
    nextStepLabel,
    nextStepUrl,
    unsubscribeUrl,
    baseUrl: BASE_URL,
  });

  const recipient = options.overrideEmail ?? profile.email ?? user.email;
  if (!recipient) return { status: "skipped", error: "no_recipient" };

  // Send via Resend
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [recipient],
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [
        { name: "type", value: "drip" },
        { name: "step", value: String(step) },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { status: "failed", error: errText.slice(0, 500), progress: progress.percent };
  }
  const json = await resp.json();
  return { status: options.dryRun ? "dry_run" : "sent", messageId: json.id, progress: progress.percent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const dryUserId = url.searchParams.get("user_id");
  const dryStepParam = url.searchParams.get("step");
  const overrideEmail = url.searchParams.get("email") ?? undefined;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ---------- DRY RUN MODE ----------
  if (dryRun) {
    if (!dryUserId || !dryStepParam) {
      return new Response(JSON.stringify({ error: "dry_run requires user_id and step" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const step = parseInt(dryStepParam, 10) as 1 | 3 | 7;
    if (![1, 3, 7].includes(step)) {
      return new Response(JSON.stringify({ error: "step must be 1, 3, or 7" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve user from auth.users
    const { data: userResp, error: userErr } = await supabase.auth.admin.getUserById(dryUserId);
    if (userErr || !userResp.user) {
      return new Response(JSON.stringify({ error: "user not found", details: userErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const u = userResp.user;
    const result = await sendOneDrip(
      supabase,
      { id: u.id, email: u.email!, created_at: u.created_at },
      step,
      { dryRun: true, overrideEmail }
    );
    return new Response(JSON.stringify({ dry_run: true, step, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ---------- CRON MODE ----------
  // Find users in 24h±30min, 72h±30min, 7d±30min windows.
  const now = Date.now();
  const windows: { step: 1 | 3 | 7; min: Date; max: Date }[] = [
    { step: 1, min: new Date(now - (24 * 60 + 30) * 60_000), max: new Date(now - (24 * 60 - 30) * 60_000) },
    { step: 3, min: new Date(now - (72 * 60 + 30) * 60_000), max: new Date(now - (72 * 60 - 30) * 60_000) },
    { step: 7, min: new Date(now - (7 * 24 * 60 + 30) * 60_000), max: new Date(now - (7 * 24 * 60 - 30) * 60_000) },
  ];

  const summary: Array<{ step: number; user_id: string; status: string; error?: string }> = [];

  for (const w of windows) {
    // List users via auth admin API; filter client-side by created_at window.
    // For projects with many users, paginate.
    let page = 1;
    const perPage = 200;
    let foundInWindow = 0;

    while (page <= 20) {
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage });
      if (listErr || !list?.users?.length) break;

      const inWindow = list.users.filter((u: any) => {
        const created = new Date(u.created_at).getTime();
        return created >= w.min.getTime() && created <= w.max.getTime();
      });

      foundInWindow += inWindow.length;

      for (const u of inWindow) {
        // Check log for idempotency (sent or failed already counts)
        const { data: existing } = await supabase
          .from("drip_email_log")
          .select("id")
          .eq("user_id", u.id)
          .eq("drip_step", w.step)
          .in("status", ["sent", "failed"])
          .maybeSingle();
        if (existing) continue;

        const result = await sendOneDrip(
          supabase,
          { id: u.id, email: u.email!, created_at: u.created_at },
          w.step,
          { dryRun: false }
        );

        // Log everything except threshold/disabled skips (those we may want to retry on next cron if state changes)
        const shouldLog = result.status === "sent" || result.status === "failed";
        if (shouldLog) {
          await supabase.from("drip_email_log").insert({
            user_id: u.id,
            drip_step: w.step,
            status: result.status,
            progress_at_send: result.progress ?? null,
            resend_message_id: result.messageId ?? null,
            error_message: result.error ?? null,
          });
        }
        summary.push({ step: w.step, user_id: u.id, status: result.status, error: result.error });
      }

      // If we got fewer than perPage, we're done paginating
      if (list.users.length < perPage) break;
      page += 1;
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: summary.length, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
