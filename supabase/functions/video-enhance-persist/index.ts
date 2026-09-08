import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { isPrivilegedInternalCaller } from "../_shared/video-enhance-reconcile-guard.ts";
import { runPersistCycle } from "../_shared/video-enhance-persist-cycle.ts";

/**
 * Internal persistence worker for Video Enhance.
 *
 * Called immediately after a provider reports success (webhook for Replicate /
 * ByteDance vCube, server-side poller for Topaz) and by the watchdog cron.
 * It owns NO detection logic and NO money: it only claims due persistence work
 * through the atomic DB claim and reuses the existing chunked, resumable
 * transfer.
 *
 * Racing callers are expected and harmless — the claim decides who transfers,
 * everyone else finds nothing and returns.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
};

const TAG = "[video-enhance-persist]";
/** Stay well inside the function timeout; unfinished bytes resume next cycle. */
const BUDGET_MS = 100_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Internal only. The body is never read: no caller can steer which run runs.
  if (!isPrivilegedInternalCaller(req.headers, (key) => Deno.env.get(key))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const result = await runPersistCycle(admin, { budgetMs: BUDGET_MS });
    console.log(TAG, JSON.stringify(result));
    return json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${TAG} unhandled:`, message);
    return json({ error: message }, 500);
  }
});
