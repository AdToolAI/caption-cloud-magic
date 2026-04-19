import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Lang = "en" | "de" | "es";
type Step = 1 | 3 | 7;

const PUSH_TEXTS: Record<Step, Record<Lang, { title: string; body: (stepsLeft: number) => string; url: string }>> = {
  1: {
    en: { title: "Your first video awaits 🎬", body: () => "Create it in 90 seconds", url: "/hailuo-video-studio" },
    de: { title: "Dein erstes Video wartet 🎬", body: () => "Erstelle es in 90 Sekunden", url: "/hailuo-video-studio" },
    es: { title: "Tu primer video te espera 🎬", body: () => "Créalo en 90 segundos", url: "/hailuo-video-studio" },
  },
  3: {
    en: { title: "You're halfway there 🚀", body: (n) => `${n} steps to go`, url: "/dashboard" },
    de: { title: "Du bist auf halbem Weg 🚀", body: (n) => `Noch ${n} Schritte bis zum Erfolg`, url: "/dashboard" },
    es: { title: "Estás a mitad de camino 🚀", body: (n) => `${n} pasos para el éxito`, url: "/dashboard" },
  },
  7: {
    en: { title: "Last reminder ⏰", body: () => "Complete your setup", url: "/dashboard" },
    de: { title: "Letzte Erinnerung ⏰", body: () => "Schließe dein Setup ab", url: "/dashboard" },
    es: { title: "Último recordatorio ⏰", body: () => "Completa tu configuración", url: "/dashboard" },
  },
};

async function calculateProgress(supabase: any, userId: string): Promise<{ percent: number; completedCount: number; totalCount: number }> {
  const [onboarding, video, social, calendar, brand] = await Promise.all([
    supabase.from("onboarding_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase.from("video_creations").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("social_connections").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("calendar_events").select("id", { count: "exact", head: true }).eq("created_by", userId),
    supabase.from("brand_kits").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const completedCount = [
    !!onboarding.data,
    (video.count ?? 0) > 0,
    (social.count ?? 0) > 0,
    (calendar.count ?? 0) > 0,
    (brand.count ?? 0) > 0,
  ].filter(Boolean).length;

  return { percent: Math.round((completedCount / 5) * 100), completedCount, totalCount: 5 };
}

function shouldSendForStep(step: Step, percent: number): boolean {
  if (step === 1) return percent < 100;
  if (step === 3) return percent < 60;
  if (step === 7) return percent < 100;
  return false;
}

async function sendPushFor(supabase: any, userId: string, step: Step, lang: Lang, percent: number, completedCount: number, dryRun: boolean) {
  const localized = PUSH_TEXTS[step][lang] || PUSH_TEXTS[step].en;
  const stepsLeft = 5 - completedCount;

  // Invoke the existing send-push-notification function
  const { error: invokeErr } = await supabase.functions.invoke("send-push-notification", {
    body: {
      user_id: userId,
      title: localized.title,
      body: localized.body(stepsLeft),
      url: localized.url,
    },
  });

  if (dryRun) {
    return { status: invokeErr ? "failed" : "sent_dry_run", error: invokeErr?.message };
  }

  // Log to push_reminder_log
  const { error: logErr } = await supabase.from("push_reminder_log").insert({
    user_id: userId,
    reminder_step: step,
    progress_at_send: percent,
    status: invokeErr ? "failed" : "sent",
    error_message: invokeErr?.message ?? null,
  });

  if (logErr) console.error(`Log insert failed for ${userId} step ${step}:`, logErr.message);
  return { status: invokeErr ? "failed" : "sent", error: invokeErr?.message };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const dryUserId = url.searchParams.get("user_id");
    const dryStep = url.searchParams.get("step");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ==== DRY RUN MODE ====
    if (dryRun && dryUserId && dryStep) {
      const step = parseInt(dryStep) as Step;
      if (![1, 3, 7].includes(step)) {
        return new Response(JSON.stringify({ error: "step must be 1, 3 or 7" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("language")
        .eq("id", dryUserId)
        .maybeSingle();

      const lang = ((profile?.language as string) || "en") as Lang;
      const validLang = (["en", "de", "es"].includes(lang) ? lang : "en") as Lang;
      const { percent, completedCount } = await calculateProgress(supabase, dryUserId);

      const result = await sendPushFor(supabase, dryUserId, step, validLang, percent, completedCount, true);
      return new Response(JSON.stringify({ dry_run: true, user_id: dryUserId, step, lang: validLang, percent, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==== CRON MODE ====
    const now = new Date();
    const stats = { processed: 0, sent: 0, skipped: 0, failed: 0 };

    for (const step of [1, 3, 7] as Step[]) {
      const hoursAgo = step * 24;
      const windowStart = new Date(now.getTime() - (hoursAgo + 0.5) * 60 * 60 * 1000).toISOString();
      const windowEnd = new Date(now.getTime() - (hoursAgo - 0.5) * 60 * 60 * 1000).toISOString();

      // Find candidate users: signups in window with push enabled
      const { data: candidates, error: candErr } = await supabase
        .from("notification_preferences")
        .select("user_id, push_enabled, reminder_pushes_enabled, push_subscription")
        .eq("push_enabled", true)
        .eq("reminder_pushes_enabled", true)
        .not("push_subscription", "is", null);

      if (candErr) {
        console.error(`Candidate fetch failed for step ${step}:`, candErr.message);
        continue;
      }

      if (!candidates || candidates.length === 0) continue;

      const userIds = candidates.map((c: any) => c.user_id);

      // Get profiles in time window with drip eligibility
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, language, created_at")
        .in("id", userIds)
        .gte("created_at", windowStart)
        .lte("created_at", windowEnd);

      if (!profiles || profiles.length === 0) continue;

      // Skip users who already received this step
      const profileIds = profiles.map((p: any) => p.id);
      const { data: alreadySent } = await supabase
        .from("push_reminder_log")
        .select("user_id")
        .eq("reminder_step", step)
        .in("user_id", profileIds);

      const sentSet = new Set((alreadySent ?? []).map((r: any) => r.user_id));
      const eligible = profiles.filter((p: any) => !sentSet.has(p.id));

      for (const profile of eligible) {
        stats.processed++;
        try {
          const { percent, completedCount } = await calculateProgress(supabase, profile.id);

          if (!shouldSendForStep(step, percent)) {
            stats.skipped++;
            // Mark as skipped to avoid re-checking
            await supabase.from("push_reminder_log").insert({
              user_id: profile.id,
              reminder_step: step,
              progress_at_send: percent,
              status: "skipped_threshold",
            });
            continue;
          }

          const lang = (["en", "de", "es"].includes(profile.language) ? profile.language : "en") as Lang;
          const result = await sendPushFor(supabase, profile.id, step, lang, percent, completedCount, false);
          if (result.status === "sent") stats.sent++;
          else stats.failed++;
        } catch (err: any) {
          stats.failed++;
          console.error(`Push reminder failed for ${profile.id} step ${step}:`, err.message);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, ...stats, ran_at: now.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("process-push-reminders error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
