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
import { getSyncApiKey, releaseInflightSyncJob } from "../_shared/syncso-preflight.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// TTLs (ms): a `running` scene with no measurable progress beyond this is dead.
const STALE_PROVIDER_MS = 10 * 60_000;   // Sync.so jobs in flight w/o update
const STALE_PREFLIGHT_MS = 4 * 60_000;   // running but never produced a provider job
const STALE_HARD_MS = 20 * 60_000;       // safety cap regardless of state
// Plan v71: `pending + master_clip + clip_url + audio_plan` with NO dispatch yet
// means compose-dialog-segments was never called (lost client invoke / 202 race).
// v94: 90s → 30s. Sync.so normal render is 25-45s; with the cron also tightened
// to 1min, lost-invoke recovery drops from ~3.5min → ~60s. Double-dispatch is
// safe — compose-dialog-segments' idempotency guard returns `already_running`.
const STALE_DISPATCH_RECOVERY_MS = 30_000;

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
 * advance, and compositor dispatch. Returns true when the job had a terminal
 * status (regardless of success/failure).
 */
async function pollAndForward(opts: {
  syncApiKey: string;
  jobId: string;
  sceneId: string;
  supabaseUrl: string;
  serviceKey: string;
}): Promise<{ terminal: boolean; status?: string }> {
  const { syncApiKey, jobId, sceneId, supabaseUrl, serviceKey } = opts;
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
    const sharedSecret = Deno.env.get("WEBHOOK_SHARED_SECRET") ?? "";
    const webhookUrl =
      `${supabaseUrl}/functions/v1/sync-so-webhook?scene_id=${sceneId}` +
      (sharedSecret ? `&token=${encodeURIComponent(sharedSecret)}` : "");
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.warn(`[lipsync-watchdog] forward webhook crash: ${(e as Error).message}`);
    }
    console.log(`[lipsync-watchdog] polled job=${jobId} status=${status} → forwarded to webhook scene=${sceneId}`);
    return { terminal: true, status };
  } catch (e) {
    console.warn(`[lipsync-watchdog] poll crash job=${jobId}: ${(e as Error).message}`);
    return { terminal: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
      "id, project_id, lip_sync_status, lip_sync_applied_at, twoshot_stage, clip_url, replicate_prediction_id, dialog_shots, audio_plan, updated_at",
    )
    .or(
      "lip_sync_status.in.(running,audio_muxing)," +
      "and(lip_sync_status.eq.pending,twoshot_stage.in.(circuit_open,deferred,master_clip))," +
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
  const advanced: Array<{ scene_id: string; pass_idx: number }> = [];

  for (const d of (rows ?? []) as SceneRow[]) {
    const ds: any = d.dialog_shots ?? {};
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
      continue;
    }

    // ── (1) v25 Polling fallback: forward terminal Sync.so jobs we missed ──
    if (isV5Fanout && syncApiKey) {
      const renderingPasses = (ds.passes as any[])
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p?.status === "rendering" && typeof p?.job_id === "string");
      for (const { p, i } of renderingPasses) {
        const r = await pollAndForward({
          syncApiKey, jobId: p.job_id, sceneId: d.id, supabaseUrl, serviceKey,
        });
        if (r.terminal) {
          polled.push({ scene_id: d.id, job_id: p.job_id, status: r.status ?? "?" });
          await releaseInflightSyncJob(supabase, p.job_id);
        }
        void i;
      }
    }

    // ── (2) Dispatch deferred-pending fan-out passes ─────────────────────
    // Skip dispatching while we're parked on circuit_open — re-triggering
    // compose-dialog-segments would just hit the circuit again and reset
    // updated_at, masking the real TTL.
    if (isV5Fanout && d.twoshot_stage !== "circuit_open") {
      const pendingIdxs = (ds.passes as any[])
        .map((p, i) => ((p?.status === "pending" || !p?.job_id) ? i : -1))
        .filter((i) => i >= 0);
      if (pendingIdxs.length > 0) {
        const next = pendingIdxs[0];
        try {
          await fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ scene_id: d.id, advance: true, pass_idx: next }),
          });
          advanced.push({ scene_id: d.id, pass_idx: next });
        } catch (e) {
          console.warn(`[lipsync-watchdog] advance dispatch crash scene=${d.id}: ${(e as Error).message}`);
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
        const invokeResp = await fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ scene_id: d.id, auto: true, recovery: true }),
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
      continue; // give it a tick before considering failure
    }

    // ── (3) Stale-failure (last resort, only past hard TTL or true preflight) ─
    if (ageMs < STALE_PREFLIGHT_MS) continue;
    const hasJob = await hasRecordedProviderJob(supabase, d);

    let reason: string | null = null;
    if (ageMs > STALE_HARD_MS) {
      reason = "watchdog_hard_timeout";
    } else if (d.twoshot_stage === "circuit_open" && ageMs > STALE_PROVIDER_MS) {
      // v32: a scene parked on circuit_open past the 10-min provider TTL is
      // never going to recover — the Sync.so 3-speaker plate was rejected
      // without an error_code. Fail terminal so the user sees a real reason.
      reason = "syncso_provider_unknown_no_code_after_retries";
    } else if (!hasJob && ageMs > STALE_PREFLIGHT_MS) {
      reason = "watchdog_preflight_aborted";
    } else if (hasJob && ageMs > STALE_PROVIDER_MS) {
      const polledThisTick = polled.some((p) => p.scene_id === d.id);
      if (!polledThisTick) reason = "watchdog_provider_timeout";
    } else if (isV5Fanout && ageMs > 12 * 60_000) {
      // v120 — Zombie guard. Scene running >12min: if NO pass is currently
      // `rendering` with a live job_id (i.e. only `retrying`/`pending` ghosts
      // or exhausted `failed`), AND there are recent FAILED dispatch_log
      // rows in the last 5min, terminate with refund.
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
    if (!reason) continue;

    const uid = await userIdForProject(supabase, d.project_id);
    const refundCredits = Number(d.dialog_shots?.cost_credits) || 0;
    await failLipSync({
      supabase,
      sceneId: d.id,
      userId: uid,
      reason,
      refundCredits,
      syncApiKey,
    });
    failed.push({ scene_id: d.id, reason });
  }

  console.log(
    `[lipsync-watchdog] scanned=${rows?.length ?? 0} polled=${polled.length} advanced=${advanced.length} failed=${failed.length}`,
  );
  return new Response(
    JSON.stringify({ ok: true, scanned: rows?.length ?? 0, polled, advanced, failed }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
