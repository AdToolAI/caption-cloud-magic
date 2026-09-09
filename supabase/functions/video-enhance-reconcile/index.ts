import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  applyLateCostTrueUp,
  finalizeCancelConfirmed,
  finalizeFailure,
} from "../_shared/video-enhance-finalize.ts";
import {
  backoffMinutes,
  extractProviderCost,
  manualReviewAfterMinutes,
  providerCreditPatch,
  setStatus,
  STAGING_BUCKET,
  triggerPersist,
} from "../_shared/video-enhance-runtime.ts";
import { runPersistCycle } from "../_shared/video-enhance-persist-cycle.ts";
import { decideCycle, isInternalCaller } from "../_shared/video-enhance-reconcile-guard.ts";
import { classifyProviderFailure } from "../_shared/video-enhance-provider-errors.ts";

import { readProviderPrediction } from "../_shared/video-enhance-provider-read.ts";

/**
 * Reconciler for Video Enhance.
 *
 * Runs on a schedule (pg_cron `video-enhance-reconcile-5min`, see the
 * migration `video_enhance_reconcile_schedule`) and does three things:
 *   1. re-reads open runs from the provider and finalises them idempotently,
 *   2. retries persistence for runs whose provider result already exists,
 *   3. sends runs past the horizon to `manual_review` — WITHOUT refunding.
 *
 * It also removes orphaned staging files so large videos do not pile up.
 *
 * Abuse model. The scheduler authenticates with the project's PUBLISHABLE key
 * (no privileged secret lives in the cron command or in the repo), so the
 * endpoint is treated as reachable by anyone who has the app bundle:
 *   - the request body is never read — no caller can pick rows;
 *   - the response carries counters only — never run or user data;
 *   - EVERY unit of work is gated by a per-run timestamp the reconciler
 *     advances itself (`next_reconcile_at`, `next_late_check_at`, `updated_at`
 *     for orphans), so a second call right after the first finds nothing due
 *     and costs a handful of indexed queries — no provider traffic;
 *   - an in-isolate throttle and in-flight guard collapse bursts on top.
 * Callers with the service role key or the optional `CRON_SECRET` header are
 * accepted as internal; a user JWT is rejected — no surface calls this.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
};

const TAG = "[video-enhance-reconcile]";
const BATCH_SIZE = 25;

/**
 * One provider read for the whole engine — shared with the customer's status
 * poll, so both reach the same verdict (`_shared/video-enhance-provider-read`).
 */
