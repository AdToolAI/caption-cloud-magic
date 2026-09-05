import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  applyLateCostTrueUp,
  finalizeCancelConfirmed,
  finalizeFailure,
  finalizeSuccess,
} from "../_shared/video-enhance-finalize.ts";
import { setStatus, backoffMinutes, extractProviderCost } from "../_shared/video-enhance-runtime.ts";
import { VIDEO_ENHANCE_SPECS } from "../_shared/video-enhance-models.ts";

/**
 * Provider callback for Video Enhance.
 *
 * A webhook is never taken at face value:
 *   1. the signature is verified (Replicate webhook secret),
 *   2. the callback token maps to exactly one run,
 *   3. the state is re-read authoritatively from the provider by prediction id,
 *   4. only then is anything persisted.
 *
 * The token also repairs the crash window: if the function died after the
 * provider accepted the job but before the prediction id was stored, this call
 * is what reconnects the run to its prediction.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, webhook-id, webhook-timestamp, webhook-signature",
};

const TAG = "[video-enhance-webhook]";
const REPLAY_WINDOW_SECONDS = 300;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Standard-webhooks signature as used by Replicate, incl. replay protection. */
export async function verifySignature(
  secret: string,
  headers: Headers,
  rawBody: string,
): Promise<{ ok: boolean; reason?: string }> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: "missing_headers" };

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > REPLAY_WINDOW_SECONDS) return { ok: false, reason: "stale_timestamp" };

  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret.split("_").pop() ?? secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)),
  );

  const candidates = signatureHeader
    .split(" ")
    .map((part) => part.split(",").pop() ?? "")
    .filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (timingSafeEqual(signed, base64ToBytes(candidate))) return { ok: true };
    } catch {
      // ignore malformed candidate
    }
  }
  return { ok: false, reason: "signature_mismatch" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const token = new URL(req.url).searchParams.get("callback");
  const rawBody = await req.text();

  try {
    const secret = Deno.env.get("REPLICATE_WEBHOOK_SECRET");
    if (!secret) {
      console.error(`${TAG} REPLICATE_WEBHOOK_SECRET missing — refusing webhook`);
      return json({ error: "webhook not configured" }, 500);
    }
    const verified = await verifySignature(secret, req.headers, rawBody);
    if (!verified.ok) {
      console.warn(`${TAG} rejected webhook: ${verified.reason}`);
      return json({ error: "invalid signature", reason: verified.reason }, 401);
    }
    if (!token) return json({ error: "missing callback token" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: run } = await admin
      .from("video_enhance_runs")
      .select("*")
      .eq("callback_token", token)
      .maybeSingle();
    if (!run) return json({ error: "unknown callback token" }, 404);

    const event = JSON.parse(rawBody || "{}");
    const predictionId: string | undefined = event?.id;
    if (!predictionId) return json({ error: "event without prediction id" }, 400);

    // Prediction must belong to this run — or be adopted when the run never
    // stored one (crash between provider accept and persist).
    if (run.provider_prediction_id && run.provider_prediction_id !== predictionId) {
      console.warn(`${TAG} prediction mismatch on run ${run.id}`);
      return json({ error: "prediction does not belong to this run" }, 409);
    }
    if (!run.provider_prediction_id) {
      await admin
        .from("video_enhance_runs")
        .update({ provider_prediction_id: predictionId })
        .eq("id", run.id)
        .is("provider_prediction_id", null);
      run.provider_prediction_id = predictionId;
    }

    // Authoritative re-read: the webhook body alone never decides.
    const apiKey = Deno.env.get("REPLICATE_API_KEY");
    if (!apiKey) return json({ error: "REPLICATE_API_KEY not configured" }, 500);

    if (["completed", "provider_failed", "provider_cancelled_confirmed"].includes(run.status)) {
      // Already terminal — but an authoritative cost arriving late must be
      // trued up IMMEDIATELY, not at the next scheduled scan.
      if (
        run.status === "completed" &&
        (run.provider_cost_usd_actual === null || run.provider_cost_usd_actual === undefined) &&
        !run.cost_closed_at
      ) {
        const late = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (late.ok) {
          const latePrediction = await late.json();
          const lateCost = extractProviderCost(latePrediction, run.model_id);
          const applied = await applyLateCostTrueUp(admin, run, lateCost);
          return json({ ok: true, deduplicated: true, status: run.status, lateTrueUp: applied });
        }
      }
      return json({ ok: true, deduplicated: true, status: run.status });
    }
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const details = await res.text();
      console.error(`${TAG} provider read failed [${res.status}]: ${details}`);
      await setStatus(admin, run.id, run.status, {
        next_reconcile_at: new Date(Date.now() + backoffMinutes(1) * 60_000).toISOString(),
      });
      return json({ error: "provider read failed", status: res.status, details }, res.status);
    }
    const prediction = await res.json();

    const expectedModel = VIDEO_ENHANCE_SPECS[run.model_id]?.providerModelId;
    if (expectedModel && prediction.model && !String(prediction.model).startsWith(expectedModel)) {
      console.warn(`${TAG} model mismatch on run ${run.id}: ${prediction.model}`);
      return json({ error: "prediction model mismatch" }, 409);
    }

    const providerStatus: string = prediction.status;
    // The provider does not guarantee a cost field; record what is there and
    // where it came from, and finalise either way.
    const providerCost = extractProviderCost(prediction, run.model_id);

    if (providerStatus === "succeeded") {
      const output = prediction.output;
      const outputUrl =
        typeof output === "string"
          ? output
          : Array.isArray(output) && typeof output[0] === "string"
            ? output[0]
            : typeof output?.url === "string"
              ? output.url
              : null;
      if (!outputUrl) return await asFailure(admin, run, "NO_OUTPUT", "provider returned no video");
      const result = await finalizeSuccess(admin, run, outputUrl, providerCost);
      return json(result, result.ok ? 200 : 500);
    }

    if (providerStatus === "failed") {
      return await asFailure(admin, run, "PROVIDER_FAILED", String(prediction.error ?? "provider failed"));
    }

    if (providerStatus === "canceled") {
      const result = await finalizeCancelConfirmed(admin, run, providerCost);
      return json(result);
    }

    await setStatus(admin, run.id, "provider_processing", {
      provider_status: providerStatus,
      next_reconcile_at: new Date(Date.now() + backoffMinutes(1) * 60_000).toISOString(),
    });
    return json({ ok: true, status: providerStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${TAG} unhandled:`, message);
    return json({ error: message }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function asFailure(admin: any, run: any, code: string, message: string) {
  const result = await finalizeFailure(admin, run, code, message);
  return json(result, 200);
}
