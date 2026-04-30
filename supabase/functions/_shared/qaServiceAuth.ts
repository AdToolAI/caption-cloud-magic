// Bond QA — Service-Role Auth Shortcut
// Lets the qa-weekly-deep-sweep orchestrator (running as service role) impersonate
// an admin user inside provider edge functions WITHOUT needing a fresh user JWT.
//
// SECURITY: x-qa-user-id is honored ONLY when the Authorization header carries the
// SUPABASE_SERVICE_ROLE_KEY. The service role key never leaves Supabase Edge Runtime,
// so external clients cannot forge this path.

export interface QaServiceAuthResult {
  isQaService: boolean;
  userId?: string;
}

export function detectQaServiceAuth(req: Request): QaServiceAuthResult {
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return { isQaService: false };

    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token || token !== serviceKey) return { isQaService: false };

    const realSpend = req.headers.get("x-qa-real-spend");
    const userId = req.headers.get("x-qa-user-id");
    if (!userId) return { isQaService: false };
    if (realSpend !== "true" && realSpend !== "1") return { isQaService: false };

    return { isQaService: true, userId };
  } catch {
    return { isQaService: false };
  }
}
