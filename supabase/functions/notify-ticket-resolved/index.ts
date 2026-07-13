// Fired by DB trigger when a support_ticket transitions to status='resolved'.
// Sends a "Fixed!" email to the customer in their preferred language.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendEmail } from "../_shared/email-send.ts";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const esc = (s: string) =>
  (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const SUBJECT: Record<string, string> = {
  de: "Behoben — wir haben dein Problem gelöst ✅",
  es: "Resuelto — hemos solucionado tu problema ✅",
  en: "Fixed — we resolved your issue ✅",
};

const BODY_INTRO: Record<string, string> = {
  de: "Gute Nachrichten: das von dir gemeldete Problem ist behoben. Du kannst jetzt wieder normal mit AdTool AI weiterarbeiten.",
  es: "Buenas noticias: el problema que reportaste está resuelto. Ya puedes seguir usando AdTool AI con normalidad.",
  en: "Good news — the issue you reported has been resolved. You can resume using AdTool AI as normal.",
};

const CTA: Record<string, string> = {
  de: "Falls etwas nicht passt, antworte einfach auf diese E-Mail.",
  es: "Si algo no funciona, simplemente responde a este correo.",
  en: "If something still seems off, just reply to this email.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "notify-ticket-resolved" });

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id, subject, contact_email, contact_name, ai_language, resolved_notification_sent_at")
      .eq("id", ticket_id)
      .maybeSingle();

    if (!ticket) throw new Error("ticket not found");
    if (ticket.resolved_notification_sent_at) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ticket.contact_email) throw new Error("no contact_email on ticket");

    const lang = ticket.ai_language || "en";
    const name = ticket.contact_name ?? "there";

    const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f9fafb;margin:0;padding:24px;color:#111">
<div style="max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#050816,#1a1a2e);color:#F5C76A;padding:28px;border-radius:10px 10px 0 0;text-align:center">
    <h1 style="margin:0;font-family:Georgia,serif">✅ ${esc(SUBJECT[lang] ?? SUBJECT.en)}</h1>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-radius:0 0 10px 10px">
    <p>Hi ${esc(name)},</p>
    <p>${esc(BODY_INTRO[lang] ?? BODY_INTRO.en)}</p>
    <div style="background:#f9fafb;border-left:4px solid #16a34a;padding:14px 16px;margin:18px 0;border-radius:6px;font-size:14px">
      <strong>Ticket:</strong> #${ticket.id.slice(0, 8)}<br/>
      <strong>Subject:</strong> ${esc(ticket.subject)}
    </div>
    <p style="color:#6b7280;font-size:13px">${esc(CTA[lang] ?? CTA.en)}</p>
    <p style="color:#6b7280;font-size:13px">— AdTool AI</p>
  </div>
</div></body></html>`;

    const result = await sendEmail({
      to: ticket.contact_email,
      subject: SUBJECT[lang] ?? SUBJECT.en,
      html,
      template: "support_ticket_resolved",
      category: "transactional",
    });

    if (result.ok || result.skipped) {
      await supabase
        .from("support_tickets")
        .update({ resolved_notification_sent_at: new Date().toISOString() })
        .eq("id", ticket_id);
    }

    return new Response(JSON.stringify({ ok: true, sent: !!result.ok }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("notify-ticket-resolved error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
