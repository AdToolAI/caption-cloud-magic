import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { sendEmail } from "../_shared/email-send.ts";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
import { canSendMarketingEmail, markMarketingEmailSent } from "../_shared/emailFrequency.ts";

type Lang = "de" | "en" | "es";

const GRACE_PERIOD_DAYS = 14;

// ---------- Email copy ----------

const trialExpiredCopy: Record<Lang, { subject: string; heading: string; intro: string; cta: string; footnote: string }> = {
  de: {
    subject: "Dein 14-Tage Enterprise-Trial ist abgelaufen 🔒",
    heading: "Dein Trial ist beendet",
    intro: "Dein 14-Tage Enterprise-Trial ist heute abgelaufen, und auch deine 14-Tage Grace-Period ist vorbei. Damit du wieder posten, generieren und veröffentlichen kannst, wähle jetzt einen Plan – schon ab €19/Monat.",
    cta: "Plan wählen & freischalten",
    footnote: "Deine Daten und Assets bleiben gespeichert. Du verlierst nichts.",
  },
  en: {
    subject: "Your 14-day Enterprise trial has ended 🔒",
    heading: "Your trial has ended",
    intro: "Your 14-day Enterprise trial expired and your 14-day grace period is over. To resume creating, generating and publishing, pick a plan – starting at €19/month.",
    cta: "Choose plan & unlock",
    footnote: "Your data and assets stay safe. Nothing is lost.",
  },
  es: {
    subject: "Tu prueba Enterprise de 14 días ha terminado 🔒",
    heading: "Tu prueba ha terminado",
    intro: "Tu prueba Enterprise de 14 días expiró y tu período de gracia de 14 días terminó. Para seguir creando, generando y publicando, elige un plan – desde €19/mes.",
    cta: "Elegir plan y desbloquear",
    footnote: "Tus datos y assets siguen seguros. No pierdes nada.",
  },
};

const graceWarningCopy: Record<Lang, { subject: string; heading: string; intro: string; cta: string; footnote: string }> = {
  de: {
    subject: "⚠ Dein Trial ist abgelaufen — du hast noch 14 Tage Zugriff",
    heading: "Trial vorbei — 14 Tage Grace-Period läuft",
    intro: "Dein 14-Tage Enterprise-Trial ist abgelaufen. Wir geben dir 14 zusätzliche Tage, um in Ruhe einen Plan zu wählen. Danach wird dein Konto pausiert, bis du abonnierst. Deine Daten bleiben sicher.",
    cta: "Jetzt Plan wählen",
    footnote: "Tipp: Mit einem Plan-Abschluss innerhalb der nächsten 14 Tage vermeidest du jede Unterbrechung.",
  },
  en: {
    subject: "⚠ Your trial has ended — you have 14 days left to upgrade",
    heading: "Trial over — 14-day grace period started",
    intro: "Your 14-day Enterprise trial has expired. We're giving you 14 extra days to pick a plan at your own pace. After that, your account will be paused until you subscribe. Your data stays safe.",
    cta: "Choose plan now",
    footnote: "Tip: Subscribe within the next 14 days to avoid any interruption.",
  },
  es: {
    subject: "⚠ Tu prueba ha terminado — te quedan 14 días",
    heading: "Prueba terminada — período de gracia de 14 días",
    intro: "Tu prueba Enterprise de 14 días ha expirado. Te damos 14 días adicionales para elegir un plan con calma. Después, tu cuenta será pausada hasta que te suscribas. Tus datos están seguros.",
    cta: "Elegir plan ahora",
    footnote: "Consejo: Suscríbete en los próximos 14 días para evitar cualquier interrupción.",
  },
};

