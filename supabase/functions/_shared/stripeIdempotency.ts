// Stripe webhook idempotency helper. Uses public.stripe_webhook_events (service-role only).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
  return _client;
}

/**
 * Returns true if this Stripe event was already processed (caller should
 * short-circuit with a 200 OK). Returns false and persists the marker
 * atomically otherwise. Fails open on infra errors — Stripe retries anyway.
 */
export async function isDuplicateStripeEvent(
  eventId: string,
  eventType: string,
  summary?: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { error } = await client()
      .from("stripe_webhook_events")
      .insert({ event_id: eventId, event_type: eventType, payload_summary: summary ?? {} });
    if (!error) return false;
    if ((error as any).code === "23505" || /duplicate key/i.test(error.message)) {
      console.log(`[stripe-idempotency] duplicate event ignored: ${eventId} (${eventType})`);
      return true;
    }
    console.warn("[stripe-idempotency] insert error, allowing:", error.message);
    return false;
  } catch (e) {
    console.warn("[stripe-idempotency] threw, allowing:", (e as Error).message);
    return false;
  }
}
