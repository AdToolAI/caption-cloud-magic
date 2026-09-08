import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { isInternalCaller } from "../_shared/video-enhance-reconcile-guard.ts";
import { readProviderPrediction } from "../_shared/video-enhance-provider-read.ts";
import { classifyProviderFailure } from "../_shared/video-enhance-provider-errors.ts";
import {
  finalizeCancelConfirmed,
  finalizeFailure,
} from "../_shared/video-enhance-finalize.ts";
import {
  extractProviderCost,
  providerPollIntervalSeconds,
  setStatus,
  triggerPersist,
} from "../_shared/video-enhance-runtime.ts";

/**
 * Server-side provider poll for Video Enhance.
 *
 * Topaz has no signed completion webhook, so completion MUST be discovered by
 * the backend — never by the customer's browser. This function runs every
 * minute, reads every due run from the provider and, on success, records
 * `provider_output_ready` and kicks the persistence worker immediately.
 *
 * Each run carries its own `next_provider_poll_at`, so an extra invocation
 * finds nothing due and produces no provider traffic. Runs whose completion
 * arrives by webhook (Replicate / ByteDance vCube) are polled on the same
 * schedule as a cheap safety net — the webhook stays the primary signal.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
};

const TAG = "[video-enhance-poll]";
const BATCH_SIZE = 25;
const AWAITING_PROVIDER = [
  "provider_submitted",
  "provider_processing",
  "cancel_requested",
  "local_poll_timeout",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!isInternalCaller(req.headers, (key) => Deno.env.get(key))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const keys = {
      replicate: Deno.env.get("REPLICATE_API_KEY"),
      topaz: Deno.env.get("TOPAZ_API_KEY"),
    };

    const deadline = Date.now() + 40_000;
    const summary = { checked: 0, ready: 0, failed: 0, cancelled: 0, pending: 0 };
    const nowIso = new Date().toISOString();

    const { data: runs } = await admin
      .from("video_enhance_runs")
      .select("*")
      .in("status", AWAITING_PROVIDER)
      .not("provider_prediction_id", "is", null)
      .or(`next_provider_poll_at.is.null,next_provider_poll_at.lte.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    let kickPersist = false;

    for (const run of runs ?? []) {
      if (Date.now() >= deadline) break;
      summary.checked++;

      const ageSeconds = (Date.now() - Date.parse(run.created_at)) / 1000;
      const nextPoll = new Date(
        Date.now() + providerPollIntervalSeconds(ageSeconds) * 1000,
      ).toISOString();

      const prediction = await readProviderPrediction(run.provider_prediction_id, keys, TAG)
        .catch(() => null);
      if (!prediction) {
        await admin
          .from("video_enhance_runs")
          .update({ next_provider_poll_at: nextPoll })
          .eq("id", run.id);
        summary.pending++;
        continue;
      }

      if (prediction.status === "succeeded" && prediction.output) {
        // Provider done. Storing the file is separate, heavy work: record the
        // fact and hand it to the persistence worker straight away.
        await admin
          .from("video_enhance_runs")
          .update({
            status: "provider_output_ready",
            provider_output_url: prediction.output,
            provider_output_expires_at: prediction.outputExpiresAt,
            provider_status: "succeeded",
            provider_completed_at: run.provider_completed_at ?? new Date().toISOString(),
            next_persist_at: new Date().toISOString(),
            next_provider_poll_at: null,
            next_reconcile_at: null,
            last_reconciled_at: new Date().toISOString(),
          })
          .eq("id", run.id)
          .not(
            "status",
            "in",
            "(completed,provider_failed,output_lost,provider_cancelled_confirmed)",
          );
        summary.ready++;
        kickPersist = true;
      } else if (prediction.status === "failed") {
        const verdict = classifyProviderFailure(prediction.error);
        if (verdict.outage) {
          console.error(`${TAG} PROVIDER OUTAGE (${verdict.code}) run=${run.id}: ${verdict.message}`);
        }
        await finalizeFailure(admin, run, verdict.code, verdict.message);
        summary.failed++;
      } else if (prediction.status === "canceled") {
        await finalizeCancelConfirmed(
          admin,
          run,
          extractProviderCost(prediction, run.model_id),
        );
        summary.cancelled++;
      } else {
        await setStatus(admin, run.id, "provider_processing", {
          provider_status: prediction.status,
          next_provider_poll_at: nextPoll,
          last_reconciled_at: new Date().toISOString(),
        });
        summary.pending++;
      }
    }

    // One kick per cycle is enough: the worker drains every claimable run.
    if (kickPersist) await triggerPersist(TAG);

    console.log(TAG, JSON.stringify(summary));
    return json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${TAG} unhandled:`, message);
    return json({ error: message }, 500);
  }
});
