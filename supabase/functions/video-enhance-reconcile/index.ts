import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  applyLateCostTrueUp,
  finalizeCancelConfirmed,
  finalizeFailure,
  finalizeSuccess,
} from "../_shared/video-enhance-finalize.ts";
import {
  backoffMinutes,
  extractProviderCost,
  manualReviewAfterMinutes,
  setStatus,
  STAGING_BUCKET,
} from "../_shared/video-enhance-runtime.ts";

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
 * A full cycle is worth running at most this often. The schedule fires every
 * five minutes; anything denser is a burst and is answered without work.
 */
export const MIN_CYCLE_INTERVAL_MS = 30_000;

/**
 * Error codes that describe the provider FILE itself, not our infrastructure.
 * Re-fetching the same file can never change them, so they are terminal after
 * one confirming re-measure (`OUTPUT_VERDICT_CONFIRM_ATTEMPTS`).
 */
const DETERMINISTIC_OUTPUT_FAILURES = new Set(["OUTPUT_MISMATCH", "OUTPUT_INVALID"]);
const OUTPUT_VERDICT_CONFIRM_ATTEMPTS = 2;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const OPEN_STATUSES = [
  "credits_reserved",
  "provider_submitting",
  "provider_submitted",
  "provider_processing",
  "provider_output_ready",
  "asset_staging",
  "asset_persisting",
  "asset_persist_failed",
  "cancel_requested",
  "local_poll_timeout",
];

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Internal callers only. Accepted, in this order:
 *   1. `x-cron-secret` matching CRON_SECRET (when that secret is configured),
 *   2. the service role key as Bearer (edge-to-edge / admin tooling),
 *   3. the project's publishable key as Bearer or `apikey` — what pg_cron
 *      sends. It is public, which is exactly why the work itself is bounded.
 * A user JWT or an empty header is rejected.
 */
export function isInternalCaller(
  headers: Headers,
  env: (key: string) => string | undefined,
): boolean {
  const cronSecret = env("CRON_SECRET");
  const providedCron = headers.get("x-cron-secret");
  if (cronSecret && providedCron && timingSafeEqual(providedCron, cronSecret)) return true;

  const bearer = (headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const apikey = (headers.get("apikey") ?? "").trim();
  const accepted = [env("SUPABASE_SERVICE_ROLE_KEY"), env("SUPABASE_ANON_KEY")]
    .filter((key): key is string => typeof key === "string" && key.length > 0);
  return accepted.some((key) =>
    (bearer && timingSafeEqual(bearer, key)) || (apikey && timingSafeEqual(apikey, key))
  );
}

// Per-isolate burst protection. Not a distributed lock — the per-run
// timestamps below are what make concurrent cycles harmless; this only keeps
// a hammering caller from burning CPU on empty cycles.
let lastCycleStartedAt = 0;
let cycleInFlight = false;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!isInternalCaller(req.headers, (key) => Deno.env.get(key))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const sinceLast = Date.now() - lastCycleStartedAt;
  if (cycleInFlight) return json({ skipped: "in_flight" }, 202);
  if (sinceLast < MIN_CYCLE_INTERVAL_MS) {
    return json({ skipped: "throttled", retryInMs: MIN_CYCLE_INTERVAL_MS - sinceLast }, 202);
  }
  cycleInFlight = true;
  lastCycleStartedAt = Date.now();

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const apiKey = Deno.env.get("REPLICATE_API_KEY");
    if (!apiKey) return json({ error: "REPLICATE_API_KEY not configured" }, 500);

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

      // Persistence retry — the provider already succeeded, no second job.
      if (run.status === "asset_persist_failed" && run.provider_output_url) {
        // A verdict on the provider FILE is deterministic: the same bytes give
        // the same measurement on every retry. After one confirming re-measure
        // such a run is closed as a provider failure (reservation released),
        // instead of re-downloading the file every cycle forever.
        if (
          DETERMINISTIC_OUTPUT_FAILURES.has(run.error_code) &&
          (run.persist_attempts ?? 0) >= OUTPUT_VERDICT_CONFIRM_ATTEMPTS
        ) {
          await finalizeFailure(
            admin,
            run,
            run.error_code,
            run.error_message ?? "provider output does not match the order",
          );
          summary.failed++;
          continue;
        }
        // Transient persistence problems (fetch, staging, asset row) are
        // retried with backoff — but only up to the horizon. Past it the run
        // becomes visible to admins instead of looping silently.
        if (ageMinutes > horizonMinutes) {
          await setStatus(admin, run.id, "manual_review", {
            reconciliation_attempts: attempts,
            last_reconciled_at: nowIso,
            next_reconcile_at: null,
          });
          summary.manualReview++;
          continue;
        }
        const result = await finalizeSuccess(admin, run, run.provider_output_url);
        if (result.ok) summary.completed++;
        else summary.pending++;
        await bump(admin, run.id, attempts);
        continue;
      }

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

      const res = await fetch(`https://api.replicate.com/v1/predictions/${run.provider_prediction_id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        console.error(`${TAG} provider read failed [${res.status}] for run ${run.id}`);
        await bump(admin, run.id, attempts);
        summary.pending++;
        continue;
      }
      const prediction = await res.json();
      const providerCost = extractProviderCost(prediction, run.model_id);

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
          const result = await finalizeSuccess(admin, run, outputUrl, providerCost);
          if (result.ok) summary.completed++;
          else summary.pending++;
        } else {
          await finalizeFailure(admin, run, "NO_OUTPUT", "provider returned no video");
          summary.failed++;
        }
      } else if (prediction.status === "failed") {
        await finalizeFailure(admin, run, "PROVIDER_FAILED", String(prediction.error ?? "provider failed"));
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
      const res = await fetch(`https://api.replicate.com/v1/predictions/${run.provider_prediction_id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        // Provider unreachable: still advance the run's own backoff so a
        // flapping provider cannot turn every cycle into a full re-poll.
        await applyLateCostTrueUp(admin, run, { source: "unavailable" });
        continue;
      }
      const prediction = await res.json();
      const cost = extractProviderCost(prediction, run.model_id);
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
      .in("status", ["provider_failed", "provider_cancelled_confirmed", "manual_review"])
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
    cycleInFlight = false;
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