async function readProvider(
  providerId: string,
  replicateKey: string | undefined,
): Promise<any | null> {
  return await readProviderPrediction(
    providerId,
    { replicate: replicateKey, topaz: Deno.env.get("TOPAZ_API_KEY") },
    TAG,
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Statuses handled by the PROVIDER loop below. The persistence statuses
 * (`asset_*`) are deliberately NOT in this list: storing a finished file is
 * heavy work and runs exclusively through the atomic claim path, at most one
 * per invocation.
 */
const OPEN_STATUSES = [
  "credits_reserved",
  "provider_submitting",
  "provider_submitted",
  "provider_processing",
  "cancel_requested",
  "local_poll_timeout",
];


// Per-isolate burst protection. Not a distributed lock — the per-run
// timestamps below are what make concurrent cycles harmless; this only keeps
// a hammering caller from burning CPU on empty cycles.
const cycle = { inFlight: false, lastStartedAt: 0 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!isInternalCaller(req.headers, (key) => Deno.env.get(key))) {
    return json({ error: "Unauthorized" }, 401);
  }

  // The body is intentionally never read: no caller can steer the cycle.
  const decision = decideCycle(cycle, Date.now());
  if (!decision.run) return json(decision, 202);
  cycle.inFlight = true;
  cycle.lastStartedAt = Date.now();

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    // Either key alone is enough: runs are read from the API that owns them.
    const apiKey = Deno.env.get("REPLICATE_API_KEY");
    if (!apiKey && !Deno.env.get("TOPAZ_API_KEY")) {
      return json({ error: "no provider API key configured" }, 500);
    }

    // ---- persistence phase: watchdog only ----------------------------------
    // Normal runs no longer wait for this cron: the provider webhook and the
    // server-side poller kick `video-enhance-persist` within seconds. This
    // cycle exists for what can still slip through — a missed webhook, an
    // expired lease, an interrupted transfer. It shares the exact same claim,
    // so a race with those triggers still yields exactly one transfer.
    const persist = await runPersistCycle(admin, { budgetMs: 60_000 });
    if (persist.claimed > 0) {
      return json({ ok: true, phase: "persist", ...persist });
    }


    const nowIso = new Date().toISOString();
    // Configurable, so a slow provider queue can be absorbed without a deploy.
    const horizonMinutes = manualReviewAfterMinutes((key) => Deno.env.get(key));

    const { data: runs } = await admin
      .from("video_enhance_runs")
      .select("*")
      .in("status", OPEN_STATUSES)
      .or(`next_reconcile_at.is.null,next_reconcile_at.lte.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    const summary = { checked: 0, completed: 0, failed: 0, cancelled: 0, manualReview: 0, pending: 0 };

    for (const run of runs ?? []) {
      summary.checked++;
      const attempts = (run.reconciliation_attempts ?? 0) + 1;
      const ageMinutes = (Date.now() - Date.parse(run.created_at)) / 60_000;

      // Persistence is NOT handled here — it runs through the atomic claim
      // phase above, one heavy transfer per invocation.



      if (!run.provider_prediction_id) {
        // No prediction id and no webhook yet: nothing authoritative to read.
        if (ageMinutes > horizonMinutes) {
          await setStatus(admin, run.id, "manual_review", {
            error_code: "NO_PROVIDER_REFERENCE",
            reconciliation_attempts: attempts,
            last_reconciled_at: nowIso,
            next_reconcile_at: null,
          });
          summary.manualReview++;
        } else {
          await bump(admin, run.id, attempts);
          summary.pending++;
        }
        continue;
      }

      const prediction = await readProvider(run.provider_prediction_id, apiKey);
      if (!prediction) {
        await bump(admin, run.id, attempts);
        summary.pending++;
        continue;
      }
      const providerCost = extractProviderCost(prediction, run.model_id, run);

      if (prediction.status === "succeeded") {
        const output = prediction.output;
        const outputUrl =
          typeof output === "string"
            ? output
            : Array.isArray(output) && typeof output[0] === "string"
              ? output[0]
              : typeof output?.url === "string"
                ? output.url
                : null;
        if (outputUrl) {
          // The provider is done. Storing the file is separate, heavy work:
          // hand the run to the persistence phase instead of transferring it
          // inside the provider loop.
          await setStatus(admin, run.id, "provider_output_ready", {
            provider_output_url: outputUrl,
            // Kept so persistence can tell "link expired" from "file gone".
            provider_output_expires_at:
              typeof prediction.outputExpiresAt === "string" ? prediction.outputExpiresAt : null,
            provider_status: "succeeded",
            provider_completed_at: run.provider_completed_at ?? nowIso,
            next_persist_at: nowIso,
            next_reconcile_at: null,
            reconciliation_attempts: attempts,
            last_reconciled_at: nowIso,
            ...providerCreditPatch(run, providerCost),
          });
          // Do not wait for the next cycle to store it.
          await triggerPersist(TAG);
          summary.pending++;
        } else {
          await finalizeFailure(admin, run, "NO_OUTPUT", "provider returned no video");
          summary.failed++;
        }

      } else if (prediction.status === "failed") {
        const verdict = classifyProviderFailure(prediction.error);
        if (verdict.outage) {
          // Whole-engine condition (our provider account is out of funds):
          // loud in the logs so operations sees it before customers do.
          console.error(`${TAG} PROVIDER OUTAGE (${verdict.code}) run=${run.id}: ${verdict.message}`);
        }
        await finalizeFailure(admin, run, verdict.code, verdict.message);
        summary.failed++;
      } else if (prediction.status === "canceled") {
        await finalizeCancelConfirmed(admin, run, providerCost);
        summary.cancelled++;
      } else if (ageMinutes > horizonMinutes) {
        // Horizon reached without an authoritative verdict: visible to admins,
        // never an automatic refund.
        await setStatus(admin, run.id, "manual_review", {
          provider_status: prediction.status,
          reconciliation_attempts: attempts,
          last_reconciled_at: nowIso,
          next_reconcile_at: null,
        });
        summary.manualReview++;
      } else {
        await setStatus(admin, run.id, "provider_processing", {
          provider_status: prediction.status,
          reconciliation_attempts: attempts,
          last_reconciled_at: nowIso,
          next_reconcile_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
        });
        summary.pending++;
      }
    }

    // Late provider cost for ALREADY completed runs (e.g. ByteDance, where the
    // authoritative number can appear after completion). This scanner is only
    // the FALLBACK — an authoritative cost arriving through the webhook or any
    // other active path is trued up immediately. A run stays eligible forever:
    // until its cost is verified or it is administratively closed. Same 3x
    // check, exactly one idempotent credit. Missing cost stays telemetry.
    //
    // Both windows honour `next_late_check_at`: `finalizeSuccess` sets the
    // first check one hour after completion and `applyLateCostTrueUp` grows
    // the interval from there, so a run is never polled at the provider more
    // often than its own backoff allows — whoever triggers the cycle.
    const nowMs = Date.now();
    const freshWindow = new Date(nowMs - 30 * 24 * 3_600_000).toISOString();
    const dueFilter = `next_late_check_at.is.null,next_late_check_at.lte.${new Date(nowMs).toISOString()}`;

    const baseLate = () =>
      admin
        .from("video_enhance_runs")
        .select("*")
        .eq("status", "completed")
        .is("provider_cost_usd_actual", null)
        .is("cost_closed_at", null)
        .not("provider_prediction_id", "is", null)
        .or(dueFilter);

    // 1. preferred window: recently completed runs.
    const { data: freshRuns } = await baseLate()
      .gte("created_at", freshWindow)
      .order("next_late_check_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);

    // 2. stragglers: older runs, in small portions, on a growing backoff.
    const { data: staleRuns } = await baseLate()
      .lt("created_at", freshWindow)
      .order("next_late_check_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);

    const lateRuns = [...(freshRuns ?? []), ...(staleRuns ?? [])];

    let lateCostVerified = 0;
    for (const run of lateRuns) {
      const prediction = await readProvider(run.provider_prediction_id, apiKey);
      if (!prediction) {
        // Provider unreachable: still advance the run's own backoff so a
        // flapping provider cannot turn every cycle into a full re-poll.
        await applyLateCostTrueUp(admin, run, { source: "unavailable" });
        continue;
      }
      const cost = extractProviderCost(prediction, run.model_id, run);
      const applied = await applyLateCostTrueUp(admin, run, cost);
      if (applied.applied) lateCostVerified++;
    }

    // Orphaned staging files of abandoned or stuck runs. Clearing
    // `staging_key` is what takes a row out of this query, so the sweep is
    // idempotent and each orphan costs exactly one storage call ever.
    const cleanupBefore = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { data: orphans } = await admin
      .from("video_enhance_runs")
      .select("id, staging_key")
      .not("staging_key", "is", null)
      .in("status", ["provider_failed", "output_lost", "provider_cancelled_confirmed", "manual_review"])
      .lt("updated_at", cleanupBefore)
      .limit(BATCH_SIZE);

    let cleaned = 0;
    for (const orphan of orphans ?? []) {
      await admin.storage.from(STAGING_BUCKET).remove([orphan.staging_key]).catch(() => undefined);
      await admin.from("video_enhance_runs").update({ staging_key: null }).eq("id", orphan.id);
      cleaned++;
    }

    console.log(`${TAG}`, JSON.stringify({ ...summary, cleaned, lateCostVerified }));
    return json({ ...summary, cleaned, lateCostVerified });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${TAG} unhandled:`, message);
    return json({ error: message }, 500);
  } finally {
    cycle.inFlight = false;
  }
});

// deno-lint-ignore no-explicit-any
async function bump(admin: any, runId: string, attempts: number) {
  await admin
    .from("video_enhance_runs")
    .update({
      reconciliation_attempts: attempts,
      last_reconciled_at: new Date().toISOString(),
      next_reconcile_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
    })
    .eq("id", runId);
}
