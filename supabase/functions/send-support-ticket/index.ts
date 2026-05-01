import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendEmail } from "../_shared/email-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const SUPPORT_INBOX = "info@useadtool.ai";

interface AttachmentRef {
  path: string;
  name: string;
  size: number;
  type: string;
}

interface SupportPayload {
  // Required
  email: string;
  subject: string;
  category: string;

  // Recommended
  name?: string;
  message?: string; // legacy combined message
  severity?: "low" | "normal" | "high" | "blocking";
  affected_module?: string;

  // Wizard fields
  expected_result?: string;
  actual_result?: string;
  reproduction_steps?: string;

  // Attachments + tech context
  attachments?: AttachmentRef[];
  browser_info?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

const SEVERITY_LABEL: Record<string, string> = {
  low: "LOW",
  normal: "NORMAL",
  high: "HIGH",
  blocking: "BLOCKING",
};

const SEVERITY_COLOR: Record<string, string> = {
  low: "#10B981",
  normal: "#3B82F6",
  high: "#F59E0B",
  blocking: "#EF4444",
};

function escapeHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function buildAttachmentLinks(
  supabase: ReturnType<typeof createClient>,
  attachments: AttachmentRef[],
): Promise<Array<AttachmentRef & { signed_url: string | null }>> {
  if (!attachments?.length) return [];
  const out: Array<AttachmentRef & { signed_url: string | null }> = [];
  for (const att of attachments) {
    try {
      const { data, error } = await supabase
        .storage
        .from("support-attachments")
        .createSignedUrl(att.path, 60 * 60 * 24 * 7); // 7 days
      out.push({ ...att, signed_url: error ? null : (data?.signedUrl ?? null) });
    } catch (_e) {
      out.push({ ...att, signed_url: null });
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as SupportPayload & {
      // Legacy AI Companion compatibility
      userEmail?: string;
      description?: string;
    };

    // Normalize legacy formats
    const email = (body.email || body.userEmail || "unknown@email.com").trim().toLowerCase();
    const name = body.name?.trim() || email.split("@")[0];
    const category = (body.category || "other").trim();
    const subject = (body.subject || "Support Request").trim();
    const severity = (body.severity || "normal") as keyof typeof SEVERITY_LABEL;
    const affectedModule = body.affected_module?.trim() || "—";
    const expected = body.expected_result?.trim() || "";
    const actual = body.actual_result?.trim() || "";
    const repro = body.reproduction_steps?.trim() || "";
    const fallbackMessage = body.message?.trim() || body.description?.trim() || "";

    const browserInfo = body.browser_info || body.metadata || {};
    const attachmentRefs = Array.isArray(body.attachments) ? body.attachments.slice(0, 5) : [];

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const attachments = await buildAttachmentLinks(supabaseAdmin, attachmentRefs);

    const sevLabel = SEVERITY_LABEL[severity] ?? "NORMAL";
    const sevColor = SEVERITY_COLOR[severity] ?? "#3B82F6";

    // === Internal email ===
    const internalSubject = `[${sevLabel}] [${affectedModule}] ${subject} — ${email}`;

    const attachmentBlock = attachments.length
      ? `<div class="field">
           <div class="label">Attachments (${attachments.length})</div>
           <div class="value">
             ${attachments.map((a) => {
               const isImage = a.type?.startsWith("image/");
               const link = a.signed_url
                 ? `<a href="${escapeHtml(a.signed_url)}" target="_blank" rel="noopener">${escapeHtml(a.name)}</a>`
                 : `${escapeHtml(a.name)} <em>(no link)</em>`;
               const size = `${(a.size / 1024 / 1024).toFixed(2)} MB`;
               const preview = isImage && a.signed_url
                 ? `<div style="margin:8px 0"><img src="${escapeHtml(a.signed_url)}" alt="${escapeHtml(a.name)}" style="max-width:480px; max-height:320px; border-radius:6px; border:1px solid #e5e7eb;" /></div>`
                 : "";
               return `<div style="margin-bottom:12px; padding:8px; background:#fff; border:1px solid #e5e7eb; border-radius:6px;">
                 <div>${link} <span style="color:#6b7280; font-size:12px;">(${escapeHtml(a.type || "?")} · ${size})</span></div>
                 ${preview}
               </div>`;
             }).join("")}
           </div>
         </div>`
      : "";

    const wizardBlock = (expected || actual || repro)
      ? `${expected ? `<div class="field"><div class="label">What the user wanted to do</div><div class="value">${escapeHtml(expected)}</div></div>` : ""}
         ${actual ? `<div class="field"><div class="label">What actually happened</div><div class="value">${escapeHtml(actual)}</div></div>` : ""}
         ${repro ? `<div class="field"><div class="label">Reproduction steps</div><div class="value" style="white-space:pre-wrap">${escapeHtml(repro)}</div></div>` : ""}`
      : "";

    const fallbackBlock = fallbackMessage
      ? `<div class="field"><div class="label">Additional details</div><div class="message-box">${escapeHtml(fallbackMessage)}</div></div>`
      : "";

    const techBlock = browserInfo && Object.keys(browserInfo).length
      ? `<details style="margin-top:24px">
           <summary style="cursor:pointer; color:#6b7280; font-size:13px;">Technical context (click to expand)</summary>
           <pre style="background:#f3f4f6; padding:12px; border-radius:6px; font-size:11px; overflow:auto; white-space:pre-wrap;">${escapeHtml(JSON.stringify(browserInfo, null, 2))}</pre>
         </details>`
      : "";

    const supportHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; line-height: 1.55; color: #111; background: #f9fafb; margin: 0; padding: 0; }
  .container { max-width: 680px; margin: 0 auto; padding: 24px; }
  .header { background: linear-gradient(135deg, #050816, #1a1a2e); color: #F5C76A; padding: 24px; border-radius: 10px 10px 0 0; }
  .severity-pill { display:inline-block; padding:4px 12px; border-radius:999px; font-size:12px; font-weight:700; background:${sevColor}; color:#fff; letter-spacing:0.5px; }
  .content { background: #ffffff; padding: 28px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px; }
  .field { margin-bottom: 18px; }
  .label { font-weight: 700; color: #050816; margin-bottom: 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.4px; }
  .value { background: #f9fafb; padding: 12px 14px; border-radius: 6px; border: 1px solid #e5e7eb; }
  .message-box { background: #f9fafb; padding: 14px; border-radius: 6px; border: 1px solid #e5e7eb; white-space: pre-wrap; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
  .meta-item { background:#f9fafb; padding:10px 12px; border-radius:6px; border:1px solid #e5e7eb; font-size:13px; }
  .meta-item strong { display:block; color:#6b7280; font-size:11px; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:2px; }
</style></head><body>
  <div class="container">
    <div class="header">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
        <span class="severity-pill">${sevLabel}</span>
        <span style="color:#fff; opacity:0.8; font-size:13px;">${escapeHtml(category.toUpperCase())} · ${escapeHtml(affectedModule)}</span>
      </div>
      <h1 style="margin:8px 0 0; font-size:22px; color:#fff;">${escapeHtml(subject)}</h1>
    </div>
    <div class="content">
      <div class="meta-grid">
        <div class="meta-item"><strong>From</strong>${escapeHtml(name)}</div>
        <div class="meta-item"><strong>Email</strong>${escapeHtml(email)}</div>
      </div>
      ${wizardBlock}
      ${fallbackBlock}
      ${attachmentBlock}
      ${techBlock}
      <p style="margin-top:24px; padding-top:16px; border-top:1px solid #e5e7eb; color:#6b7280; font-size:12px;">
        Reply directly to this email to respond to the customer (Reply-To is set to the user).
      </p>
    </div>
  </div>
</body></html>`;

    const supportResult = await sendEmail({
      to: SUPPORT_INBOX,
      subject: internalSubject,
      html: supportHtml,
      template: "support_ticket_internal",
      category: "transactional",
      replyTo: email,
    });

    if (!supportResult.ok && !supportResult.skipped) {
      console.error("Support email send error:", supportResult.error);
      throw new Error(supportResult.error || "send failed");
    }

    console.log("Support ticket sent:", supportResult.resendId);

    // === Customer confirmation ===
    const confirmHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; line-height: 1.6; color: #111; background:#f9fafb; margin:0; padding:0; }
  .container { max-width: 600px; margin: 0 auto; padding: 24px; }
  .header { background: linear-gradient(135deg, #050816, #1a1a2e); color: #F5C76A; padding: 32px; border-radius: 10px 10px 0 0; text-align: center; }
  .content { background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; }
  .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 10px 10px; text-align: center; color: #6b7280; font-size: 12px; }
  .ticket-info { background: #f9fafb; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F5C76A; }
</style></head><body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0; font-family: Georgia, serif; color:#F5C76A;">Thank you</h1>
      <p style="margin:8px 0 0; opacity:0.9; color:#fff;">We received your support ticket</p>
    </div>
    <div class="content">
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thank you for contacting AdTool AI support. We've received your ticket and our team will get back to you as soon as possible.</p>
      <div class="ticket-info">
        <strong>Ticket details</strong><br/>
        <strong>Severity:</strong> ${sevLabel}<br/>
        <strong>Module:</strong> ${escapeHtml(affectedModule)}<br/>
        <strong>Category:</strong> ${escapeHtml(category)}<br/>
        <strong>Subject:</strong> ${escapeHtml(subject)}<br/>
        <strong>Submitted:</strong> ${new Date().toLocaleString()}
      </div>
      <p>Our support team typically responds within <strong>24 hours</strong> on business days. For blocking issues we usually reply within 2 hours.</p>
      <p>Best regards,<br/><strong>The AdTool AI Team</strong></p>
    </div>
    <div class="footer">
      <p>This is an automated confirmation. Please do not reply directly — we'll contact you from support@useadtool.ai.</p>
      <p>© ${new Date().getFullYear()} AdTool AI. All rights reserved.</p>
    </div>
  </div>
</body></html>`;

    await sendEmail({
      to: email,
      subject: "We received your support ticket",
      html: confirmHtml,
      template: "support_ticket_confirmation",
      category: "transactional",
    });

    return new Response(
      JSON.stringify({ success: true, message: "Ticket submitted successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "unknown error";
    console.error("Error in send-support-ticket function:", msg);
    return new Response(
      JSON.stringify({ error: "Failed to send support ticket", details: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
