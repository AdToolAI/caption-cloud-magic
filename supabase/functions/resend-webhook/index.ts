// Resend webhook handler — receives bounce/complaint events and adds the
// affected addresses to email_suppression_list so we never send to them again.
//
// Configure in Resend dashboard → Webhooks → URL:
//   https://<project-ref>.supabase.co/functions/v1/resend-webhook
// Events to subscribe: email.bounced, email.complained
// (Optional: email.delivered for richer logging — currently ignored.)
//
// Optional signature verification via RESEND_WEBHOOK_SECRET (Svix).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { suppressEmail } from "../_shared/email-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

interface ResendEvent {
  type: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    from?: string;
    subject?: string;
    bounce?: { type?: string; message?: string };
    [k: string]: unknown;
  };
}

function recipientFrom(ev: ResendEvent): string | null {
  const to = ev.data?.to;
  if (!to) return null;
  if (Array.isArray(to)) return to[0] || null;
  return typeof to === "string" ? to : null;
}

async function verifySvix(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return true; // verification optional

  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigHeader = req.headers.get("svix-signature");
  if (!id || !ts || !sigHeader) {
    console.warn("[resend-webhook] missing svix headers");
    return false;
  }

  // Svix secret format: "whsec_<base64>"
  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretBytes: Uint8Array;
  try {
    secretBytes = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0));
  } catch {
    secretBytes = new TextEncoder().encode(rawSecret);
  }

  const toSign = `${id}.${ts}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // Header format: "v1,<sig> v1,<sig2> ..."
  const provided = sigHeader
    .split(" ")
    .map((p) => p.split(",")[1])
    .filter(Boolean);

  return provided.includes(expected);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const body = await req.text();

  // Always verify signature when secret is configured
  const valid = await verifySvix(req, body);
  if (!valid) {
    console.warn("[resend-webhook] invalid signature");
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let ev: ResendEvent;
  try {
    ev = JSON.parse(body) as ResendEvent;
  } catch {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  console.log(`[resend-webhook] event=${ev.type}`);

  try {
    const email = recipientFrom(ev);
    if (!email) {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (ev.type === "email.bounced") {
      const bounceType = ev.data?.bounce?.type || "";
      // Only suppress on hard bounces — soft bounces should retry
      if (/hard|permanent/i.test(bounceType) || bounceType === "") {
        await suppressEmail(email, "bounce", {
          bounce_type: bounceType,
          message: ev.data?.bounce?.message,
          email_id: ev.data?.email_id,
        });
        console.log(`[resend-webhook] suppressed (bounce): ${email}`);
      } else {
        console.log(`[resend-webhook] soft bounce ignored: ${email} (${bounceType})`);
      }
    } else if (ev.type === "email.complained") {
      await suppressEmail(email, "complaint", {
        email_id: ev.data?.email_id,
      });
      console.log(`[resend-webhook] suppressed (complaint): ${email}`);
    }
  } catch (e) {
    console.error("[resend-webhook] handler error:", e);
  }

  // Always 200 so Resend doesn't retry
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
