import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { isPrivilegedInternalCaller } from "../_shared/video-enhance-reconcile-guard.ts";
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
  triggerPoll,
} from "../_shared/video-enhance-runtime.ts";

/**
 * Server-side provider poll for Video Enhance.
 *
 * Topaz has no signed completion webhook, so completion MUST be discovered by
 * the backend — never by the customer's browser. A minute-granular cron would
 * add up to a minute of dead time after the provider is done, so this function
 * keeps its own dense cadence: it polls every due run, waits inside the same
 * invocation until the next run is due (15 s while a job is young, 30 s up to
 * five minutes, 60 s afterwards) and, when its time budget runs out while work
 * is still open, hands over to a fresh invocation of itself.
 *
 * The minute cron is therefore only a recovery trigger, and the five-minute
 * reconcile stays the watchdog. On provider success the run is recorded as
 * `provider_output_ready` and the persistence worker is kicked immediately.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
};

const TAG = "[video-enhance-poll]";
const BATCH_SIZE = 25;
/** Stay inside the function timeout, leaving room for the hand-over. */
const CYCLE_BUDGET_MS = 40_000;
/** Never sleep longer than this inside one invocation. */
const MAX_SLEEP_MS = 15_000;
/** Safety stop for the self hand-over chain; the cron re-arms it anyway. */
const MAX_CHAIN_DEPTH = 60;

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Summary {
  checked: number;
  ready: number;
  failed: number;
  cancelled: number;
  pending: number;
  cycles: number;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** One pass over every run that is due right now. */
async function pollDueRuns(
  admin: Admin,
  keys: { replicate?: string; topaz?: string },
  summary: Summary,
  deadline: number,
): Promise<{ kickPersist: boolean }> {
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
  summary.cycles++;

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
      // Billed provider units are only readable HERE (the persistence worker
      // never re-reads the provider), so calibration telemetry is captured now.
      const cost = extractProviderCost(prediction, run.model_id);
      const creditPatch: Record<string, unknown> = {};
      if (cost.units !== undefined) {
        creditPatch.actual_units = cost.units;
        if (run.estimated_provider_credits !== null && run.estimated_provider_credits !== undefined) {
          const drift = topazCreditDrift(Number(run.estimated_provider_credits), Number(cost.units));
          creditPatch.actual_provider_credits = cost.units;
          creditPatch.provider_credit_drift_pct =
            drift.driftPct === null ? null : Math.round(drift.driftPct * 10000) / 100;
          creditPatch.provider_credit_drift_flagged = drift.flagged;
        }
      }
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
          ...creditPatch,
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

  return { kickPersist };
}

/** Milliseconds until the next run becomes due, or null when nothing is open. */
async function msUntilNextDue(admin: Admin): Promise<number | null> {
  const { data } = await admin
    .from("video_enhance_runs")
    .select("next_provider_poll_at")
    .in("status", AWAITING_PROVIDER)
    .not("provider_prediction_id", "is", null)
    .order("next_provider_poll_at", { ascending: true, nullsFirst: true })
    .limit(1);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  if (!row.next_provider_poll_at) return 0;
  return Math.max(0, Date.parse(row.next_provider_poll_at) - Date.now());
}

/**
 * The whole dense-cadence loop of one invocation. Runs detached from the HTTP
 * response so a hand-over never keeps the calling invocation waiting.
 */
async function runPollLoop(depth: number): Promise<Summary & { handOver: boolean }> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const keys = {
    replicate: Deno.env.get("REPLICATE_API_KEY"),
    topaz: Deno.env.get("TOPAZ_API_KEY"),
  };

  const deadline = Date.now() + CYCLE_BUDGET_MS;
  const summary: Summary = {
    checked: 0,
    ready: 0,
    failed: 0,
    cancelled: 0,
    pending: 0,
    cycles: 0,
  };
  let kickPersist = false;
  let handOver = false;

  while (Date.now() < deadline) {
    const pass = await pollDueRuns(admin, keys, summary, deadline);
    // One kick per invocation is enough: the worker drains every claimable run.
    if (pass.kickPersist && !kickPersist) {
      kickPersist = true;
      await triggerPersist(TAG);
    }

    const nextDue = await msUntilNextDue(admin);
    if (nextDue === null) break; // nothing left awaiting the provider
    const remaining = deadline - Date.now();
    if (nextDue > remaining) {
      handOver = true;
      break;
    }
    await sleep(Math.min(Math.max(nextDue, 1_000), MAX_SLEEP_MS));
  }

  // Work is still open but our time is up: keep the dense cadence alive by
  // handing over to a fresh invocation. The cron remains the safety net.
  if (handOver && depth < MAX_CHAIN_DEPTH) await triggerPoll(depth + 1, TAG);

  console.log(TAG, JSON.stringify({ ...summary, depth, handOver }));
  return { ...summary, handOver };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!isPrivilegedInternalCaller(req.headers, (key) => Deno.env.get(key))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let depth = 0;
  try {
    const body = await req.json().catch(() => ({}));
    const raw = Number((body as { depth?: unknown })?.depth);
    depth = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  } catch {
    depth = 0;
  }

  const work = runPollLoop(depth).catch((error) => {
    console.error(`${TAG} unhandled:`, error instanceof Error ? error.message : String(error));
  });

  // Detach: the caller (cron, or the previous poll invocation) gets an answer
  // immediately, the loop keeps running in the background.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") {
    runtime.waitUntil(work);
    return json({ ok: true, accepted: true, depth }, 202);
  }

  const result = await work;
  return json({ ok: true, depth, ...(result ?? {}) });
});

