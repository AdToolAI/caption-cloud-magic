// Global 3-day frequency cap for marketing emails.
// Auth/transactional + critical trial-warnings bypass the cap.
//
// Usage:
//   import { canSendMarketingEmail, markMarketingEmailSent } from "../_shared/emailFrequency.ts";
//   if (!(await canSendMarketingEmail(supabase, userId, "activation_day_3"))) continue;
//   await sendEmail({...});
//   await markMarketingEmailSent(supabase, userId);

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";

export const MIN_INTERVAL_DAYS = 3;

/** Templates that MUST send regardless of the global cap. */
export const BYPASS_TEMPLATES = new Set<string>([
  // critical trial lifecycle warnings
  "trial_final_day",
  "trial_pre_pause",
  "trial_grace_warning",
  "trial_expired",
  "account_paused",
  // pure transactional / auth
  "verify",
  "signup",
  "magic_link",
  "recovery",
  "password_reset",
  "email_change",
  "reauthentication",
  "ticket_resolved",
  "ticket_reply",
  "verify_reminder",
  "ticket_reply",
  "invoice",
  "receipt",
]);

/**
 * Returns false when the user already received any marketing-class email
 * within the last `MIN_INTERVAL_DAYS` days.
 * Bypass-list templates always return true.
 * Also respects the `system_config.email.marketing_paused` global kill-switch.
 */
export async function canSendMarketingEmail(
  supabase: SupabaseClient,
  userId: string,
  template: string,
): Promise<boolean> {
  if (BYPASS_TEMPLATES.has(template)) return true;

  // Global kill-switch
  try {
    const { data: cfg } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "email.marketing_paused")
      .maybeSingle();
    if (cfg?.value === true || cfg?.value?.paused === true) return false;
  } catch {
    // ignore — fail open
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("last_marketing_email_at")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.last_marketing_email_at) return true;

  const lastMs = new Date(profile.last_marketing_email_at).getTime();
  const ageDays = (Date.now() - lastMs) / 86_400_000;
  return ageDays >= MIN_INTERVAL_DAYS;
}

/** Mark that a marketing email was just sent so the cap window starts now. */
export async function markMarketingEmailSent(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .update({ last_marketing_email_at: new Date().toISOString() })
      .eq("id", userId);
  } catch (e) {
    console.warn("[emailFrequency] mark send failed:", e);
  }
}