// Countdown reminders (Day 3 / 6 / 9 — soft, cap-aware)
const countdownCopy: Record<Lang, (daysLeft: number) => { subject: string; heading: string; intro: string; cta: string; footnote: string }> = {
  de: (d) => ({
    subject: `Noch ${d} Tage in deinem Enterprise-Trial ⏳`,
    heading: `Noch ${d} Tage volle Power`,
    intro: `Du hast noch ${d} Tage in deinem 14-Tage Enterprise-Trial — alle Premium-Features, Lip-Sync, 4K-Renders und Cross-Post Magic. Nutze die Zeit, um dein erstes Creator-Reel live zu schalten.`,
    cta: "Studio öffnen",
    footnote: "Du erhältst diese Erinnerung maximal alle 3 Tage — keine Spam-Mails versprochen.",
  }),
  en: (d) => ({
    subject: `${d} days left in your Enterprise trial ⏳`,
    heading: `${d} days of full power left`,
    intro: `You have ${d} days left in your 14-day Enterprise trial — full premium access, Lip-Sync, 4K renders and Cross-Post Magic. Make them count.`,
    cta: "Open Studio",
    footnote: "We send this reminder at most every 3 days — no spam, promise.",
  }),
  es: (d) => ({
    subject: `Quedan ${d} días de tu prueba Enterprise ⏳`,
    heading: `${d} días de potencia completa`,
    intro: `Te quedan ${d} días en tu prueba Enterprise de 14 días — acceso premium completo, Lip-Sync, renders 4K y Cross-Post Magic. Aprovecha el tiempo.`,
    cta: "Abrir Studio",
    footnote: "Enviamos este recordatorio como máximo cada 3 días — sin spam.",
  }),
};

// Final-day warning (Day 13 — bypass cap, also push)
const finalDayCopy: Record<Lang, { subject: string; heading: string; intro: string; cta: string; footnote: string }> = {
  de: {
    subject: "⚠ Letzter Tag: Dein Enterprise-Trial endet morgen",
    heading: "Letzter Tag deines Trials",
    intro: "Morgen endet dein 14-Tage Enterprise-Trial. Danach starten 14 zusätzliche Grace-Tage, bevor dein Konto pausiert wird. Sicher dir jetzt deinen Plan und vermeide jede Unterbrechung.",
    cta: "Plan jetzt sichern",
    footnote: "Du wirst diese Warnung nur einmal sehen.",
  },
  en: {
    subject: "⚠ Final day: your Enterprise trial ends tomorrow",
    heading: "Final day of your trial",
    intro: "Your 14-day Enterprise trial ends tomorrow. After that, 14 grace days start before your account is paused. Lock in your plan now to avoid any interruption.",
    cta: "Lock in plan now",
    footnote: "You'll only see this warning once.",
  },
  es: {
    subject: "⚠ Último día: tu prueba Enterprise termina mañana",
    heading: "Último día de tu prueba",
    intro: "Tu prueba Enterprise de 14 días termina mañana. Después comienzan 14 días de gracia antes de que se pause tu cuenta. Asegura tu plan ahora para evitar cualquier interrupción.",
    cta: "Asegurar plan ahora",
    footnote: "Solo verás esta advertencia una vez.",
  },
};

// Pre-pause warning (1 day before account pause — bypass cap)
const prePauseCopy: Record<Lang, { subject: string; heading: string; intro: string; cta: string; footnote: string }> = {
  de: {
    subject: "⚠ Letzter Tag bevor dein Konto pausiert wird",
    heading: "Morgen wird dein Konto pausiert",
    intro: "Deine 14-Tage Grace-Period endet morgen. Wenn du bis dahin keinen Plan wählst, wird dein Konto pausiert. Deine Daten bleiben gespeichert, aber Renders, Posts und Lip-Sync sind dann blockiert.",
    cta: "Konto reaktivieren",
    footnote: "Diese Warnung erhältst du nur einmal — wir möchten dich nicht überraschen.",
  },
  en: {
    subject: "⚠ Final day before your account is paused",
    heading: "Your account will be paused tomorrow",
    intro: "Your 14-day grace period ends tomorrow. If you don't pick a plan by then, your account will be paused. Your data stays safe, but rendering, publishing and Lip-Sync will be blocked.",
    cta: "Reactivate account",
    footnote: "You'll only get this warning once — no surprises.",
  },
  es: {
    subject: "⚠ Último día antes de que se pause tu cuenta",
    heading: "Mañana se pausará tu cuenta",
    intro: "Tu período de gracia de 14 días termina mañana. Si no eliges un plan, tu cuenta será pausada. Tus datos siguen seguros, pero el renderizado, publicación y Lip-Sync se bloquearán.",
    cta: "Reactivar cuenta",
    footnote: "Solo recibirás esta advertencia una vez — sin sorpresas.",
  },
};

