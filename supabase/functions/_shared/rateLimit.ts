// Shared rate-limit helper backed by public.check_and_increment_rate_limit RPC.
// Uses the service-role Supabase client. Fails OPEN on infra errors so that
// a transient DB blip does not lock users out of paid features.
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

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  resetAt: string;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  endpoint: string;
  max: number;
  windowSeconds: number;
  identifier: string;
}

export async function checkRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const { data, error } = await client().rpc("check_and_increment_rate_limit", {
      p_identifier: opts.identifier,
      p_endpoint: opts.endpoint,
      p_max: opts.max,
      p_window_seconds: opts.windowSeconds,
    });
    if (error) {
      console.warn("[rateLimit] RPC error, failing open:", error.message);
      return { allowed: true, current: 0, resetAt: new Date().toISOString(), retryAfterSeconds: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    const resetAt = new Date(row?.reset_at ?? Date.now()).toISOString();
    const retry = Math.max(0, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1000));
    return {
      allowed: !!row?.allowed,
      current: Number(row?.current_count ?? 0),
      resetAt,
      retryAfterSeconds: retry,
    };
  } catch (e) {
    console.warn("[rateLimit] threw, failing open:", (e as Error).message);
    return { allowed: true, current: 0, resetAt: new Date().toISOString(), retryAfterSeconds: 0 };
  }
}

export function identifierFromRequest(req: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`;
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
  return `ip:${ip}`;
}

export function rateLimitResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      message: "Zu viele Anfragen. Bitte kurz warten.",
      retry_after_seconds: result.retryAfterSeconds,
      reset_at: result.resetAt,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSeconds),
      },
    },
  );
}
