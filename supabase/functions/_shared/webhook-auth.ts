/**
 * Shared webhook authentication helpers.
 *
 * Webhook callbacks from Replicate / Remotion Lambda / our own renderers must
 * carry a shared secret so that arbitrary internet callers cannot forge
 * completion events and mutate DB state via the service role.
 *
 * Usage in webhook receivers:
 *   import { verifyWebhookRequest } from "../_shared/webhook-auth.ts";
 *   const unauth = verifyWebhookRequest(req);
 *   if (unauth) return unauth; // 401 response
 *
 * Usage in callers that construct webhook URLs:
 *   import { appendWebhookToken } from "../_shared/webhook-auth.ts";
 *   const webhookUrl = appendWebhookToken(`${SUPABASE_URL}/functions/v1/remotion-webhook`);
 */

const SECRET_ENV = "WEBHOOK_SHARED_SECRET";

export function getWebhookSecret(): string | null {
  const s = Deno.env.get(SECRET_ENV);
  return s && s.length >= 16 ? s : null;
}

export function appendWebhookToken(url: string): string {
  const secret = getWebhookSecret();
  if (!secret) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(secret)}`;
}

/**
 * Verify that an incoming webhook request carries the shared secret.
 * Accepts either a `?token=` query param or `X-Webhook-Token` header.
 * Returns null on success, or a 401 Response on failure.
 *
 * If WEBHOOK_SHARED_SECRET is not configured, requests are rejected
 * (fail-closed). This prevents accidental open endpoints.
 */
export function verifyWebhookRequest(req: Request): Response | null {
  const secret = getWebhookSecret();
  if (!secret) {
    console.error(
      `[webhook-auth] ${SECRET_ENV} is not configured (must be >=16 chars). Rejecting webhook.`,
    );
    return new Response(
      JSON.stringify({ error: "Webhook authentication not configured" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const tokenFromHeader = req.headers.get("x-webhook-token");
  const provided = tokenFromQuery || tokenFromHeader;

  if (!provided || !timingSafeEqual(provided, secret)) {
    console.warn("[webhook-auth] Rejected webhook with missing/invalid token");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
