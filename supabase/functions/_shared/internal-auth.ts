// Shared auth helper for internal/cron functions.
// Accepts either:
//   - SUPABASE_SERVICE_ROLE_KEY as Bearer (cron/edge-to-edge); caller may pass user_id in body
//   - A user JWT as Bearer; resolves user_id from JWT; any caller-supplied user_id is overridden
// Returns 401 Response if neither path validates.

import { createClient } from "npm:@supabase/supabase-js@2.39.3";

export interface InternalAuthOk {
  ok: true;
  isService: boolean;
  userId: string | null; // null only when service-role with no body user_id
}
export interface InternalAuthErr {
  ok: false;
  response: Response;
}
export type InternalAuthResult = InternalAuthOk | InternalAuthErr;

export async function authenticateInternalRequest(
  req: Request,
  opts: { bodyUserId?: string | null; requireUserId?: boolean; corsHeaders?: Record<string, string> } = {}
): Promise<InternalAuthResult> {
  const corsHeaders = opts.corsHeaders ?? {};
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();

  const unauthorized = (msg: string, status = 401) =>
    ({
      ok: false as const,
      response: new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }),
    });

  if (!token) return unauthorized("Missing Authorization header");

  // Service role path
  if (serviceKey && token === serviceKey) {
    const uid = opts.bodyUserId ?? null;
    if (opts.requireUserId && !uid) return unauthorized("user_id required", 400);
    return { ok: true, isService: true, userId: uid };
  }

  // User JWT path
  if (!supabaseUrl || !anonKey) return unauthorized("Server auth not configured", 500);
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return unauthorized("Invalid token");

  return { ok: true, isService: false, userId: data.user.id };
}
