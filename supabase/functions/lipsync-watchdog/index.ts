/**
 * lipsync-watchdog — server-side single source of truth for stale lip-sync runs.
 *
 * Runs every 2 min via pg_cron. Two responsibilities:
 *
 *  1. POLLING FALLBACK (v25 Fan-Out):
 *     Sync.so does NOT retry missed webhook deliveries. For every v5
 *     sync-segments scene with `rendering` passes we GET the Sync.so job
 *     status and apply COMPLETED/FAILED exactly like the webhook would —
 *     so a lost webhook never strands a scene.
 *
 *  2. DISPATCH FALLBACK (v25 Fan-Out):
 *     For scenes with `pending` passes (deferred by Sync.so concurrency
 *     on initial dispatch) we trigger compose-dialog-segments advance so
 *     the pass actually runs when slots are free.
 *
 *  3. STALE-FAILURE (last resort):
 *     Only after polling + dispatching, if a scene is still stuck past
 *     the hard TTL, mark it terminal-failed with refund via `failLipSync`.
 *
 * Replaces the previous client-side stale-reset code that caused the loop.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { failLipSync } from "../_shared/lipsync-fail.ts";
import { getSyncApiKey, releaseInflightSyncJob, logSyncDispatch } from "../_shared/syncso-preflight.ts";
// V443 — exactly-once re-measure of `motion_unverified` passes. Measurement
// only: same immutable provider output, never a new provider job.
import { measureProviderMotionSync } from "../_shared/measure-provider-motion-sync.ts";
import { classifyMotionProbe } from "../_shared/motion-probe-classifier.ts";
import {
  classifyMeasurementFailure,
  isMouthRoiUnresolved,
  MOTION_UNVERIFIED_STATE,
} from "../_shared/motion-probe-infra.ts";
import { withDialogLock } from "../_shared/dialog-lock.ts";
// V459 — Preflight-Zombie-Recovery + Terminal Fan-out Aggregation.
import {
  evaluateRunAggregation,
  isPreflightZombieCandidate,
  decideZombieAction,
  preflightRecoveryCount,
  isFanoutClosed,
  V459_FANOUT_CLOSED_KEY,
  V459_TERMINALIZING_STATUS,
  closeBlockedPasses,
} from "../_shared/v459-fanout-aggregation.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { logMissingReinjectPointer } from "../_shared/v431-ledger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// TTLs (ms): a `running` scene with no measurable progress beyond this is dead.
const STALE_PROVIDER_MS = 10 * 60_000;   // Sync.so jobs in flight w/o update
const STALE_PREFLIGHT_MS = 4 * 60_000;   // running but never produced a provider job
const STALE_HARD_MS = 25 * 60_000;       // v126: 20→25 min — one extra cron tick for recovery
// Plan v71: `pending + master_clip + clip_url + audio_plan` with NO dispatch yet
// means compose-dialog-segments was never called (lost client invoke / 202 race).
// v94: 90s → 30s. Sync.so normal render is 25-45s; with the cron also tightened
// to 1min, lost-invoke recovery drops from ~3.5min → ~60s. Double-dispatch is
// safe — compose-dialog-segments' idempotency guard returns `already_running`.
const STALE_DISPATCH_RECOVERY_MS = 30_000;
// v252 — Audio-mux stall guard. A dispatched DialogStitchVideo Lambda that
// hasn't produced a webhook after this window is considered dead. Lambda's
// own timeout is now 300 s (see render-sync-segments-audio-mux), so 6 min
// gives one extra retry cycle before we hard-fail the scene.
const STALE_AUDIO_MUX_MS = 6 * 60_000;

const SYNC_API_BASE = "https://api.sync.so/v2";

interface SceneRow {
  id: string;
  project_id: string;
  lip_sync_status: string | null;
  lip_sync_applied_at: string | null;
  twoshot_stage: string | null;
  clip_url: string | null;
  replicate_prediction_id: string | null;
  dialog_shots: any;
  audio_plan: any;
  updated_at: string;
  active_run_id?: string | null;
}

/**
 * v431 G3.1b — Retry-Kontext für Re-Dispatches des Watchdogs.
 *
 * Initial-Akquise gilt NUR, wenn für diese Identität (Scene/Run/Stage/Segment)
 * überhaupt kein Attempt existiert — nicht bloß „kein dispatchter Job". Findet
 * sich ein Vorgänger (auch `failed`, `stale` oder `dispatch_uncertain`), reist
 * er als expliziter Retry-Kontext mit; über Zulässigkeit entscheidet dann der
 * Predecessor-/Replace-Vertrag in der DB, nicht der Watchdog.
 *
 * Zwischen diesem Read und dem Replace kann ein anderer Retry gewinnen; das
 * verhindert der atomare Replace-Vertrag (`stale` + `replaced_by` bzw.
 * `retry_superseded`). Ein zusätzlicher Client-Lock ist nicht nötig.
 */
