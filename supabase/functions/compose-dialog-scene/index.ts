/**
 * compose-dialog-scene — DEPRECATED PER-TURN PATH (v24 unification, June 2026).
 *
 * Why this file is now a thin forwarder
 * --------------------------------------
 * The per-turn Sync.so dispatcher (one preclip + one lipsync-2-pro pass per
 * speaker turn) was structurally broken: every dispatch returned
 * `"An unknown error occurred."`. Retries with varied coordinates,
 * frame_number, temperature, and lead-in did not help — Sync.so simply does
 * not accept that payload shape on short per-turn preclips for the
 * 3-4 speaker case.
 *
 * The 1-2 speaker path (`compose-dialog-segments`, multi-pass per-speaker
 * on a single master plate with `options.segments[]`) is the only Sync.so
 * payload shape that consistently completes for us. It already supports
 * N=1..N speakers via per-speaker chained passes.
 *
 * v24 therefore unifies everything onto `compose-dialog-segments` for ALL
 * speaker counts (1-4, hard cap enforced by `_shared/cast-validation.ts`).
 * This file remains as a backwards-compatible entry point so older callers
 * (poll-dialog-shots auto-trigger, sync-so-webhook re-arm, UI hooks) keep
 * working — they all just hit segments now.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    const sceneId = body?.scene_id;
    if (!sceneId || typeof sceneId !== "string") {
      return json({ error: "scene_id_required" }, 400);
    }

    // Forward the original payload verbatim to the unified segments path.
    // compose-dialog-segments handles cast validation, HappyHorse-master
    // guard, dedup-claim, multi-pass per-speaker dispatch, refund, and
    // terminal failure on its own.
    const upstream = await fetch(
      `${supabaseUrl}/functions/v1/compose-dialog-segments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          // Preserve QA mock header so test runs are not turned into real spend.
          ...(req.headers.get("x-qa-mock")
            ? { "x-qa-mock": req.headers.get("x-qa-mock")! }
            : {}),
        },
        body: JSON.stringify(body),
      },
    );

    const upstreamBody = await upstream.text();
    let parsed: unknown;
    try {
      parsed = upstreamBody ? JSON.parse(upstreamBody) : {};
    } catch {
      parsed = { raw: upstreamBody };
    }

    console.log(
      `[compose-dialog-scene] forwarded scene=${sceneId} → compose-dialog-segments status=${upstream.status}`,
    );

    return new Response(JSON.stringify(parsed), {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[compose-dialog-scene] forwarder error:", msg);
    return json({ error: "forwarder_failed", message: msg }, 500);
  }
});