function renderEmail(
  copy: { subject: string; heading: string; intro: string; cta: string; footnote: string },
  appUrl: string,
  userEmail: string,
) {
  const ctaUrl = `${appUrl.replace(/\/$/, "")}/pricing?reactivate=1`;
  const styles = `body{margin:0;background:#0a0a0f;font-family:Inter,-apple-system,sans-serif;color:#e8e6e1}.wrap{max-width:560px;margin:0 auto;padding:40px 24px}.card{background:linear-gradient(180deg,#15151f,#0e0e16);border:1px solid rgba(245,199,106,.15);border-radius:16px;padding:36px 28px}.logo{color:#F5C76A;font-weight:700;font-size:20px;margin-bottom:24px}h1{color:#fff;font-size:26px;margin:0 0 16px}p{color:#cfcdc7;font-size:15px;line-height:1.65;margin:0 0 18px}.cta{display:inline-block;background:linear-gradient(135deg,#F5C76A,#e0a847);color:#0a0a0f!important;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700}.foot{color:#7a7770;font-size:12px;margin-top:32px;text-align:center}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style></head><body><div class="wrap"><div class="card"><div class="logo">AdTool AI</div><h1>${copy.heading}</h1><p>${copy.intro}</p><p style="margin:28px 0;"><a class="cta" href="${ctaUrl}">${copy.cta}</a></p><p style="color:#8a8780;font-size:13px;border-top:1px solid rgba(255,255,255,.05);padding-top:20px;">${copy.footnote}</p></div><div class="foot">AdTool AI · ${userEmail}</div></div></body></html>`;
  return { subject: copy.subject, html };
}

