// One-click unsubscribe endpoint. Validates a HMAC token to prevent abuse,
// inserts the address into email_suppression_list with reason='unsubscribe',
// and returns a friendly confirmation page.
//
// Triggered by the List-Unsubscribe header (Gmail/Outlook one-click) and by
// links inside marketing email footers.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { generateUnsubscribeToken, suppressEmail } from "../_shared/email-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

function page(title: string, message: string, status = 200): Response {
  const html = `<!DOCTYPE html>
<html lang="de"><head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} | AdTool AI</title>
  <style>
    body{margin:0;background:#0a0a0f;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
    .card{max-width:480px;width:100%;background:#1a1a2e;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:40px 32px;text-align:center}
    .logo{display:inline-block;padding:8px 18px;background:linear-gradient(135deg,#F5C76A,#d4a853);border-radius:10px;color:#0a0a0f;font-weight:700;margin-bottom:24px}
    h1{color:#F5C76A;font-size:22px;margin:0 0 12px}
    p{color:#bbb;line-height:1.6;margin:0 0 16px}
    a{color:#22d3ee;text-decoration:none}
  </style>
</head><body>
  <div class="card">
    <div class="logo">AdTool AI</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p style="font-size:13px;color:#666;margin-top:24px">
      <a href="https://useadtool.ai">← useadtool.ai</a>
    </p>
  </div>
</body></html>`;
  return new Response(html, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";

  // Allow both GET (link click) and POST (one-click unsubscribe per RFC 8058)
  if (!email || !token) {
    return page("Ungültiger Link", "Dieser Abmelde-Link ist unvollständig.", 400);
  }

  // Validate token
  const expected = await generateUnsubscribeToken(email);
  if (token !== expected) {
    console.warn(`[email-unsubscribe] invalid token for ${email}`);
    return page("Ungültiger Link", "Dieser Abmelde-Link ist nicht mehr gültig.", 400);
  }

  try {
    await suppressEmail(email, "unsubscribe", {
      via: req.method === "POST" ? "one-click" : "link",
      user_agent: req.headers.get("user-agent") || undefined,
    });
    console.log(`[email-unsubscribe] unsubscribed: ${email}`);
  } catch (e) {
    console.error("[email-unsubscribe] error:", e);
    return page("Fehler", "Beim Abmelden ist ein Fehler aufgetreten. Bitte versuche es später erneut.", 500);
  }

  // For one-click POST, RFC 8058 expects 200 with no body required
  if (req.method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return page(
    "Du wurdest abgemeldet",
    `Die Adresse <strong>${email}</strong> erhält keine Marketing-Mails mehr von uns. Transaktions-Mails (z. B. Passwort-Reset) bekommst du weiterhin.`,
  );
});
