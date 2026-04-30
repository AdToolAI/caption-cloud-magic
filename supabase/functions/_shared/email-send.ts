// Centralized email sender with suppression check, plain-text fallback,
// compliance headers (List-Unsubscribe) and full send-logging.
//
// Usage from any Edge Function:
//   import { sendEmail } from "../_shared/email-send.ts";
//   await sendEmail({ to, subject, html, template: "verify", category: "transactional" });

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { Resend } from "npm:resend@2.0.0";

export type EmailCategory = "transactional" | "marketing" | "system";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  template: string; // e.g. "verify", "activation_day_0"
  category: EmailCategory;
  /** Optional override of the From address. */
  from?: string;
  /** Optional Reply-To override. Defaults to support@useadtool.ai. */
  replyTo?: string;
  /** Optional extra headers to merge in. */
  extraHeaders?: Record<string, string>;
}

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  resendId?: string;
  error?: string;
}

const APP_DOMAIN = "useadtool.ai";
const APP_URL = Deno.env.get("APP_URL") || `https://${APP_DOMAIN}`;

const FROM_BY_CATEGORY: Record<EmailCategory, string> = {
  transactional: `AdTool AI <support@${APP_DOMAIN}>`,
  marketing: `AdTool AI <hello@${APP_DOMAIN}>`,
  system: `AdTool Alerts <alerts@${APP_DOMAIN}>`,
};

let _resend: Resend | null = null;
let _supabase: SupabaseClient | null = null;

function resend(): Resend {
  if (!_resend) {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) throw new Error("RESEND_API_KEY is not configured");
    _resend = new Resend(key);
  }
  return _resend;
}

function supabaseAdmin(): SupabaseClient {
  if (!_supabase) {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    _supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabase;
}

/** Strip HTML to plain text fallback. Keeps line breaks for readability. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Generate HMAC token for safe one-click unsubscribe links. */
export async function generateUnsubscribeToken(email: string): Promise<string> {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "fallback-dev-secret";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(email.toLowerCase()));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function isSuppressed(email: string): Promise<{ suppressed: boolean; reason?: string }> {
  const { data, error } = await supabaseAdmin()
    .from("email_suppression_list")
    .select("reason")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    console.warn("[email-send] suppression check error:", error.message);
    return { suppressed: false };
  }
  return data ? { suppressed: true, reason: data.reason } : { suppressed: false };
}

async function logSend(row: {
  to_email: string;
  from_email: string;
  subject: string;
  template: string;
  category: EmailCategory;
  status: "sent" | "failed" | "suppressed";
  resend_id?: string | null;
  error?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin().from("email_send_log").insert(row);
  if (error) console.warn("[email-send] log insert error:", error.message);
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const to = opts.to.trim().toLowerCase();
  const from = opts.from || FROM_BY_CATEGORY[opts.category];
  const replyTo = opts.replyTo || `support@${APP_DOMAIN}`;

  // 1. Suppression check
  const sup = await isSuppressed(to);
  if (sup.suppressed) {
    console.log(`[email-send] suppressed ${to} (${sup.reason}) — template=${opts.template}`);
    await logSend({
      to_email: to,
      from_email: from,
      subject: opts.subject,
      template: opts.template,
      category: opts.category,
      status: "suppressed",
      error: `suppressed:${sup.reason}`,
    });
    return { ok: false, skipped: true, reason: sup.reason };
  }

  // 2. Plain-text fallback
  const text = htmlToText(opts.html);

  // 3. Compliance headers (only for marketing — transactional shouldn't carry unsubscribe)
  const headers: Record<string, string> = { ...(opts.extraHeaders || {}) };
  if (opts.category === "marketing") {
    const token = await generateUnsubscribeToken(to);
    const httpUnsub = `${APP_URL}/functions/v1/email-unsubscribe?email=${encodeURIComponent(to)}&token=${token}`;
    const mailUnsub = `mailto:unsubscribe@${APP_DOMAIN}?subject=unsub:${encodeURIComponent(to)}`;
    headers["List-Unsubscribe"] = `<${mailUnsub}>, <${httpUnsub}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  // 4. Send via Resend
  try {
    const { data, error } = await resend().emails.send({
      from,
      to: [to],
      subject: opts.subject,
      html: opts.html,
      text,
      reply_to: replyTo,
      headers,
    });
    if (error) {
      await logSend({
        to_email: to,
        from_email: from,
        subject: opts.subject,
        template: opts.template,
        category: opts.category,
        status: "failed",
        error: error.message || JSON.stringify(error),
      });
      return { ok: false, error: error.message || "resend error" };
    }
    await logSend({
      to_email: to,
      from_email: from,
      subject: opts.subject,
      template: opts.template,
      category: opts.category,
      status: "sent",
      resend_id: data?.id || null,
    });
    return { ok: true, resendId: data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSend({
      to_email: to,
      from_email: from,
      subject: opts.subject,
      template: opts.template,
      category: opts.category,
      status: "failed",
      error: msg,
    });
    return { ok: false, error: msg };
  }
}

/** Convenience: add an email manually to suppression list. */
export async function suppressEmail(
  email: string,
  reason: "bounce" | "complaint" | "unsubscribe" | "manual",
  details?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("email_suppression_list")
    .upsert({
      email: email.trim().toLowerCase(),
      reason,
      details: details || null,
      suppressed_at: new Date().toISOString(),
    }, { onConflict: "email" });
  if (error) console.warn("[email-send] suppress upsert error:", error.message);
}
