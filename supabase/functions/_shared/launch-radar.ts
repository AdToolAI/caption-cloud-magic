// Launch Radar — instant admin signals for the earliest traction moments.
//
// Usage (server-side only, service role):
//   import { sendRadarAlert, claimMilestone } from "../_shared/launch-radar.ts";
//   await sendRadarAlert({ kind: "purchase", title: "Neues Abo", lines: [...] });

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { sendAdminEmail } from "./admin-mail.ts";
import { ADMIN_ALERT_EMAIL } from "./admin-config.ts";

export type RadarKind = "signup" | "first_render" | "purchase" | "milestone";

export interface RadarAlertOptions {
  kind: RadarKind;
  /** Short headline, e.g. "Neues Abo abgeschlossen". */
  title: string;
  /** Key/value lines rendered as a table in the email. */
  lines: Array<[string, string]>;
  /** Stable key used for de-duplication (no double sends on retries). */
  dedupeKey?: string;
  /** Highlight styling for milestone-level events. */
  highlight?: boolean;
}

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return _admin;
}

const GOLD = "#F5C76A";
const INK = "#050816";

function renderHtml(opts: RadarAlertOptions): string {
  const rows = opts.lines
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#8b8b8b;font-size:13px;white-space:nowrap">${escapeHtml(
          k,
        )}</td><td style="padding:6px 0;color:${INK};font-size:14px;font-weight:600">${escapeHtml(
          v,
        )}</td></tr>`,
    )
    .join("");

  const badge = opts.highlight
    ? `<div style="display:inline-block;background:${GOLD};color:${INK};font-size:11px;font-weight:700;letter-spacing:1px;padding:4px 10px;border-radius:999px;margin-bottom:14px">MEILENSTEIN</div>`
    : `<div style="display:inline-block;background:#f1f1f1;color:#555;font-size:11px;font-weight:700;letter-spacing:1px;padding:4px 10px;border-radius:999px;margin-bottom:14px">LAUNCH RADAR</div>`;

  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Inter,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:28px 24px">
    ${badge}
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${INK}">${escapeHtml(opts.title)}</h1>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <p style="margin:24px 0 0;font-size:12px;color:#9a9a9a">AdTool AI · Launch Radar</p>
  </div></body></html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Claims a one-time milestone. Returns true only for the very first caller.
 */
export async function claimMilestone(
  key: string,
  label?: string,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  const { data, error } = await admin()
    .from("launch_milestones")
    .insert({ key, label: label ?? key, payload })
    .select("key")
    .maybeSingle();

  if (error) {
    // 23505 = already achieved
    if ((error as { code?: string }).code !== "23505") {
      console.error("[LAUNCH-RADAR] claimMilestone error:", error.message);
    }
    return false;
  }
  return !!data;
}

/**
 * Sends an admin alert. De-duplicated via alert_notifications so retries
 * (Stripe redelivery, watchdogs) never produce a second email.
 */
export async function sendRadarAlert(opts: RadarAlertOptions): Promise<void> {
  try {
    const dedupeKey = opts.dedupeKey ?? `${opts.kind}:${opts.title}:${Date.now()}`;
    const alertType = `radar:${dedupeKey}`.slice(0, 200);

    const { data: existing } = await admin()
      .from("alert_notifications")
      .select("id")
      .eq("alert_type", alertType)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log("[LAUNCH-RADAR] duplicate suppressed:", alertType);
      return;
    }

    await admin().from("alert_notifications").insert({
      alert_type: alertType,
      severity: opts.highlight ? "info" : "info",
      metric_value: 1,
      threshold: 0,
      message: opts.title,
    });

    const result = await sendAdminEmail({
      to: ADMIN_ALERT_EMAIL,
      subject: `${opts.highlight ? "🏆 " : ""}${opts.title}`,
      html: renderHtml(opts),
      label: `launch_radar_${opts.kind}`,
    });

    if (!result.ok) {
      console.error("[LAUNCH-RADAR] email failed:", result.error);
    }

  } catch (e) {
    // Radar must never break the caller's business logic.
    console.error("[LAUNCH-RADAR] sendRadarAlert error:", e instanceof Error ? e.message : e);
  }
}

/** Formats a Stripe minor-unit amount, e.g. 1499 / "eur" -> "14,99 EUR". */
export function formatAmount(minor: number | null | undefined, currency?: string | null): string {
  if (minor == null) return "–";
  const value = (minor / 100).toFixed(2).replace(".", ",");
  return `${value} ${(currency || "eur").toUpperCase()}`;
}