async function buildRetryContext(
  supabase: any,
  sceneId: string,
  runId: string | null | undefined,
  stage: string,
): Promise<{ retry_of_pipeline_job_id: string; retry_reason: string } | Record<string, never>> {
  if (!runId) return {};
  try {
    const { data } = await supabase
      .from("composer_pipeline_jobs")
      .select("id, attempt_no")
      .eq("scene_id", sceneId)
      .eq("run_id", runId)
      .eq("stage", stage)
      .is("segment_id", null)
      .order("attempt_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.id) return {};
    return {
      retry_of_pipeline_job_id: String(data.id),
      retry_reason: "watchdog_stalled",
    };
  } catch {
    return {};
  }
}


function hasRecordedProviderJobLocal(d: SceneRow): boolean {
  if (typeof d.replicate_prediction_id === "string" && d.replicate_prediction_id.startsWith("sync:")) {
    return true;
  }
  const ds = d.dialog_shots ?? {};
  const shots = Array.isArray(ds.shots) ? ds.shots : [];
  if (shots.some((s: any) => s?.sync_job_id)) return true;
  const passes = Array.isArray(ds.passes) ? ds.passes : [];
  if (passes.some((p: any) => p?.job_id)) return true;
  if (ds?.sync_job_id) return true;
  const plan = d.audio_plan ?? {};
  if (plan?.twoshot?.heartbeat?.syncJobId) return true;
  const jobs = plan?.twoshot?.syncJobs?.jobs;
  if (Array.isArray(jobs) && jobs.length > 0) return true;
  return false;
}

async function hasRecordedProviderJob(supabase: any, d: SceneRow): Promise<boolean> {
  if (hasRecordedProviderJobLocal(d)) return true;
  try {
    const { count } = await supabase
      .from("syncso_dispatch_log")
      .select("id", { count: "exact", head: true })
      .eq("scene_id", d.id)
      .gte(
        "created_at",
        new Date(new Date(d.updated_at).getTime() - 5 * 60_000).toISOString(),
      );
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

async function userIdForProject(supabase: any, projectId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", projectId)
      .maybeSingle();
    return (data as any)?.user_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Poll Sync.so for a single job_id and forward terminal status to our own
 * sync-so-webhook so the existing v25 fan-out branch handles re-host, pass
 * advance, and compositor dispatch. `terminal` says the provider was done;
 * v441 additionally reports whether the webhook actually APPLIED the result
 * (`applied`) or rejected it (`applyReason`, e.g. `write_id_mismatch`). A
 * forward that is not applied is NOT progress and must not suppress the
 * watchdog's own escalation.
 */
async function pollAndForward(opts: {
  syncApiKey: string;
  jobId: string;
  sceneId: string;
  supabaseUrl: string;
  serviceKey: string;
  pipelineJobId: string | null;
}): Promise<{ terminal: boolean; status?: string; applied?: boolean; applyReason?: string | null }> {
  const { syncApiKey, jobId, sceneId, supabaseUrl, serviceKey, pipelineJobId } = opts;
  try {
    const r = await fetch(`${SYNC_API_BASE}/generate/${jobId}`, {
      method: "GET",
      headers: { "x-api-key": syncApiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      console.warn(`[lipsync-watchdog] poll job=${jobId} HTTP ${r.status}`);
      return { terminal: false };
    }
    const body: any = await r.json().catch(() => ({}));
    const status = String(body?.status ?? "").toUpperCase();
    if (!["COMPLETED", "FAILED", "REJECTED", "CANCELED"].includes(status)) {
      return { terminal: false, status };
    }
    // Forward to our own webhook so the v25 branch (re-host, pass advance,
    // compositor dispatch, retry/refund) runs unchanged. Include the
    // scene_id query hint and shared-secret token so verifyWebhookRequest
    // accepts it.
    // v431 G3.1f — Transport-Pointer ist Pflicht; ohne ihn wird der Callback
    // NICHT weitergereicht (kein ungebundener Re-Inject).
    if (!pipelineJobId) {
      logMissingReinjectPointer({
        function: "lipsync-watchdog",
        sceneId,
        stage: "sync_segment",
        externalJobId: jobId,
      });
      return { terminal: false };
    }
    const sharedSecret = Deno.env.get("WEBHOOK_SHARED_SECRET") ?? "";
    const webhookUrl =
      `${supabaseUrl}/functions/v1/sync-so-webhook?scene_id=${sceneId}` +
      `&pipeline_job_id=${encodeURIComponent(pipelineJobId)}` +
      (sharedSecret ? `&token=${encodeURIComponent(sharedSecret)}` : "");
    let applied: boolean | undefined = undefined;
    let applyReason: string | null = null;
    try {
      const wr = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(body),
      });
      // v441 — der Webhook meldet `applied` + `reason` (settleVerdict). Nur ein
      // angewandter Callback ist echter Fortschritt.
      const wb: any = await wr.json().catch(() => ({}));
      if (typeof wb?.applied === "boolean") applied = wb.applied;
      applyReason = (wb?.reason as string | null) ?? (wb?.skipped as string | null) ?? null;
    } catch (e) {
      console.warn(`[lipsync-watchdog] forward webhook crash: ${(e as Error).message}`);
    }
    console.log(
      `[lipsync-watchdog] polled job=${jobId} status=${status} → forwarded to webhook scene=${sceneId} ` +
        `applied=${applied ?? "?"} reason=${applyReason ?? "-"}`,
    );
    return { terminal: true, status, applied, applyReason };
  } catch (e) {
    console.warn(`[lipsync-watchdog] poll crash job=${jobId}: ${(e as Error).message}`);
    return { terminal: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (isQaMockRequest(req)) return qaMockResponse({ corsHeaders, kind: "video" });


  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const syncApiKey = getSyncApiKey() || null;

  // v32: widen the scan. The previous `lip_sync_status IN ('running','audio_muxing')`
  // filter missed scenes that compose-dialog-segments parked at
  // `pending + twoshot_stage='circuit_open'` (or `deferred`). Those rows
  // still have an active v5 dialog_shots state but were invisible to the
  // watchdog, so the client kept re-triggering them in a loop.
  // We now also include `lip_sync_status='pending'` when twoshot_stage marks
  // a backend wait state, and we no longer use `updated_at` for the TTL —
  // the loop refreshes updated_at constantly. Real liveness is measured
  // against `dialog_shots.first_started_at`.
  const { data: rows, error } = await supabase
    .from("composer_scenes")
    .select(
      "id, project_id, lip_sync_status, lip_sync_applied_at, twoshot_stage, clip_url, replicate_prediction_id, dialog_shots, audio_plan, updated_at, active_run_id",
    )

    // v141 — Widen filter to include the zombie state observed on
    // 2026-06-20: `pending + twoshot_stage=syncso_fanout_3_of_4`.
    // After a watchdog auto-retry reset a `rendering` pass to `pending`
    // but the original Sync.so job still completes via late webhook,
    // the scene gets stuck because neither branch picked it up. We now
    // also scan `pending + syncso_fanout_*` / `syncso_retry_*` /
    // `syncso_fanout_recovering` / `audio_muxing` so the v5 fan-out
    // poller + dispatcher branch handles them.
    .or(
      "lip_sync_status.in.(running,audio_muxing)," +
      "and(lip_sync_status.eq.pending,twoshot_stage.in.(circuit_open,deferred,master_clip,syncso_fanout_recovering,audio_muxing))," +
      "and(lip_sync_status.eq.pending,twoshot_stage.like.syncso_fanout_%)," +
      "and(lip_sync_status.eq.pending,twoshot_stage.like.syncso_retry_%)," +
      "and(lip_sync_status.eq.pending,twoshot_stage.is.null,clip_url.is.null)",
    )
    .is("lip_sync_applied_at", null)
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const failed: Array<{ scene_id: string; reason: string }> = [];
  const polled: Array<{ scene_id: string; job_id: string; status: string }> = [];
  // v441 — nur Callbacks, die der Webhook tatsächlich angewandt hat, gelten als
  // Fortschritt und dürfen die Provider-Timeout-Eskalation unterdrücken.
  const progressed: Array<{ scene_id: string; job_id: string }> = [];
  const advanced: Array<{ scene_id: string; pass_idx: number }> = [];

  for (const d of (rows ?? []) as SceneRow[]) {
    // v128 Phase B3 — wrap every mutation on this scene in the per-scene
    // dialog lock. Previously the watchdog mutated `composer_scenes` and
    // dispatched advance invokes without holding the lock, so it could
    // race the sync-so-webhook (now locked in B2) and compose-dialog-
    // segments (already locked) and either clobber a freshly-set pass
    // status OR re-dispatch a pass that the webhook had just marked
    // terminal in the same window.
    await withDialogLock(supabase, d.id, "lipsync-watchdog", async () => {
    const ds: any = d.dialog_shots ?? {};

    // v129.4a — Terminal no-op guard.
    // The sync-so-webhook is the single source of truth for scene
    // terminalisation. If it has already marked this scene `failed` /
    // `applied` / `canceled`, the Watchdog must NOT overwrite the real
    // root cause (e.g. `provider_unknown_error`) with its own generic
    // `watchdog_provider_timeout` / `watchdog_hard_timeout`. Skip the row.
    const lipStatus = String(d.lip_sync_status ?? "");
    const dsStatus = String(ds?.status ?? "");
    if (
      lipStatus === "failed" || lipStatus === "applied" || lipStatus === "canceled" ||
      dsStatus === "failed" || dsStatus === "done" || dsStatus === "canceled"
    ) {
      return;
    }
    // Liveness anchor: prefer first_started_at, fall back to started_at,
    // then earliest pass started_at, then updated_at (last resort).
    const passStarts = Array.isArray(ds?.passes)
      ? ds.passes.map((p: any) => p?.started_at).filter((s: any) => typeof s === "string")
      : [];
    const startCandidate =
      ds?.first_started_at ??
      ds?.started_at ??
      (passStarts.length > 0 ? passStarts.sort()[0] : null) ??
      d.updated_at;
    const startedAtMs = startCandidate ? Date.parse(startCandidate) : Date.now();
    const ageMs = now - startedAtMs;
    const isV5Fanout =
      ds?.version === 5 &&
      ds?.engine === "sync-segments" &&
      Array.isArray(ds?.passes);

    // ── v252 audio-mux stall guard ────────────────────────────────────────
    // `render-sync-segments-audio-mux` dispatches the final DialogStitchVideo
    // Lambda and persists `dialog_shots.audio_mux = { render_id, dispatched_at }`.
    // If that Lambda never calls remotion-webhook (crash pre-startup / lost
    // invoke / IAM anomaly), the scene sits in `audio_muxing` forever. Detect
    // it here, mark it failed, refund credits, and let the reset/auto-trigger
    // path start a clean retry.
    const muxDispatchedAt = ds?.audio_mux?.dispatched_at
      ? Date.parse(String(ds.audio_mux.dispatched_at))
      : null;
    const muxAge = muxDispatchedAt ? now - muxDispatchedAt : 0;
    if (
      d.lip_sync_status === "audio_muxing" &&
      muxDispatchedAt &&
      muxAge >= STALE_AUDIO_MUX_MS
    ) {
      const refundCredits = Number(ds?.cost_credits) || 0;
      let refundedFlag = !!ds?.refunded;
      // Best-effort refund via increment_balance RPC (same path used by the
      // dialog-stitch webhook fail branch).
      if (!refundedFlag && refundCredits > 0) {
        const { data: sceneUser } = await supabase
          .from("composer_scenes")
          .select("created_by")
          .eq("id", d.id)
          .maybeSingle();
        const userId = (sceneUser as any)?.created_by;
        if (userId) {
          try {
            await supabase.rpc("increment_balance", {
              p_user_id: userId,
              p_amount: refundCredits,
            });
            refundedFlag = true;
          } catch (e) {
            console.warn(
              `[lipsync-watchdog] scene=${d.id} audio_mux refund failed: ${(e as Error).message}`,
            );
          }
        }
      }
      // Flip the pending video_renders row for this render_id to failed so
      // downstream analytics / status pages reflect reality.
      const muxRenderId = ds?.audio_mux?.render_id;
      if (muxRenderId) {
        await supabase
          .from("video_renders")
          .update({
            status: "failed",
            error_message: "watchdog_audio_mux_stall: no webhook after 6min",
            completed_at: new Date().toISOString(),
          })
          .eq("render_id", muxRenderId)
          .in("status", ["pending", "rendering"]);
      }
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "audio_mux_failed",
          clip_error: "watchdog_audio_mux_stall: no webhook after 6min",
          dialog_shots: {
            ...(ds as any),
            status: "failed",
            error: "watchdog_audio_mux_stall",
            refunded: refundedFlag,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", d.id);
      console.log(
        `[lipsync-watchdog] scene=${d.id} audio_mux_stall killed after ${Math.round(muxAge / 1000)}s (refunded=${refundedFlag})`,
      );
      failed.push({ scene_id: d.id, reason: "audio_mux_stall" });
      return;
    }

    const orphanedPendingNoClip =
      d.lip_sync_status === "pending" &&
      !d.twoshot_stage &&
      !d.clip_url &&
      !d.lip_sync_applied_at;
    if (orphanedPendingNoClip && ageMs >= STALE_PREFLIGHT_MS) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: null,
          twoshot_stage: null,
          clip_error: "watchdog: orphaned_lipsync_pending_no_clip",
          updated_at: new Date().toISOString(),
        })
        .eq("id", d.id);
      failed.push({ scene_id: d.id, reason: "orphaned_lipsync_pending_no_clip" });
      return;
    }

    // ── (1) v25 Polling fallback: forward terminal Sync.so jobs we missed ──
    // v441 — Apply-Rejection-Guard: ein Provider-COMPLETED, das der Webhook
    // wiederholt NICHT anwenden kann (z. B. `write_id_mismatch`), ist kein
    // Fortschritt. Ohne diesen Guard re-forwardet der Watchdog denselben
    // abgelehnten Callback im Minutentakt endlos weiter.
    let applyRejectedStuck = false;
    if (isV5Fanout && syncApiKey) {
      const renderingPasses = (ds.passes as any[])
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p?.status === "rendering" && typeof p?.job_id === "string");
      for (const { p, i } of renderingPasses) {
        const r = await pollAndForward({
          syncApiKey, jobId: p.job_id, sceneId: d.id, supabaseUrl, serviceKey,
          pipelineJobId: (p?.pipeline_job_id as string | null) ?? null,
        });
        if (r.terminal) {
          polled.push({ scene_id: d.id, job_id: p.job_id, status: r.status ?? "?" });
          if (r.applied === false) {
            const startedMs = typeof p?.started_at === "string" ? Date.parse(p.started_at) : NaN;
            const passAge = Number.isFinite(startedMs) ? now - startedMs : Infinity;
            console.warn(
              `[lipsync-watchdog] v441 apply_rejected scene=${d.id} pass=${i} job=${p.job_id} ` +
                `reason=${r.applyReason ?? "-"} age=${Math.round(passAge / 1000)}s`,
            );
            if (passAge > STALE_PROVIDER_MS) applyRejectedStuck = true;
          } else {
            progressed.push({ scene_id: d.id, job_id: p.job_id });
            await releaseInflightSyncJob(supabase, p.job_id);
          }
        }
        void i;
      }
    }

    // ── (1.5) V459 — Terminal Fan-out Aggregation (VOR jedem Dispatch) ────
    // Alle Pässe sind für ein vollständiges Resultat erforderlich. Ein terminal
    // gescheiterter Required-Pass macht den Run unrettbar. Reihenfolge ist
    // race-kritisch: Fence zuerst, Ledger danach, Refund zuletzt.
    if (isV5Fanout) {
      const { data: aggRow } = await supabase
        .from("composer_scenes")
        .select("dialog_shots")
        .eq("id", d.id)
        .maybeSingle();
      const aggState: any = (aggRow as any)?.dialog_shots ?? ds;
      const aggPasses: any[] = Array.isArray(aggState?.passes) ? aggState.passes : [];
      const verdict = evaluateRunAggregation(aggPasses);

      if (verdict.runIrrecoverable && !isFanoutClosed(aggState)) {
        // Fence: CAS auf dem aktuellen dialog_shots.status. Ab hier bricht der
        // Pre-Dispatch-Recheck in compose-dialog-segments jeden Provider-Call ab.
        const fencedStatus = String(aggState?.status ?? "");
        const { data: fenced } = await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: {
              ...aggState,
              status: V459_TERMINALIZING_STATUS,
              [V459_FANOUT_CLOSED_KEY]: true,
              v459_fanout_closed_at: new Date().toISOString(),
              v459_prev_status: fencedStatus,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", d.id)
          .eq("dialog_shots->>status", fencedStatus)
          .select("id");
        const fenceWon = Array.isArray(fenced) && fenced.length > 0;
        console.log(
          `[lipsync-watchdog] v459 fanout_fence scene=${d.id} won=${fenceWon} ` +
            `prev_status=${fencedStatus} reason=${verdict.reason} ` +
            `blocked=[${verdict.blockedPassIdxs.join(",")}]`,
        );
        if (!fenceWon) return; // jemand anders hat den Zustand gerade geändert
      }

      if (verdict.runIrrecoverable) {
        // Nach dem Fence: Ledger/Provider-Jobs ERNEUT prüfen.
        const { data: postRow } = await supabase
          .from("composer_scenes")
          .select("dialog_shots")
          .eq("id", d.id)
          .maybeSingle();
        const postState: any = (postRow as any)?.dialog_shots ?? aggState;
        const postPasses: any[] = Array.isArray(postState?.passes) ? postState.passes : [];
        const postVerdict = evaluateRunAggregation(postPasses);
        if (!postVerdict.canTerminalizeNow) {
          console.log(
            `[lipsync-watchdog] v459 terminalize_deferred scene=${d.id} ` +
              `inflight=[${postVerdict.unreconciledPassIdxs.join(",")}] — kein Refund, warte auf Reconciliation`,
          );
          return; // kein Dispatch, keine Zombie-Recovery, kein Refund
        }
        const aggUid = await userIdForProject(supabase, d.project_id);
        const aggRefund = Number(postState?.cost_credits ?? ds?.cost_credits) || 0;

        // V459 — Fence-Abschluss VOR dem Refund: blockierte Pässe ohne
        // Provider-Job werden terminal `canceled_by_scene_failure`, damit kein
        // Pass in einem terminalen Run auf `pending` hängen bleibt. Pässe mit
        // echtem Provider-Job werden bewusst nicht gecancelt — die kommen hier
        // gar nicht an, weil `canTerminalizeNow` sie vorher blockiert.
        const closure = closeBlockedPasses(postPasses, postVerdict.blockedPassIdxs, {
          nowIso: new Date().toISOString(),
          reason: "v459_terminal_required_pass_failure",
        });
        if (closure.canceledIdxs.length > 0) {
          await supabase
            .from("composer_scenes")
            .update({
              dialog_shots: { ...postState, passes: closure.passes },
              updated_at: new Date().toISOString(),
            })
            .eq("id", d.id);
        }
        console.log(
          `[lipsync-watchdog] v459 fence_closure scene=${d.id} ` +
            `canceled=[${closure.canceledIdxs.join(",")}] ` +
            `skipped_inflight=[${closure.skippedInflightIdxs.join(",")}]`,
        );

        await failLipSync({
          supabase,
          sceneId: d.id,
          userId: aggUid,
          reason: "v459_terminal_required_pass_failure",
          refundCredits: aggRefund,
          runId: (postState?.run_id ?? (d as any)?.active_run_id ?? null) as string | null,
          syncApiKey,
        });
        console.log(
          `[lipsync-watchdog] v459 terminalized scene=${d.id} refund=${aggRefund} ` +
            `blocked_passes=[${postVerdict.blockedPassIdxs.join(",")}]`,
        );
        failed.push({ scene_id: d.id, reason: "v459_terminal_required_pass_failure" });
        return;
      }
    }

    // ── (2) Dispatch deferred-pending fan-out passes ─────────────────────

    // Skip dispatching while we're parked on circuit_open — re-triggering
    // compose-dialog-segments would just hit the circuit again and reset
    // updated_at, masking the real TTL.
    if (isV5Fanout && d.twoshot_stage !== "circuit_open") {
      // v126 — Also pick up `retrying` passes with no live job_id. Previously
      // a pass set to `retrying` by the webhook but with a lost re-dispatch
      // invoke would sit idle until the watchdog killed the whole scene.
      // v128 Phase B3 — `done_suspect` is also terminal (Alpha-Plan v3.1
      // §1.6 / PASS_DONE_SUSPECT); never advance a suspect pass.
      const pendingIdxs = (ds.passes as any[])
        .map((p, i) => {
          const st = String(p?.status ?? "");
          if (
            st === "done" ||
            st === "done_suspect" ||
            st === "rendering" ||
            st === "failed" ||
            st === "canceled_by_scene_failure"
          ) return -1;
          // v144 — Do not advance a pass that is currently in an active
          // NOOP-escalation cycle (status reset to pending by sync-so-webhook
          // + fresh noop_retry_attempt_id). The webhook already fired a
          // dedicated re-dispatch with the next ladder rung; a parallel
          // `advance:true` call from the watchdog would race that and either
          // double-dispatch or revert the variant back to coords-pro.
          const inActiveNoopRetry =
            !!p?.noop_retry_attempt_id &&
            Number(p?.noop_escalation_step ?? 0) > 0 &&
            st === "pending";
          if (inActiveNoopRetry) return -1;
          // V459 — ein Pass in `rendering_preflight` ist geclaimt. Er gehört
          // der Zombie-Recovery unten, nicht dem Advance-Dispatch (der sonst
          // nur im Minutentakt gegen den Per-Pass-Lock läuft).
          if (st === "rendering_preflight") return -1;
          if (st === "pending" || !p?.job_id) return i;
          if (st === "retrying" && !p?.job_id) return i;
          return -1;
        })
        .filter((i) => i >= 0);
      if (pendingIdxs.length > 0) {
        const next = pendingIdxs[0];
        try {
          const retryCtx = await buildRetryContext(supabase, d.id, d.active_run_id, "sync_segment");
          await fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ scene_id: d.id, advance: true, pass_idx: next, ...retryCtx }),
          });

          advanced.push({ scene_id: d.id, pass_idx: next });
        } catch (e) {
          console.warn(`[lipsync-watchdog] advance dispatch crash scene=${d.id}: ${(e as Error).message}`);
        }
      }
    }

    // ── (2.6) V459 — Preflight-Zombie-Recovery (nur für rettbare Runs) ────
    // Ein Dispatcher hat den Per-Pass-Lock geholt, ist gestorben und hat den
    // Pass in `rendering_preflight` ohne job_id zurückgelassen. Exklusivität
    // wird NICHT per SELECT geprüft (TOCTOU), sondern über denselben fenced
    // `try_acquire_dialog_lock` erworben.
    if (isV5Fanout) {
      const zPasses: any[] = Array.isArray(ds?.passes) ? ds.passes : [];
      for (let zi = 0; zi < zPasses.length; zi++) {
        if (!isPreflightZombieCandidate({ pass: zPasses[zi], activeRunId: d.active_run_id, nowMs: now })) {
          continue;
        }
        const wdToken = `lipsync-watchdog-v459-${crypto.randomUUID()}`;
        let wdAcquired = false;
        try {
          const { data: acq } = await supabase.rpc("try_acquire_dialog_lock", {
            _scene_id: d.id,
            _holder: wdToken,
            _ttl_seconds: 60,
            _pass_idx: zi,
          });
          wdAcquired = acq === true;
          if (!wdAcquired) {
            console.log(`[lipsync-watchdog] v459 zombie_lock_busy scene=${d.id} pass=${zi} — skipping`);
            continue;
          }
          // Nach dem Lock: Zustand ERNEUT lesen und validieren.
          const { data: reRow } = await supabase
            .from("composer_scenes")
            .select("dialog_shots, active_run_id")
            .eq("id", d.id)
            .maybeSingle();
          const reState: any = (reRow as any)?.dialog_shots ?? null;
          const rePass: any = Array.isArray(reState?.passes) ? reState.passes[zi] : null;
          const reRunId = (reRow as any)?.active_run_id ?? d.active_run_id;
          if (isFanoutClosed(reState)) continue;
          if (!isPreflightZombieCandidate({ pass: rePass, activeRunId: reRunId, nowMs: Date.now() })) {
            continue;
          }
          const action = decideZombieAction(rePass, reRunId);
          if (action === "reset_to_pending") {
            await supabase.rpc("update_dialog_pass_slot", {
              _scene_id: d.id,
              _pass_idx: zi,
              _patch: {
                status: "pending",
                job_id: null,
                v459_preflight_started_at: null,
                preflight_started_at: null,
                v459_preflight_recovery_count: preflightRecoveryCount(rePass, reRunId) + 1,
                v459_preflight_recovery_run_id: reRunId ?? null,
                v459_preflight_recovered_at: new Date().toISOString(),
              },
            });
            console.log(`[lipsync-watchdog] v459_preflight_zombie_recovered scene=${d.id} pass=${zi}`);
            try {
              await logSyncDispatch(supabase, {
                scene_id: d.id,
                engine: "sync-segments",
                turn_idx: zi,
                sync_status: "PREFLIGHT_ZOMBIE_RECOVERED",
                error_class: "v459_preflight_zombie",
                meta: { pass_idx: zi, run_id: reRunId ?? null, recovery_count: preflightRecoveryCount(rePass, reRunId) + 1 },
              });
            } catch { /* best-effort */ }
          } else {
            // Budget erschöpft → Pass terminal. KEIN eigener Refund-Pfad:
            // die Geldbewegung gehört der kanonischen Aggregation (nächster Tick).
            await supabase.rpc("update_dialog_pass_slot", {
              _scene_id: d.id,
              _pass_idx: zi,
              _patch: {
                status: "failed",
                last_error_class: "v459_preflight_zombie_unrecoverable",
                error: "v459_preflight_zombie_unrecoverable",
                finished_at: new Date().toISOString(),
              },
            });
            console.warn(
              `[lipsync-watchdog] v459 zombie_budget_exhausted scene=${d.id} pass=${zi} → pass failed, aggregation follows`,
            );
          }
        } catch (e) {
          console.warn(`[lipsync-watchdog] v459 zombie recovery crash scene=${d.id} pass=${zi}: ${(e as Error).message}`);
        } finally {
          if (wdAcquired) {
            try {
              await supabase.rpc("release_dialog_lock", {
                _scene_id: d.id,
                _holder: wdToken, // fenced: löscht ausschliesslich den eigenen Lock
                _pass_idx: zi,
              });
            } catch { /* best-effort */ }
          }
        }
      }
    }



    // ── (2.5) Dispatch-recovery: master_clip never reached Sync.so ────────
    // Plan v71 root cause: scene has clip_url + audio_plan.twoshot.url but
    // compose-dialog-segments was never invoked (lost client invoke / 202 race
    // / inflight-lock leak). Re-dispatch idempotently. The previous
    // `recovery_dispatched_at` was a sticky one-shot marker that left scenes
    // wedged forever if the recovery invoke itself didn't produce a Sync.so
    // job (silent invoke failure, transient preflight retry, etc.). We now
    // treat it as a 90s cooldown so the watchdog can re-dispatch as long as
    // the scene still has no provider job and no dispatch log row.
    const RECOVERY_COOLDOWN_MS = 90_000;
    const hasAudioPlan =
      typeof d.audio_plan?.twoshot?.url === "string" && d.audio_plan.twoshot.url.length > 0;
    const lastRecovery = typeof ds?.recovery_dispatched_at === "string"
      ? Date.parse(ds.recovery_dispatched_at)
      : NaN;
    const recoveryCoolingDown =
      Number.isFinite(lastRecovery) && now - lastRecovery < RECOVERY_COOLDOWN_MS;
    const noDispatchYet = !hasRecordedProviderJobLocal(d);
    // Also check the dispatch log table to be sure we didn't already reach
    // the dispatcher in this scene's lifetime (preflight-blocked counts too).
    let dispatchLogCount = 0;
    if (noDispatchYet && !recoveryCoolingDown) {
      try {
        const { count } = await supabase
          .from("syncso_dispatch_log")
          .select("id", { count: "exact", head: true })
          .eq("scene_id", d.id);
        dispatchLogCount = count ?? 0;
      } catch { /* tolerate */ }
    }
    if (
      d.lip_sync_status === "pending" &&
      d.twoshot_stage === "master_clip" &&
      typeof d.clip_url === "string" && d.clip_url.length > 0 &&
      hasAudioPlan &&
      noDispatchYet &&
      !recoveryCoolingDown &&
      dispatchLogCount === 0 &&
      ageMs >= STALE_DISPATCH_RECOVERY_MS
    ) {
      console.log(
        `[lipsync-watchdog] dispatch-recovery scene=${d.id} age=${Math.round(ageMs / 1000)}s ` +
        `last_recovery=${Number.isFinite(lastRecovery) ? new Date(lastRecovery).toISOString() : "never"}`,
      );
      try {
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: { ...(ds || {}), recovery_dispatched_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          })
          .eq("id", d.id);
        const recoveryRetryCtx = await buildRetryContext(
          supabase,
          d.id,
          d.active_run_id,
          "sync_segment",
        );
        const invokeResp = await fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ scene_id: d.id, auto: true, recovery: true, ...recoveryRetryCtx }),
        });

        const invokeBody = await invokeResp.text().catch(() => "");
        console.log(
          `[lipsync-watchdog] dispatch-recovery invoke scene=${d.id} status=${invokeResp.status} ` +
          `body=${invokeBody.slice(0, 200)}`,
        );
        advanced.push({ scene_id: d.id, pass_idx: -1 });
      } catch (e) {
        console.warn(`[lipsync-watchdog] dispatch-recovery crash scene=${d.id}: ${(e as Error).message}`);
      }
      return; // give it a tick before considering failure
    }

    // ── (3) Stale-failure (last resort, only past hard TTL or true preflight) ─
    if (ageMs < STALE_PREFLIGHT_MS) return;
    const hasJob = await hasRecordedProviderJob(supabase, d);

    // v129.21.2 — Don't treat "no provider job yet" as a preflight abort
    // while the upstream master-clip (Hailuo i2v) is still rendering at the
    // provider. The dispatch-recovery branch above only fires once
    // twoshot_stage='master_clip' AND clip_url is set; before that, the
    // Replicate prediction is still in flight (typical 6-10 min for 4-cast
    // anchor scenes) and we must not kill the scene. The HARD timeout
    // (25 min) below still catches genuine Hailuo hangs + refunds.
    const masterClipInFlight =
      d.twoshot_stage === "master_clip" &&
      !d.clip_url &&
      typeof d.replicate_prediction_id === "string" &&
      d.replicate_prediction_id.length > 0;

    let reason: string | null = null;
    if (applyRejectedStuck) {
      // v441 — Pass-Level-Cap: Provider fertig, Webhook lehnt den Write seit
      // >10 min wiederholt ab. Kein Re-Forward mehr, sondern kontrollierte
      // Terminalisierung inkl. Refund/Cleanup über failLipSync.
      reason = "watchdog_apply_rejected_stuck";
    } else if (ageMs > STALE_HARD_MS) {
      reason = "watchdog_hard_timeout";
    } else if (d.twoshot_stage === "circuit_open" && ageMs > STALE_PROVIDER_MS) {
      reason = "syncso_provider_unknown_no_code_after_retries";
    } else if (!hasJob && !masterClipInFlight && ageMs > STALE_PREFLIGHT_MS) {
      reason = "watchdog_preflight_aborted";
    } else if (!hasJob && masterClipInFlight && ageMs > STALE_PREFLIGHT_MS) {
      console.log(
        `[lipsync-watchdog] preflight-skip scene=${d.id} ` +
        `reason=master_clip_in_flight age=${Math.round(ageMs / 1000)}s ` +
        `pred=${d.replicate_prediction_id}`,
      );
    } else if (hasJob && ageMs > STALE_PROVIDER_MS) {
      // v131.8 — Pass-level liveness. Previously we measured Provider-Timeout
      // gegen das Szenen-Alter (first_started_at). Bei 4-Sprecher-Szenen ist
      // Pass 4 erst nach ~10-12 Minuten überhaupt dispatcht — der alte Code
      // hat ihn nach <60s als "timeout" gekillt, obwohl er gesund lief.
      // Neue Regel: solange irgendein aktiver Pass jünger als STALE_PROVIDER_MS
      // ist, wartet der Watchdog. Nur wenn ALLE rendering-Passes älter als
      // STALE_PROVIDER_MS sind (oder gar keiner mehr lebt), schlagen wir zu.
      const passesForLiveness: any[] = Array.isArray(ds?.passes) ? ds.passes : [];
      const renderingPasses = passesForLiveness.filter(
        (p) => String(p?.status ?? "") === "rendering" && typeof p?.job_id === "string",
      );
      const youngestRenderingMs = renderingPasses.length === 0
        ? Infinity
        : Math.min(
            ...renderingPasses.map((p) => {
              const sa = typeof p?.started_at === "string" ? Date.parse(p.started_at) : NaN;
              return Number.isFinite(sa) ? (now - sa) : Infinity;
            }),
          );
      // v441 — nur ANGEWANDTE Callbacks unterdrücken die Eskalation.
      const polledThisTick = progressed.some((p) => p.scene_id === d.id);
      if (renderingPasses.length === 0) {
        // Kein lebender Pass mehr — alter Pfad ist okay, aber wir geben uns
        // dem v5-Fanout-Branch (unten) den Vortritt, der den dispatch_log
        // gegencheckt. Hier kein Timeout setzen.
      } else if (!polledThisTick && youngestRenderingMs > STALE_PROVIDER_MS) {
        reason = "watchdog_provider_timeout";
      } else if (renderingPasses.length > 0 && youngestRenderingMs <= STALE_PROVIDER_MS) {
        console.log(
          `[lipsync-watchdog] v131.8 pass-level wait scene=${d.id} ` +
          `youngest_rendering_age=${Math.round(youngestRenderingMs / 1000)}s ` +
          `rendering_passes=${renderingPasses.length} — skipping provider-timeout`,
        );
      }
    } else if (isV5Fanout && ageMs > 12 * 60_000) {
      const passes120: any[] = Array.isArray(ds?.passes) ? ds.passes : [];
      const liveRendering = passes120.some((p) => {
        if (String(p?.status ?? "") !== "rendering") return false;
        if (!p?.job_id) return false;
        const sa = typeof p?.started_at === "string" ? Date.parse(p.started_at) : NaN;
        return Number.isFinite(sa) && (Date.now() - sa) < 10 * 60_000;
      });
      if (!liveRendering) {
        try {
          const since = new Date(Date.now() - 5 * 60_000).toISOString();
          const { count } = await supabase
            .from("syncso_dispatch_log")
            .select("id", { count: "exact", head: true })
            .eq("scene_id", d.id)
            .eq("sync_status", "FAILED")
            .gte("created_at", since);
          if ((count ?? 0) >= 2) {
            reason = "v120_zombie_no_live_pass";
          }
        } catch { /* tolerate */ }
      }
    }
    if (!reason) return;

    // ── v131.7 — Auto-Retry on watchdog_provider_timeout (one shot) ──────
    // Sync.so returnt manchmal HTTP 201 + job_id, liefert dann aber 10 min
    // lang nichts (Webhook + Polling beide leer). Vor v131.7 hieß das
    // sofort terminal-fail + refund. v131.7: 1× automatischer Re-Dispatch
    // (Job cancellen, Slot freigeben, `lip_sync_status='pending'` +
    // `twoshot_stage='master_clip'` → useTwoShotAutoTrigger picks it up).
    // Erhöht die End-to-end-Erfolgsquote bei flaky Sync.so deutlich, ohne
    // dass der User den roten "Re-Render"-Button drücken muss.
    if (reason === "watchdog_provider_timeout") {
      const prevRetries = Number(ds?.watchdog_retries ?? 0);
      if (prevRetries < 1) {
        try {
          // v141 — Pre-cancel probe. BEFORE we cancel and reset any pass,
          // poll Sync.so for every rendering job. If it already COMPLETED,
          // forward to our webhook so the real output is preserved instead
          // of destroyed by a wrongful retry. This was the root cause of
          // the 2026-06-20 "stuck at 95% for 24 min" hang: pass 2 was
          // reset to pending while its provider job was already done.
          const passesProbe: any[] = Array.isArray(ds?.passes) ? ds.passes : [];
          let liveCompletedRecovered = false;
          if (syncApiKey) {
            for (const p of passesProbe) {
              if (String(p?.status ?? "") !== "rendering" || !p?.job_id) continue;
              const r = await pollAndForward({
                syncApiKey, jobId: String(p.job_id), sceneId: d.id, supabaseUrl, serviceKey,
                pipelineJobId: (p?.pipeline_job_id as string | null) ?? null,
              });
              // v441 — ein abgelehnter Apply ist keine Rettung.
              if (r.terminal && r.status === "COMPLETED" && r.applied !== false) {
                liveCompletedRecovered = true;
                polled.push({ scene_id: d.id, job_id: String(p.job_id), status: "COMPLETED" });
                await releaseInflightSyncJob(supabase, String(p.job_id)).catch(() => {});
              }
            }
          }
          if (liveCompletedRecovered) {
            console.log(
              `[lipsync-watchdog] v141 scene=${d.id} pre-cancel probe recovered completed job(s) — skip retry, let webhook drive`,
            );
            return; // webhook fan-out will progress the scene
          }

          // Best-effort: bestehenden Sync.so-Job cancellen, damit kein
          // Geist-Webhook später noch den frischen Run überschreibt.
          const liveJobs: string[] = [];
          if (typeof d.replicate_prediction_id === "string" && d.replicate_prediction_id.startsWith("sync:")) {
            liveJobs.push(d.replicate_prediction_id.slice("sync:".length));
          }
          const passes: any[] = Array.isArray(ds?.passes) ? ds.passes : [];
          for (const p of passes) if (p?.job_id) liveJobs.push(String(p.job_id));
          for (const jid of new Set(liveJobs)) {
            try {
              await fetch(`${SYNC_API_BASE}/generations/${jid}/cancel`, {
                method: "POST",
                headers: { "x-api-key": syncApiKey },
              });
              await releaseInflightSyncJob(supabase, jid).catch(() => {});
            } catch { /* tolerate */ }
          }

          // v131.8 — Pass-erhaltender Auto-Retry. Der alte v131.7-Code hat
          // `passes: []` gesetzt und damit fertige Sprecher verloren +
          // Forensik mit `pass_not_found` kaputt gemacht. Neu: nur die
          // tatsächlich hängenden rendering-Passes auf pending zurücksetzen,
          // erfolgreich abgeschlossene `done`-Passes bleiben unverändert.
          // v141 — Auch keine Passes mit bereits vorhandenem output_url
          // anfassen (auch wenn sie noch fälschlich "rendering" stehen).
          const passesNow: any[] = Array.isArray(ds?.passes) ? ds.passes : [];
          const passesPatched = passesNow.map((p: any, i: number) => {
            const st = String(p?.status ?? "");
            if (st === "done" || st === "done_suspect" || st === "failed" || st === "canceled_by_scene_failure") return p;
            if (typeof p?.output_url === "string" && p.output_url.length > 0) return p;
            if (st !== "rendering") return p;
            return {
              ...p,
              status: "pending",
              job_id: null,
              output_url: null,
              started_at: null,
              finished_at: null,
              watchdog_retry_attempted: true,
              watchdog_retry_at: new Date().toISOString(),
              error: `retrying_after_watchdog_provider_timeout`,
              _retry_idx: i,
            };
          });
          const hasStuckPass = passesPatched.some(
            (p: any, i: number) => p?.watchdog_retry_attempted && passesNow[i]?.status === "rendering",
          );
          // Wenn nichts mehr "rendering" war, gibt es nichts zu retryen — falle
          // auf den ursprünglichen Re-Dispatch-Pfad zurück (passes leer lassen).
          const newPasses = hasStuckPass ? passesPatched : passesNow;

          await supabase
            .from("composer_scenes")
            .update({
              lip_sync_status: "pending",
              twoshot_stage: hasStuckPass ? (d.twoshot_stage ?? "master_clip") : "master_clip",
              clip_error: `watchdog_auto_retry_${prevRetries + 1}_of_1`,
              dialog_shots: {
                ...(ds || {}),
                passes: newPasses,
                watchdog_retries: prevRetries + 1,
                watchdog_retry_at: new Date().toISOString(),
                recovery_dispatched_at: null,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", d.id);

          console.log(
            `[lipsync-watchdog] v131.8 auto-retry scene=${d.id} ` +
            `prev_retries=${prevRetries} mode=${hasStuckPass ? "per-pass" : "full-redispatch"} ` +
            `→ reset to pending`,
          );
          advanced.push({ scene_id: d.id, pass_idx: -2 });
          return; // skip failLipSync
        } catch (e) {
          console.warn(
            `[lipsync-watchdog] v131.7 auto-retry crash scene=${d.id}: ${(e as Error).message} — falling through to hard fail`,
          );
        }
      } else {
        console.log(
          `[lipsync-watchdog] v131.7 auto-retry budget exhausted scene=${d.id} ` +
          `(prev_retries=${prevRetries}) — proceeding with terminal failLipSync`,
        );
      }
    }

    const uid = await userIdForProject(supabase, d.project_id);
    const refundCredits = Number(d.dialog_shots?.cost_credits) || 0;
    await failLipSync({
      supabase,
      sceneId: d.id,
      userId: uid,
      reason,
      refundCredits,
      runId: (d.dialog_shots?.run_id ?? (d as any)?.active_run_id ?? null) as string | null,
      syncApiKey,
    });
    failed.push({ scene_id: d.id, reason });
    }, { ttlSeconds: 30, maxAttempts: 3 });
  }

  // ── V443 — re-measure `motion_unverified` passes EXACTLY ONCE ───────────
  // A pass reaches this state only when every bounded measurement attempt in
  // the webhook failed for infrastructure reasons. We re-measure the SAME
  // immutable provider output. Measurement only:
  //   motion            → success stays success
  //   noop              → existing proven-Noop terminalization (ssw:noop_fail)
  //   infra fails again → stays `motion_unverified`, NO provider job
  const remeasured: Array<{ scene_id: string; job_id: string; verdict: string }> = [];
  try {
    const sinceIso = new Date(now - 6 * 60 * 60_000).toISOString();
    const { data: unverifiedRows } = await supabase
      .from("syncso_dispatch_log")
      .select("id, scene_id, job_id, turn_idx, meta, created_at")
      .eq("sync_status", "MOTION_UNVERIFIED")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20);

    const candidates = (unverifiedRows ?? []) as any[];
    if (candidates.length > 0) {
      const { data: recheckRows } = await supabase
        .from("syncso_dispatch_log")
        .select("job_id, turn_idx")
        .eq("sync_status", "MOTION_RECHECKED")
        .gte("created_at", sinceIso)
        .limit(500);
      const alreadyRechecked = new Set(
        ((recheckRows ?? []) as any[]).map((r) => `${r.job_id}#${r.turn_idx}`),
      );

      for (const cand of candidates) {
        const key = `${cand.job_id}#${cand.turn_idx}`;
        if (alreadyRechecked.has(key)) continue;
        alreadyRechecked.add(key); // exactly-once, also within this tick
        const meta = (cand.meta ?? {}) as any;
        // ── V458 — structurally unresolved mouth ROI is NOT re-measurable ──
        // The geometry is static: re-running the identical measurement on the
        // identical pinned output would return the identical `unresolved`.
        // Book it once as recheck-skipped and never dispatch anything.
        const roiUnresolved = String(meta.failure_class ?? "") === "mouth_roi_unresolved" ||
          isMouthRoiUnresolved(meta.v456_roi_contract?.reason ?? null);
        if (roiUnresolved) {
          await logSyncDispatch(supabase, {
            scene_id: cand.scene_id,
            job_id: cand.job_id,
            engine: "sync-segments",
            turn_idx: cand.turn_idx,
            sync_status: "MOTION_RECHECKED",
            error_class: "motion_probe_recheck",
            error_message: String(meta.v456_roi_contract?.reason ?? "mouth_roi_unresolved").slice(0, 500),
            meta: {
              v458_recheck_skipped: true,
              recheck_skipped: "roi_unresolved_structural",
              recheck_verdict: MOTION_UNVERIFIED_STATE,
              pass_idx: cand.turn_idx,
              pipeline_job_id: meta.pipeline_job_id ?? null,
              provider_dispatch: false,
            },
          });
          console.log(
            `[lipsync-watchdog] v458_recheck_skipped scene=${cand.scene_id} job=${cand.job_id} ` +
              `pass=${cand.turn_idx} reason=roi_unresolved_structural provider_dispatch=false`,
          );
          remeasured.push({
            scene_id: cand.scene_id,
            job_id: cand.job_id,
            verdict: MOTION_UNVERIFIED_STATE,
          });
          continue;
        }
        const preclipUrl = String(meta.preclip_url ?? "");
        const providerOutputUrl = String(meta.provider_output_url ?? "");
        const durationSeconds = Number(meta.duration_sec ?? NaN);
        if (!preclipUrl || !providerOutputUrl || !Number.isFinite(durationSeconds)) {
          continue;
        }


        const measurement = await measureProviderMotionSync({
          preclipUrl,
          providerOutputUrl,
          durationSeconds,
          preclipGeometry: meta.preclip_geometry ?? null,
        });

        let verdict: string;
        let reason: string;
        if (
          measurement.measurement_status === "measured" &&
          measurement.preclip_metric && measurement.provider_metric
        ) {
          const probe = classifyMotionProbe({
            preclip: measurement.preclip_metric,
            provider: measurement.provider_metric,
          });
          verdict = probe.verdict;
          reason = probe.reason;
        } else {
          verdict = classifyMeasurementFailure(measurement.reason) === "probe_infra_error"
            ? MOTION_UNVERIFIED_STATE
            : "measured_ambiguous";
          reason = measurement.reason;
        }

        await logSyncDispatch(supabase, {
          scene_id: cand.scene_id,
          job_id: cand.job_id,
          engine: "sync-segments",
          turn_idx: cand.turn_idx,
          sync_status: "MOTION_RECHECKED",
          error_class: verdict === "noop" ? "sync_noop_unrecoverable" : "motion_probe_recheck",
          error_message: String(reason).slice(0, 500),
          meta: {
            v443_recheck: true,
            recheck_verdict: verdict,
            delta_mean: measurement.deltaMean ?? null,
            pass_idx: cand.turn_idx,
            pipeline_job_id: meta.pipeline_job_id ?? null,
            provider_output_url: providerOutputUrl,
            provider_dispatch: false,
          },
        });

        if (verdict === "noop" && meta.pipeline_job_id) {
          // Proven Noop — existing terminalization path, unchanged semantics.
          const { error: applyErr } = await supabase.rpc("composer_apply_sync_segment_result", {
            _pipeline_job_id: meta.pipeline_job_id,
            _external_job_id: cand.job_id,
            _write_id: "ssw:noop_fail",
            _provider_status: "COMPLETED",
            _output_url: null,
            _error_text: "motion_probe_noop_confirmed_by_recheck",
          });
          if (applyErr) {
            console.warn(
              `[lipsync-watchdog] v443_recheck_apply_failed scene=${cand.scene_id} job=${cand.job_id}: ${applyErr.message}`,
            );
            // V447 — der stille Fehlschlag der Terminalisierung war bisher nur
            // ein Log. Er wird jetzt als Telemetrie persistiert, damit ein
            // nicht terminalisierter Proven-Noop nachweisbar bleibt.
            await logSyncDispatch(supabase, {
              scene_id: cand.scene_id,
              job_id: cand.job_id,
              engine: "sync-segments",
              turn_idx: cand.turn_idx,
              sync_status: "MOTION_RECHECKED",
              error_class: "recheck_terminalization_failed",
              error_message: String(applyErr.message).slice(0, 500),
              meta: {
                v447_recheck_terminalization_failed: true,
                recheck_verdict: verdict,
                pipeline_job_id: meta.pipeline_job_id ?? null,
                provider_dispatch: false,
              },
            });
          }
        }

        console.log(
          `[lipsync-watchdog] v443_motion_recheck scene=${cand.scene_id} job=${cand.job_id} ` +
            `pass=${cand.turn_idx} verdict=${verdict} delta_mean=${measurement.deltaMean ?? "n/a"} ` +
            `provider_dispatch=false`,
        );
        remeasured.push({ scene_id: cand.scene_id, job_id: cand.job_id, verdict });
      }
    }
  } catch (e) {
    console.warn(`[lipsync-watchdog] v443_recheck_block_error: ${(e as Error).message}`);
  }

  console.log(
    `[lipsync-watchdog] scanned=${rows?.length ?? 0} polled=${polled.length} advanced=${advanced.length} failed=${failed.length} v443_remeasured=${remeasured.length}`,
  );
  return new Response(
    JSON.stringify({ ok: true, scanned: rows?.length ?? 0, polled, advanced, failed, remeasured }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