// ---------- Setup ----------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { status: "active", daysRemaining: 14, processed: 0 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const startedAt = Date.now();
  let processed = 0, paused = 0, graceWarned = 0, emailsSent = 0, countdownSent = 0, prePauseSent = 0;

  try {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const graceCutoffIso = new Date(now - GRACE_PERIOD_DAYS * 86400_000).toISOString();

    // --- Phase 0: Trial-countdown reminders (Day 3 / 6 / 9 / 13) ---
    // Day 3/6/9 = soft (cap-aware). Day 13 = final-day warning (bypass cap).
    const { data: activeUsers } = await supabase
      .from("profiles")
      .select("id, email, language, trial_ends_at, activation_emails_sent")
      .eq("trial_status", "active")
      .gt("trial_ends_at", nowIso)
      .limit(2000);

    const COUNTDOWN_STEPS: Array<{ key: string; daysRemaining: number; bypass: boolean }> = [
      { key: "countdown_d11", daysRemaining: 11, bypass: false }, // ~ day 3
      { key: "countdown_d8",  daysRemaining: 8,  bypass: false }, // ~ day 6
      { key: "countdown_d5",  daysRemaining: 5,  bypass: false }, // ~ day 9
      { key: "trial_final_day", daysRemaining: 1, bypass: true }, // day 13
    ];

    for (const u of activeUsers ?? []) {
      if (!u.trial_ends_at) continue;
      const daysLeft = Math.ceil((new Date(u.trial_ends_at).getTime() - now) / 86_400_000);
      const step = COUNTDOWN_STEPS.find((s) => s.daysRemaining === daysLeft);
      if (!step) continue;

      const sentMap = (u.activation_emails_sent as Record<string, string> | null) || {};
      if (sentMap[step.key]) continue;

      const templateName = step.key === "trial_final_day" ? "trial_final_day" : `trial_${step.key}`;

      if (!step.bypass && !(await canSendMarketingEmail(supabase, u.id, templateName))) {
        continue; // global cap → wait for next run
      }

      try {
        const lang = normalizeLang(u.language);
        const copy = step.bypass
          ? finalDayCopy[lang]
          : countdownCopy[lang](daysLeft);
        const { subject, html } = renderEmail(copy, APP_URL, u.email);
        await sendEmail({
          to: u.email,
          subject,
          html,
          template: templateName,
          category: "marketing",
        });
        await supabase
          .from("profiles")
          .update({ activation_emails_sent: { ...sentMap, [step.key]: new Date().toISOString() } })
          .eq("id", u.id);
        if (!step.bypass) await markMarketingEmailSent(supabase, u.id);
        countdownSent++;
        emailsSent++;
        processed++;
      } catch (e) {
        console.error(`[check-trial-status] countdown ${step.key} error:`, e);
      }
    }

    // --- Phase 1: Trial just expired → enter grace period + send warning email ---
    const { data: graceUsers } = await supabase
      .from("profiles")
      .select("id, email, language, trial_ends_at, activation_emails_sent")
      .eq("trial_status", "active")
      .lt("trial_ends_at", nowIso)
      .gt("trial_ends_at", graceCutoffIso)
      .limit(500);

    for (const user of graceUsers ?? []) {
      processed++;
      const sentMap = (user.activation_emails_sent as Record<string, string> | null) || {};
      if (sentMap.grace_warning) continue;

      // Mark as in grace (status stays usable; account NOT paused yet)
      await supabase
        .from("profiles")
        .update({
          trial_status: "grace",
          activation_emails_sent: { ...sentMap, grace_warning: new Date().toISOString() },
        })
        .eq("id", user.id);

      graceWarned++;

      try {
        const lang = normalizeLang(user.language);
        const { subject, html } = renderEmail(graceWarningCopy[lang], APP_URL, user.email);
        await sendEmail({
          to: user.email,
          subject,
          html,
          template: "trial_grace_warning",
          category: "marketing",
        });
        emailsSent++;
      } catch (e) {
        console.error("[check-trial-status] grace email error:", e);
      }
    }

    // --- Phase 1.5: Grace pre-pause warning (1 day before pause, bypass cap) ---
    const prePauseLowerIso = new Date(now - (GRACE_PERIOD_DAYS - 1) * 86_400_000).toISOString();
    const prePauseUpperIso = new Date(now - (GRACE_PERIOD_DAYS - 2) * 86_400_000).toISOString();
    const { data: prePauseUsers } = await supabase
      .from("profiles")
      .select("id, email, language, trial_ends_at, activation_emails_sent")
      .eq("trial_status", "grace")
      .gte("trial_ends_at", prePauseLowerIso)
      .lt("trial_ends_at", prePauseUpperIso)
      .limit(500);

    for (const u of prePauseUsers ?? []) {
      const sentMap = (u.activation_emails_sent as Record<string, string> | null) || {};
      if (sentMap.pre_pause) continue;
      try {
        const lang = normalizeLang(u.language);
        const { subject, html } = renderEmail(prePauseCopy[lang], APP_URL, u.email);
        await sendEmail({
          to: u.email,
          subject,
          html,
          template: "trial_pre_pause",
          category: "marketing",
        });
        await supabase
          .from("profiles")
          .update({ activation_emails_sent: { ...sentMap, pre_pause: new Date().toISOString() } })
          .eq("id", u.id);
        prePauseSent++;
        emailsSent++;
        processed++;
      } catch (e) {
        console.error("[check-trial-status] pre-pause email error:", e);
      }
    }

    // --- Phase 2: Grace period over → pause account ---
    const { data: expiredUsers, error } = await supabase
      .from("profiles")
      .select("id, email, language, trial_ends_at, plan, stripe_customer_id")
      .in("trial_status", ["active", "grace"])
      .lt("trial_ends_at", graceCutoffIso)
      .limit(500);

    if (error) throw error;

    for (const user of expiredUsers ?? []) {
      processed++;

      const { data: wallet } = await supabase
        .from("wallets")
        .select("plan_code")
        .eq("user_id", user.id)
        .maybeSingle();

      const hasPaidPlan =
        (user.plan && ["basic", "pro", "enterprise"].includes(user.plan)) ||
        (wallet?.plan_code && ["basic", "pro"].includes(wallet.plan_code)) ||
        !!user.stripe_customer_id;

      if (hasPaidPlan) {
        await supabase
          .from("profiles")
          .update({ trial_status: "converted", account_paused: false })
          .eq("id", user.id);
        continue;
      }

      // Pause account + downgrade wallet
      await supabase
        .from("profiles")
        .update({ trial_status: "expired", account_paused: true })
        .eq("id", user.id);

      await supabase
        .from("wallets")
        .update({ plan_code: "free", balance: 0, monthly_credits: 100 })
        .eq("user_id", user.id);

      paused++;

      try {
        const lang = normalizeLang(user.language);
        const { subject, html } = renderEmail(trialExpiredCopy[lang], APP_URL, user.email);
        await sendEmail({
          to: user.email,
          subject,
          html,
          template: "trial_expired",
          category: "marketing",
        });
        emailsSent++;
      } catch (e) {
        console.error("[check-trial-status] expired email error:", e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        graceWarned,
        paused,
        countdownSent,
        prePauseSent,
        emailsSent,
        durationMs: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[check-trial-status] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
