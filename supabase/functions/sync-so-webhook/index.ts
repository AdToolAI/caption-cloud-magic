/**
 * sync-so-webhook — Stage 5 B.1
 *
 * Receives terminal-status webhooks from Sync.so for per-turn lipsync jobs
 * dispatched by `poll-dialog-shots` (v9 Artlist pipeline). When a webhook
 * arrives we immediately patch the matching shot's status/output_url in
 * `composer_scenes.dialog_shots` and fire-and-forget `poll-dialog-shots`
 * for that scene so the next pending turn (or the Lambda stitch) starts
 * within ~1s instead of waiting up to 60s for the next pg_cron tick.
 *
 * Auth: shared-secret `?token=...` (WEBHOOK_SHARED_SECRET) — same scheme
 * used for the Remotion webhook. The full webhook URL is constructed by
 * `poll-dialog-shots` via `appendWebhookToken`.
 *
 * Failure mode: if anything goes wrong we still return 200 so Sync.so does
 * NOT retry storm us. The 60s pg_cron poller is the safety net.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { verifyWebhookRequest } from "../_shared/webhook-auth.ts";
import { withDialogLock } from "../_shared/dialog-lock.ts";
import {
  releaseInflightSyncJob,
  classifySyncError,
  classifySyncErrorCode,
  explainSyncErrorCode,
  fetchSyncJobError,
  isTransientSyncError,
  recordCircuitFailure,
  recordCircuitSuccess,
  logSyncDispatch,
} from "../_shared/syncso-preflight.ts";
import { probeMp4Dims } from "../_shared/twoshot-face-map.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

function ok(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dispatchModeForShot(shot: any): "auto" | "coords" {
  return shot?.target_coords && (shot?.deterministic_coords === true || !!shot?.force_coords)
    ? "coords"
    : "auto";
}

const ASSUMED_MASTER_FPS = 24;
// v15 Race-Fix: align webhook retry budget with poll-dialog-shots
// (MAX_SHOT_RETRIES = 4 there). Previously the webhook hard-terminal-failed
// a shot after a single Sync.so error, which prematurely killed scenes that
// the poller's differentiated retry matrix (frame, temp, preclip↔master)
// would have recovered.
const MAX_SHOT_RETRIES = 4;
const RETRY_TEMPERATURES = [0.5, 0.35, 0.7, 0.4];
// v30 — Added "coords-pro-box" (bounding-box targeting) as a safer fallback
// for 3+ speaker plates BEFORE jumping to auto-* (face-swap risk).
// v37 — Added "sync3-coords" as the Sync.so-recommended fallback for
// difficult / occluded / multi-speaker plates (sync-3 has built-in
// obstruction detection and can open closed lips; lipsync-2-pro cannot).
// v61 — Added "coords-pro-lp2pro": forces lipsync-2-pro on the proven
// coords-pro point-ASD shape. This is the final multi-speaker fallback
// AFTER sync-3 attempts exhaust (sync-3 is the new default for N>=2, but
// we keep the historically-stable lipsync-2-pro chained path as last
// resort instead of refunding).
// v82 (Phase 2.1) — `bbox-url-pro` (Sync.so `bounding_boxes_url`) is now
// PRIMARY for multi-speaker dialog. On failure we step down to the
// inline-bbox `coords-pro-box`, then the rest of the legacy ladder.
const V5_RETRY_VARIANTS = ["bbox-url-pro", "coords-pro", "coords-pro-box", "sync3-coords", "coords-pro-lp2pro", "auto-pro", "auto-standard"] as const;

function nextV5RetryVariant(current: unknown) {
  const idx = V5_RETRY_VARIANTS.indexOf(current as any);
  return V5_RETRY_VARIANTS[Math.min(idx < 0 ? 1 : idx + 1, V5_RETRY_VARIANTS.length - 1)];
}

function isMultiSpeakerScene(shots: any[]): boolean {
  return new Set(shots.map((s) => s?.speaker_idx)).size >= 2;
}

function pickRetryFrame(segFrames: number, attempt: number): number {
  const positions = [0.5, 0.25, 0.75, 0.15];
  const pos = positions[Math.min(attempt, positions.length - 1)];
  return Math.min(segFrames - 1, Math.max(0, Math.floor(segFrames * pos)));
}

function prepareRetryFromWebhook(shot: any, reason: string, allShots: any[]): boolean {
  if ((shot?.retry_count ?? 0) >= MAX_SHOT_RETRIES) return false;
  const failedMode = dispatchModeForShot(shot);
  shot.retry_count = (shot.retry_count ?? 0) + 1;
  shot.status = "pending";
  shot.sync_job_id = undefined;
  shot.output_url = undefined;
  shot.started_at = undefined;
  shot.completed_at = undefined;
  shot.error = `retrying_after_${reason}`.slice(0, 300);

  const attempt = shot.retry_count;

  if (isMultiSpeakerScene(allShots) && shot.target_coords) {
    shot.force_coords = true;
    shot.deterministic_coords = true;
    // Sync.so v2 + `segments_secs`: `frame_number` is SEGMENT-RELATIVE
    // (0 = first frame of the trimmed segment). Compute relative to the
    // render_window (matches poll-dialog-shots).
    const win = (Array.isArray(shot.render_window) && shot.render_window.length === 2)
      ? shot.render_window
      : (Array.isArray(shot.window) ? shot.window : [0, 0]);
    const [s, e] = [Number(win[0]) || 0, Number(win[1]) || 0];
    const segFrames = Math.max(1, Math.floor((e - s) * ASSUMED_MASTER_FPS));
    shot.frame_number_override = pickRetryFrame(segFrames, attempt);
    shot.temperature = RETRY_TEMPERATURES[attempt % RETRY_TEMPERATURES.length];
    console.warn(
      `[sync-so-webhook] turn=${shot.idx ?? "?"} ${reason} → retry ${attempt}/${MAX_SHOT_RETRIES} coords-locked segRelFrame=${shot.frame_number_override}/${segFrames} temp=${shot.temperature}`,
    );
  } else if (failedMode === "coords") {
    shot.force_coords = false;
    shot.deterministic_coords = false;
    console.warn(
      `[sync-so-webhook] turn=${shot.idx ?? "?"} ${reason} → retry ${attempt} auto fallback`,
    );
  } else if (shot.target_coords) {
    shot.force_coords = true;
    console.warn(
      `[sync-so-webhook] turn=${shot.idx ?? "?"} ${reason} → retry ${attempt} coords fallback`,
    );
  }
  return true;
}

function triggerV5Advance(supabaseUrl: string, serviceKey: string, sceneId: string, passIdx: number, totalPasses: number) {
  fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ scene_id: sceneId, advance: true, pass_idx: passIdx }),
  }).catch(() => {});
  console.log(`[sync-so-webhook] v5 scene=${sceneId} advancing pending pass ${passIdx + 1}/${totalPasses}`);
}

async function headAsset(url: string | null | undefined): Promise<{ bytes: number | null; contentType: string | null; etag: string | null } | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const len = Number(r.headers.get("content-length") ?? NaN);
    return {
      bytes: Number.isFinite(len) ? len : null,
      contentType: r.headers.get("content-type"),
      etag: r.headers.get("etag"),
    };
  } catch {
    return null;
  }
}

function terminalV5Counts(passes: any[]) {
  const doneCount = passes.filter((p: any) => p?.status === "done").length;
  const failedCount = passes.filter((p: any) => ["failed", "canceled_by_scene_failure"].includes(String(p?.status ?? ""))).length;
  return { doneCount, failedCount, allTerminal: doneCount + failedCount >= passes.length };
}




serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockResponse({ corsHeaders, kind: "video" });

  if (req.method !== "POST") return ok({ ok: true, skipped: "non_post" });

  const unauth = verifyWebhookRequest(req);
  if (unauth) return unauth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return ok({ ok: true, skipped: "no_json" });
  }

  // Sync.so payload shape varies; extract what we need defensively.
  const jobId: string | undefined =
    payload?.id ?? payload?.job_id ?? payload?.data?.id;
  const status: string = String(payload?.status ?? payload?.data?.status ?? "")
    .toUpperCase();
  const outputUrl: string | undefined =
    payload?.outputUrl ??
    payload?.output_url ??
    payload?.data?.outputUrl ??
    payload?.data?.output_url;
  // Sync.so terminal webhooks expose TWO official fields per the spec
  // (https://sync.so/docs/api-reference/api/webhooks-payload-reference/...):
  //   • `error`       — human message
  //   • `error_code`  — machine enum (e.g. generation_pipeline_failed)
  // Previously we only read `error_message` (which doesn't exist in the spec)
  // and fell back to the useless "An unknown error occurred" string. Now we
  // read both official fields, walk every legacy/nested variant as a safety
  // net, and — if the payload is STILL empty — issue a GET against
  // /v2/generate/{job_id} to fetch the canonical fields from Sync.so.
  const extractErrorFields = (p: any): { message?: string; code?: string } => {
    if (!p) return {};
    const msgCandidates = [
      p.error,                  // official
      p?.data?.error,           // official (nested)
      p.errorMessage,
      p.error_message,
      p.message,
      p.failureReason,
      p.failure_reason,
      p?.error?.message,
      p?.error?.details,
      p?.error?.detail,
      p?.error?.reason,
      p?.data?.errorMessage,
      p?.data?.error_message,
      p?.data?.failureReason,
      p?.data?.error?.message,
      p?.data?.error?.details,
      p?.data?.error?.detail,
      p?.data?.error?.reason,
    ].filter((x) => typeof x === "string" && x.trim().length > 0);
    const codeCandidates = [
      p.error_code,             // official
      p?.data?.error_code,      // official (nested)
      p.errorCode,
      p?.error?.code,
      p?.data?.error?.code,
    ].filter((x) => typeof x === "string" && x.trim().length > 0);
    const message = msgCandidates.find(
      (s) => !/^an unknown error occurred\.?$/i.test(String(s).trim()),
    ) ?? msgCandidates[0];
    return {
      message: typeof message === "string" ? message : undefined,
      code: typeof codeCandidates[0] === "string" ? codeCandidates[0] : undefined,
    };
  };
  let { message: errorMsg, code: errorCode } = extractErrorFields(payload);

  // GET-fallback (v28): terminal FAILED with NO `error_code` AND either no
  // message OR only the generic "An unknown error occurred." string → ask
  // Sync.so directly via `GET /v2/generate/{job_id}`. Previously we only
  // fell back when both fields were missing, but the live failure path
  // returns the generic message *without* a code — exactly the case where
  // GET-fallback was supposed to help.
  const isGenericMsg = (m?: string | null) =>
    !m || /^an unknown error occurred\.?$/i.test(String(m).trim());
  if (
    ["FAILED", "REJECTED", "CANCELED"].includes(status) &&
    !errorCode &&
    isGenericMsg(errorMsg) &&
    jobId
  ) {
    const fetched = await fetchSyncJobError(jobId);
    if (fetched) {
      if (fetched.error && !isGenericMsg(fetched.error)) {
        errorMsg = fetched.error;
      }
      if (fetched.error_code) errorCode = fetched.error_code;
      console.log(`[sync-so-webhook] GET-fallback job=${jobId} code=${errorCode ?? "null"} msg=${(errorMsg ?? "").slice(0, 200)}`);
    }
  }


  if (status !== "COMPLETED") {
    // Log the full payload once so we can post-mortem the "unknown error"
    // class without re-instrumenting the webhook.
    console.log(
      `[sync-so-webhook] terminal=${status} job=${payload?.id ?? payload?.job_id} code=${errorCode ?? "null"} extractedErr=${JSON.stringify(errorMsg ?? null)} fullPayload=${JSON.stringify(payload).slice(0, 1500)}`,
    );
  }

  if (!jobId) {
    console.warn("[sync-so-webhook] no job id in payload");
    return ok({ ok: true, skipped: "no_job_id" });
  }
  if (!["COMPLETED", "FAILED", "REJECTED", "CANCELED"].includes(status)) {
    // Intermediate event — nothing to persist, just ack.
    return ok({ ok: true, skipped: `non_terminal:${status}` });
  }
  // E.3: release inflight slot for any terminal status (best-effort)
  await releaseInflightSyncJob(supabase, jobId);

  // Stage F.3 — feed the provider circuit breaker on terminal status.
  // v30: Do NOT tick the global breaker on `provider_unknown_error` — that
  // class is opaque and routinely triggered by single problematic multi-speaker
  // plates (Sync.so refuses certain coords-pro jobs without an error_code).
  // Counting these globally caused a single bad 3-speaker scene to slam the
  // breaker OPEN and block every Sync.so dispatch (including its own
  // bbox/repair retries) for 30 min.
  if (status === "COMPLETED") {
    await recordCircuitSuccess(supabase, "sync.so");
  } else {
    const cls = classifySyncError((errorMsg ?? "").toString());
    if (cls !== "provider_unknown_error") {
      await recordCircuitFailure(supabase, "sync.so", cls);
    } else {
      console.log(`[sync-so-webhook] skip circuit-breaker tick (class=provider_unknown_error, scoped per-scene)`);
    }
  }


  // Locate the scene that owns this sync_job_id. Prefer the scene_id query
  // hint if poll-dialog-shots embedded it in the webhook URL.
  const url = new URL(req.url);
  const sceneHint = url.searchParams.get("scene_id");

  let sceneId: string | null = null;
  let scene: any = null;

  if (sceneHint) {
    const { data } = await supabase
      .from("composer_scenes")
      .select("id, dialog_shots, lip_sync_applied_at, lip_sync_status")
      .eq("id", sceneHint)
      .maybeSingle();
    if (data) {
      sceneId = data.id;
      scene = data;
    }
  }

  if (!scene) {
    // Fallback: scan in-flight scenes for the job id. Bounded scan, low volume.
    // v25: a fan-out scene tracks job ids in `dialog_shots.passes[].job_id`,
    // not only `shots[]` (v4) or the top-level `sync_job_id` (v5 single-call).
    // We must check ALL three so late/parallel pass webhooks find their scene.
    const { data: rows } = await supabase
      .from("composer_scenes")
      .select("id, dialog_shots, lip_sync_applied_at, lip_sync_status")
      .in("lip_sync_status", ["running", "stitching", "audio_muxing"])
      .limit(200);
    for (const r of rows ?? []) {
      const ds = (r as any)?.dialog_shots ?? {};
      const shots = Array.isArray(ds.shots) ? ds.shots : [];
      const passes = Array.isArray(ds.passes) ? ds.passes : [];
      const hit =
        shots.some((s: any) => s?.sync_job_id === jobId) ||
        passes.some((p: any) => p?.job_id === jobId) ||
        ds?.sync_job_id === jobId;
      if (hit) {
        sceneId = r.id;
        scene = r;
        break;
      }
    }
  }

  if (!scene || !sceneId) {
    console.warn(`[sync-so-webhook] no scene matched job ${jobId}`);
    return ok({ ok: true, skipped: "no_scene_match", job_id: jobId });
  }

  if (scene.lip_sync_applied_at) {
    return ok({ ok: true, skipped: "already_applied" });
  }
  // v18 Cancel-Guard: ignore late webhooks for user-cancelled scenes.
  if (
    (scene as any).lip_sync_status === "canceled" ||
    (scene.dialog_shots as any)?.status === "canceled"
  ) {
    return ok({ ok: true, skipped: "canceled", scene_id: sceneId });
  }

  // v129.4a — Late-webhook guard for already-terminal scenes.
  // The webhook is the single source of truth for scene terminalisation
  // (Watchdog defers to it). A FAILED/COMPLETED arriving after the scene
  // is already failed must not flip it to done (partial output) or replay
  // refund logic. Ack 200 so Sync.so stops retrying, no state mutation.
  //
  // v131.8 — Ausnahme: wenn die Szene NUR wegen unseres eigenen
  // `watchdog_provider_timeout` als failed markiert wurde UND Sync.so jetzt
  // doch `COMPLETED` für einen Pass liefert, der in `dialog_shots.passes[]`
  // bekannt ist, dürfen wir die Szene aus failed zurückholen. Sonst
  // verlieren wir gesunde Provider-Outputs durch unsere eigene zu strenge
  // Liveness-Heuristik. Echte Sync.so-Failures bleiben terminal.
  const sceneFailedSelfInflicted =
    ((scene as any).lip_sync_status === "failed" ||
      (scene.dialog_shots as any)?.status === "failed") &&
    typeof (scene as any).clip_error === "string" &&
    /^watchdog_(provider_timeout|auto_retry_|hard_timeout)/.test((scene as any).clip_error ?? "");
  const dsForRecover: any = scene.dialog_shots ?? {};
  const passesForRecover: any[] = Array.isArray(dsForRecover?.passes) ? dsForRecover.passes : [];
  const jobKnown = passesForRecover.some((p: any) => p?.job_id === jobId) ||
    dsForRecover?.sync_job_id === jobId;

  if (
    ((scene as any).lip_sync_status === "failed" ||
      (scene.dialog_shots as any)?.status === "failed")
  ) {
    if (status === "COMPLETED" && outputUrl && sceneFailedSelfInflicted && jobKnown) {
      console.log(
        `[sync-so-webhook] v131.8 recover_from_self_inflicted_fail scene=${sceneId} job=${jobId} ` +
        `prev_clip_error=${(scene as any).clip_error} — resetting status to running and continuing pass merge`,
      );
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "running",
          twoshot_stage: dsForRecover?.engine === "sync-segments" ? "syncso_fanout_recovering" : "running",
          clip_error: null,
          dialog_shots: { ...dsForRecover, status: "rendering", recovered_from_watchdog_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      (scene as any).lip_sync_status = "running";
      (scene.dialog_shots as any).status = "rendering";
      // fall through into the normal v5 success branch below
    } else {
      console.log(
        `[sync-so-webhook] v129.4a ignored_due_scene_failed scene=${sceneId} job=${jobId} status=${status}`,
      );
      return ok({ ok: true, skipped: "ignored_due_scene_failed", scene_id: sceneId, job_id: jobId });
    }
  }

  const state = scene.dialog_shots ?? null;
  if (!state) {
    return ok({ ok: true, skipped: "no_state" });
  }

  const nowIso = new Date().toISOString();

  // ── v80: legacy v41-v56 single-call segments[] branch removed ─────────
  // The single-call `sync-3 + segments[]` dispatcher in compose-dialog-
  // segments was deleted in v79 (no production code ever set force_v56).
  // Late webhooks for historical `version∈{41..52,55,56}` rows fall
  // through to the legacy_v4_ignored short-circuit at the end of this
  // function (200 OK, no state mutation). Watchdog already refunded
  // historical rows per v70.


  // ── v5: Sync.so Segments (1-call pipeline) ────────────────────────────
  // No per-turn shots; the webhook output IS the final clip.
  // v128 Phase B2 — wrap the entire v5 read-modify-write block in
  // `withDialogLock(scene_id)`. Previously the webhook patched
  // `composer_scenes.dialog_shots` without holding the per-scene lock, so a
  // poller / compose-dialog-segments / sibling-pass webhook running in the
  // same ~ms window could observe a stale snapshot and either skip a
  // pending-pass kick OR overwrite a sibling's job_id. The lock serializes
  // every mutation on dialog_shots.passes[]; on contention we proceed
  // without it (poller reconciliation is the safety net) so Sync.so never
  // sees a 5xx and starts retrying.
  if (state.version === 5 && state.engine === "sync-segments") {
    const { result: __v5Result } = await withDialogLock(
      supabase,
      sceneId,
      "sync-so-webhook",
      async () => {
    // v25 Fan-Out: match the job_id against passes[].job_id (preferred) OR
    // the legacy top-level state.sync_job_id (single-pass scenes). Previously
    // we required state.sync_job_id === jobId which dropped EVERY pass
    // webhook except the most recently dispatched pass — causing scenes to
    // hang indefinitely with only the last pass marked done.
    const passesPre = Array.isArray((state as any).passes) ? [...(state as any).passes] : [];
    let matchedIdx = passesPre.findIndex((p: any) => p?.job_id === jobId);
    const isLegacySingle = matchedIdx < 0 && state.sync_job_id === jobId;
    if (matchedIdx < 0 && !isLegacySingle) {
      // v141 — Reattach late webhooks. Before treating this as an orphan,
      // look the job up in `syncso_dispatch_log` to find the original
      // pass_idx. After a watchdog auto-retry the pass's job_id is wiped
      // from passes[], but the original Sync.so job can still complete
      // and call back. If the corresponding pass is still pending and
      // has no output_url, we adopt this webhook's result instead of
      // throwing it away — which used to strand the scene at 95% forever.
      try {
        const { data: logRow } = await supabase
          .from("syncso_dispatch_log")
          .select("meta")
          .eq("scene_id", sceneId)
          .eq("job_id", jobId)
          .eq("sync_status", "DISPATCHED")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const loggedPassIdx = Number((logRow as any)?.meta?.pass_idx);
        if (
          Number.isFinite(loggedPassIdx) &&
          loggedPassIdx >= 0 &&
          loggedPassIdx < passesPre.length
        ) {
          const target = passesPre[loggedPassIdx];
          const targetStatus = String(target?.status ?? "");
          const targetHasOutput =
            typeof target?.output_url === "string" && target.output_url.length > 0;
          if (!targetHasOutput && (targetStatus === "pending" || targetStatus === "rendering" || targetStatus === "retrying" || targetStatus === "failed")) {
            console.log(
              `[sync-so-webhook] v141 scene=${sceneId} job=${jobId} REATTACH late webhook → pass_idx=${loggedPassIdx} (prev status=${targetStatus})`,
            );
            passesPre[loggedPassIdx] = { ...target, job_id: jobId, status: targetStatus === "pending" ? "rendering" : targetStatus };
            (state as any).passes = passesPre;
            matchedIdx = loggedPassIdx;
          }
        }
      } catch (e) {
        console.warn(`[sync-so-webhook] v141 reattach lookup crash: ${(e as Error).message}`);
      }
    }
    if (matchedIdx < 0 && !isLegacySingle) {
      console.warn(`[sync-so-webhook] v5 scene=${sceneId} job=${jobId} ORPHAN (not in passes[] count=${passesPre.length}) — releasing inflight slot + best-effort provider cancel`);
      // v33: clean up the orphan so we don't leak a Sync.so concurrency slot
      // and don't keep paying for a generation whose state we no longer track.
      try { await releaseInflightSyncJob(supabase, jobId); } catch { /* ignore */ }
      const apiKey = Deno.env.get("SYNC_API_KEY") ?? Deno.env.get("SYNCSO_API_KEY") ?? "";
      if (apiKey && status !== "COMPLETED") {
        fetch(`https://api.sync.so/v2/generations/${encodeURIComponent(jobId)}`, {
          method: "DELETE",
          headers: { "x-api-key": apiKey },
        }).catch(() => { /* best-effort */ });
      }
      return ok({ ok: true, skipped: "v5_job_orphan_cleaned", job_id: jobId });
    }

    if (status === "COMPLETED" && outputUrl) {
      // ── v25 Fan-Out: passes run in parallel, all against the ORIGINAL
      //    plate. Webhook simply marks THIS pass done, re-hosts its output
      //    (so the compositor has a stable URL), and dispatches the final
      //    compositor only when EVERY pass is done. No chained next-pass
      //    dispatch (compose-dialog-segments fans them out itself).
      const passes = passesPre;
      const totalPasses = Number((state as any).total_passes ?? passes.length ?? 1);
      const currentPass = matchedIdx >= 0 ? matchedIdx : Number((state as any).current_pass ?? 0);

      // Re-host this pass's output to ai-videos for a stable, redirect-free URL.
      let rehostedUrl: string | null = null;
      try {
        const { data: row } = await supabase
          .from("composer_scenes")
          .select("project_id")
          .eq("id", sceneId)
          .single();
        const { data: proj } = await supabase
          .from("composer_projects")
          .select("user_id")
          .eq("id", (row as any)?.project_id)
          .single();
        const uid = (proj as any)?.user_id;
        if (uid) {
          const dl = await fetch(outputUrl, { signal: AbortSignal.timeout(60_000) });
          if (dl.ok) {
            const bytes = new Uint8Array(await dl.arrayBuffer());
            const objectPath = `composer/${uid}/${sceneId}-lipsync-pass-${currentPass + 1}.mp4`;
            const up = await supabase.storage.from("ai-videos").upload(
              objectPath, bytes, { contentType: "video/mp4", upsert: true },
            );
            if (!up.error) {
              const { data: pub } = supabase.storage.from("ai-videos").getPublicUrl(objectPath);
              if (pub?.publicUrl) rehostedUrl = pub.publicUrl;
            }
          }
        }
      } catch (err) {
        console.warn(`[sync-so-webhook] v25 scene=${sceneId} pass ${currentPass + 1} re-host: ${(err as Error).message}`);
      }

      // v29: Re-read the latest passes[] from the DB and merge ONLY our
      // pass's done-patch so concurrent COMPLETED/FAILED webhooks for sibling
      // passes don't clobber each other's job_ids/status.
      const { data: freshDoneRow } = await supabase
        .from("composer_scenes")
        .select("dialog_shots")
        .eq("id", sceneId)
        .maybeSingle();
      const freshDoneState: any = (freshDoneRow as any)?.dialog_shots ?? state;
      const freshDonePasses: any[] = Array.isArray(freshDoneState?.passes)
        ? freshDoneState.passes.map((p: any) => ({ ...p }))
        : passes;
      const passBeforeDone = freshDonePasses[currentPass] ?? null;
      const inputPreclipUrl = String(passBeforeDone?.preclip_url ?? passBeforeDone?._v105_probe?.payload_video_url ?? "");
      const [inputHead, outputHead, inputDims, outputDims] = await Promise.all([
        headAsset(inputPreclipUrl),
        headAsset(rehostedUrl ?? outputUrl),
        inputPreclipUrl ? probeMp4Dims(inputPreclipUrl).catch(() => null) : Promise.resolve(null),
        probeMp4Dims(rehostedUrl ?? outputUrl).catch(() => null),
      ]);
      const minOutputAxis = Math.min(Number(outputDims?.width ?? 0), Number(outputDims?.height ?? 0));
      const expectedPreclipAxis = Number(passBeforeDone?.preclip_crop?.outputSize ?? 0);
      const syncOutputUnchanged = !!(
        inputHead && outputHead &&
        ((inputHead.etag && outputHead.etag && inputHead.etag === outputHead.etag) ||
          (inputHead.bytes != null && outputHead.bytes != null && inputHead.bytes === outputHead.bytes))
      );
      const syncOutputResolutionRegression = expectedPreclipAxis >= 720 && minOutputAxis > 0 && minOutputAxis < 720;
      // v150 — `reencodedPassthroughSuspect` (sizeRatio 0.65–1.35) lieferte
      // strukturell False-Positives für korrekt lipgesynchte Passes mit
      // wenig Mouth-Movement: Sync.so verändert nur ~10–25% der Frames,
      // Output-Bytes liegen dadurch erwartet bei 70–90% der Input-Bytes.
      // Die Heuristik flaggte das als NOOP, die v134-Ladder dispatch'te
      // 2 weitere identisch-strukturierte Retries (die ebenfalls "0.84"
      // produzierten), und HARD-FAIL'te schließlich einen erfolgreichen
      // Pass (Beispiel: Szene 827ed500 / Matthew Dusatko, 2026-06-20).
      //
      // Wir behalten die Berechnung als reines Forensik-Log, aber sie
      // entscheidet NICHT mehr über `noopSuspect`. Echte NOOPs werden
      // weiterhin deterministisch erkannt:
      //   - `syncOutputUnchanged`         → etag/bytes EXAKT identisch
      //   - `syncOutputResolutionRegression` → min-axis <720 bei ≥720 erwartet
      // Beide sind harte Signale ohne False-Positive-Risiko.
      const inBytes = Number(inputHead?.bytes ?? 0);
      const outBytes = Number(outputHead?.bytes ?? 0);
      const sizeRatio = inBytes > 0 && outBytes > 0 ? outBytes / inBytes : 0;
      const reencodedPassthroughSuspect_DEPRECATED = !syncOutputUnchanged &&
        sizeRatio >= 0.65 && sizeRatio <= 1.35;
      const reencodedPassthroughSuspect = false; // v150: disabled, see comment above
      const noopSuspect = syncOutputUnchanged || syncOutputResolutionRegression;
      // v150 — Diagnostik-Log auch wenn nur die alte (jetzt deaktivierte)
      // bytes-Heuristik anschlagen würde. So sehen wir in den Logs, ob die
      // alte v128 noch täglich False-Positives produziert hätte — ohne dass
      // sie noch die Ladder triggert.
      if (reencodedPassthroughSuspect_DEPRECATED && !noopSuspect) {
        console.log(
          `[sync-so-webhook] v150_bytes_heuristic_suppressed scene=${sceneId} pass=${currentPass} sizeRatio=${sizeRatio.toFixed(2)} — alte v128-Heuristik hätte fälschlich NOOP markiert, jetzt unterdrückt.`,
        );
      }
      if (noopSuspect) {
        const noopReason = syncOutputResolutionRegression
          ? "sync_output_resolution_regression"
          : "sync_output_unchanged";
        await logSyncDispatch(supabase, {
          scene_id: sceneId, job_id: jobId, engine: "sync-segments",
          sync_status: "COMPLETED_NOOP_SUSPECT",
          error_class: "sync_completed_noop",
          meta: {
            v150_terminal: true,
            pass_idx: currentPass,
            attempt_id: passBeforeDone?.attempt_id ?? null,
            model: passBeforeDone?.retry_variant ?? null,
            variant: passBeforeDone?.retry_variant ?? null,
            retry_variant: passBeforeDone?.retry_variant ?? null,
            dispatch_source: "webhook",
            inputHead, outputHead, inputDims, outputDims,
            syncOutputUnchanged, syncOutputResolutionRegression,
            reencodedPassthroughSuspect, sizeRatio,
            reason: noopReason,
          },
        });
        console.warn(
          `[sync-so-webhook] v150 scene=${sceneId} pass=${currentPass} NOOP-suspect (${noopReason}, sizeRatio=${sizeRatio.toFixed(2)}) → PASS_DONE_SUSPECT (no auto-retry, awaiting user retry)`,
        );
        // Fall through to mark this pass `done` with `sync_noop_suspect: true`
        // (patched in the freshDonePasses update below).
      }

      // v134 — Deterministic NOOP escalation ladder (sync-3 only, per
      // v129.29 directive). Replaces v129.26's single-shot escalation
      // to `coords-pro` (which dispatched IDENTICAL input and produced
      // the same NOOP). The ladder varies the ASD-shape — the only
      // input axis Sync.so actually responds to — and hard-fails after
      // step 2 instead of silently muxing a NOOP output (which made
      // Speaker 2 in 4-speaker scenes appear frozen).
      //
      // Step 0 (1st NOOP)  → variant `bbox-url-pro`   (per-frame bounding_boxes_url, sync-3 conform)
      // Step 1 (2nd NOOP)  → variant `coords-pro-box` (bounding-box ASD on plate coords)
      // Step 2 (3rd NOOP)  → HARD FAIL + idempotent refund + `needs_clip_rerender`
      //
      // All three steps stay on `sync-3`. No model swap. ASD is rebuilt
      // by compose-dialog-segments' v130 buildAsdStrategy() based on the
      // new retry_variant — single source of truth.
      const noopEscalationStep = Number(passBeforeDone?.noop_escalation_step ?? 0);
      const havePlateCoords = Array.isArray(passBeforeDone?.coords) &&
        passBeforeDone.coords.length === 2;
      const havePreclipCrop = !!passBeforeDone?.preclip_crop &&
        Number.isFinite(Number(passBeforeDone.preclip_crop.size));
      const passSpeakerName = String(passBeforeDone?.speaker_name ?? "Speaker");
      const passTurnIdx = Number(passBeforeDone?.idx ?? currentPass);

      // v150 — Step 0 (bbox-url-pro) entfernt: ist nach v147+v150-B bereits
      // PRIMARY auf Fresh-Dispatch für Multi-Speaker. Ein erneuter Retry mit
      // derselben Variante produziert garantiert dasselbe Ergebnis. Nur noch
      // 1 echte Eskalations-Stufe (coords-pro-box), danach Hard-Fail.
      const NOOP_LADDER: Array<{ step: number; variant: string; label: string }> = [
        { step: 0, variant: "coords-pro-box", label: "bounding-box ASD (sync-3)" },
      ];
      const nextRung = NOOP_LADDER.find((r) => r.step === noopEscalationStep);
      const canEscalate = noopSuspect && !!nextRung && havePlateCoords && havePreclipCrop &&
        Number.isFinite(Number(passBeforeDone?.reference_frame_number));

      if (noopSuspect && !canEscalate) {
        // Ladder exhausted (step >= 2) OR missing inputs → HARD FAIL + REFUND.
        // No more PASS_DONE_SUSPECT (which silently muxed the NOOP output).
        const noopReasonHard = syncOutputResolutionRegression
          ? "sync_output_resolution_regression"
          : syncOutputUnchanged
            ? "sync_output_unchanged"
            : "sync_output_reencoded_passthrough_suspect";
        const failPatch = {
          ...freshDonePasses[currentPass],
          status: "failed",
          job_id: null,
          finished_at: nowIso,
          error: "sync_noop_unrecoverable",
          last_error: "sync_noop_unrecoverable",
          last_error_class: "sync_noop_unrecoverable",
          noop_escalation_step: noopEscalationStep,
          noop_reason: noopReasonHard,
        };
        freshDonePasses[currentPass] = failPatch;
        try {
          await supabase.rpc("update_dialog_pass_slot", {
            _scene_id: sceneId,
            _pass_idx: currentPass,
            _patch: {
              status: "failed",
              job_id: null,
              finished_at: nowIso,
              error: "sync_noop_unrecoverable",
              noop_escalation_step: noopEscalationStep,
            },
          });
        } catch {
          await supabase
            .from("composer_scenes")
            .update({
              dialog_shots: { ...freshDoneState, passes: freshDonePasses, updated_at: nowIso },
              updated_at: nowIso,
            })
            .eq("id", sceneId);
        }
        // Mark scene needs_clip_rerender so the user gets a clear "re-render plate"
        // hint rather than a frozen-lips final output.
        const turnStart = Number(passBeforeDone?.segments?.[0]?.startTime ?? 0).toFixed(1);
        const turnEnd = Number(passBeforeDone?.segments?.[0]?.endTime ?? 0).toFixed(1);
        const userMsg = `Lip-Sync für ${passSpeakerName} (Turn ${turnStart}s–${turnEnd}s) konnte nach ${NOOP_LADDER.length + 1} Versuchen nicht erzeugt werden. Bitte Plate neu rendern.`;
        await supabase
          .from("composer_scenes")
          .update({
            lip_sync_status: "failed",
            twoshot_stage: "needs_clip_rerender",
            clip_error: userMsg,
            updated_at: nowIso,
          })
          .eq("id", sceneId);
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          engine: "sync-segments",
          job_id: jobId,
          turn_idx: passTurnIdx,
          sync_status: "NOOP_LADDER_EXHAUSTED",
          error_class: "sync_noop_unrecoverable",
          error_message: userMsg,
          meta: {
            v134_ladder: true,
            pass_idx: currentPass,
            speaker_name: passSpeakerName,
            noop_escalation_step: noopEscalationStep,
            noop_reason: noopReasonHard,
            ladder_size: NOOP_LADDER.length,
            canonical_lipsync_pipeline: speakerCount >= 2 ? "v203_fullplate_sync3_bbox_only" : null,
            noop_escalation_blocked_by_v203: speakerCount >= 2,
            previous_noop_output_url: rehostedUrl ?? outputUrl,
            size_ratio: sizeRatio,
          },
        });
        console.error(
          `[sync-so-webhook] v134 scene=${sceneId} pass=${currentPass} speaker="${passSpeakerName}" NOOP-LADDER-EXHAUSTED step=${noopEscalationStep} → hard-fail (needs_clip_rerender)`,
        );
        return ok({
          ok: true,
          scene_id: sceneId,
          job_id: jobId,
          status,
          engine: "sync-segments",
          escalated: "noop_ladder_exhausted_v134",
          pass_idx: currentPass,
          speaker_name: passSpeakerName,
        });
      }

      if (canEscalate && nextRung) {
        const newAttemptId = crypto.randomUUID();
        const nextStep = nextRung.step + 1;
        const noopReason = syncOutputResolutionRegression
          ? "sync_output_resolution_regression"
          : syncOutputUnchanged
            ? "sync_output_unchanged"
            : "sync_output_reencoded_passthrough_suspect";
        // v184 retry-forensics: append a FIFO entry (max 8) to
        // pass.retry_history so we can reconstruct why a run took 15 min.
        const _prevHistory = Array.isArray((freshDonePasses[currentPass] as any)?.retry_history)
          ? ((freshDonePasses[currentPass] as any).retry_history as any[]).slice(-7)
          : [];
        const _newRetryEntry = {
          ts: nowIso,
          reason: "noop_ladder_escalation",
          from_variant: passBeforeDone?.retry_variant ?? null,
          to_variant: nextRung.variant,
          step: nextStep,
          noop_reason: noopReason,
          size_ratio: sizeRatio,
        };
        const escalationPatch = {
          ...freshDonePasses[currentPass],
          status: "pending",
          job_id: null,
          output_url: null,
          finished_at: null,
          retry_variant: nextRung.variant,
          noop_escalation_step: nextStep,
          noop_retry_attempted: true, // kept for back-compat with v131 watchdog
          noop_retry_attempt_id: newAttemptId,
          noop_retry_reason: noopReason,
          previous_noop_output_url: rehostedUrl ?? outputUrl,
          previous_noop_size_ratio: sizeRatio,
          retry_history: [..._prevHistory, _newRetryEntry],
        };
        freshDonePasses[currentPass] = escalationPatch;
        try {
          await supabase.rpc("update_dialog_pass_slot", {
            _scene_id: sceneId,
            _pass_idx: currentPass,
            _patch: {
              status: "pending",
              job_id: null,
              output_url: null,
              finished_at: null,
              retry_variant: nextRung.variant,
              noop_escalation_step: nextStep,
              noop_retry_attempted: true,
              noop_retry_attempt_id: newAttemptId,
            },
          });
        } catch (e) {
          await supabase
            .from("composer_scenes")
            .update({
              dialog_shots: { ...freshDoneState, passes: freshDonePasses, updated_at: nowIso },
              updated_at: nowIso,
            })
            .eq("id", sceneId);
        }
        // Forensics: explicit per-pass log with turn_idx + speaker_name (v134 §3).
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          engine: "sync-segments",
          job_id: jobId,
          turn_idx: passTurnIdx,
          sync_status: "NOOP_ESCALATING",
          error_class: "sync_completed_noop",
          meta: {
            v134_ladder: true,
            pass_idx: currentPass,
            speaker_name: passSpeakerName,
            noop_escalation_step: nextStep,
            from_variant: passBeforeDone?.retry_variant ?? null,
            to_variant: nextRung.variant,
            rung_label: nextRung.label,
            noop_reason: noopReason,
            size_ratio: sizeRatio,
            attempt_id: newAttemptId,
          },
        });
        // Fire-and-forget re-dispatch with user_retry_flag so the
        // safe-entry guard lets us back through.
        try {
          fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              scene_id: sceneId,
              retry: true,
              pass_idx: currentPass,
              retry_variant: nextRung.variant,
              user_retry_flag: true,
              new_attempt_id: newAttemptId,
              credit_charge_result: "skip",
              noop_auto_escalation: true,
              noop_escalation_step: nextStep,
            }),
          }).catch(() => {});
        } catch { /* ignore */ }
        console.warn(
          `[sync-so-webhook] v134 scene=${sceneId} pass=${currentPass} speaker="${passSpeakerName}" NOOP → escalating step ${nextStep} variant=${nextRung.variant} (${nextRung.label}) attempt_id=${newAttemptId}`,
        );
        return ok({
          ok: true,
          scene_id: sceneId,
          job_id: jobId,
          status,
          engine: "sync-segments",
          escalated: `noop_ladder_step_${nextStep}_v134`,
          pass_idx: currentPass,
          speaker_name: passSpeakerName,
          variant: nextRung.variant,
        });
      }

      const noopSuspectFlags = noopSuspect ? {
        sync_noop_suspect: true,
        noop_reason: syncOutputResolutionRegression
          ? "sync_output_resolution_regression"
          : syncOutputUnchanged
            ? "sync_output_unchanged"
            : "sync_output_reencoded_passthrough_suspect",
        noop_size_ratio: sizeRatio,
      } : {};
      if (freshDonePasses[currentPass]) {
        freshDonePasses[currentPass] = {
          ...freshDonePasses[currentPass],
          status: "done",
          output_url: rehostedUrl ?? outputUrl,
          rehosted: !!rehostedUrl,
          sync_output_probe: { inputHead, outputHead, inputDims, outputDims, syncOutputUnchanged, syncOutputResolutionRegression },
          finished_at: nowIso,
          ...noopSuspectFlags,
        };
      }

      const { doneCount, failedCount, allTerminal } = terminalV5Counts(freshDonePasses);
      const allDone = allTerminal && doneCount > 0;

      // Find pending passes (deferred earlier or never dispatched). These
      // need an explicit advance dispatch — without this, scenes whose
      // fan-out hit the Sync.so concurrency limit on initial dispatch
      // would never complete the remaining speakers.
      const pendingIdxs = freshDonePasses
        .map((p: any, i: number) => ((p?.status === "pending" || !p?.job_id) ? i : -1))
        .filter((i: number) => i >= 0);

      // v48 — partial-mux race fix.
      // The COMPLETED branch used to dispatch the multi-speaker mux as soon
      // as `allTerminal && doneCount > 0`. If a sibling FAILED webhook
      // arrived BEFORE this COMPLETED webhook, `failedCount>0` was silently
      // ignored and we muxed a video where one speaker was silent / had
      // wrong audio (the scene-freeze bug for 3+ speakers).
      // For 3+ speaker scenes we now mirror the FAILED-branch policy:
      // any failed pass → fail the scene cleanly + refund. No partial mux.
      if (allDone && failedCount > 0 && totalPasses >= 3) {
        const failedSpeakers = freshDonePasses
          .filter((p: any) => ["failed", "canceled_by_scene_failure"].includes(String(p?.status ?? "")))
          .map((p: any) => p?.speaker_name ?? `Speaker ${Number(p?.speaker_idx ?? 0) + 1}`);
        const failReason = `multi_speaker_incomplete_${doneCount}_of_${totalPasses}: Sprecher ${failedSpeakers.join(", ")} konnten nicht lip-synct werden — bitte Szene-Plate neu rendern oder Anzahl Sprecher reduzieren.`;
        const costFinal = Number((freshDoneState as any)?.cost_credits ?? 0);
        const alreadyRefundedFinal = !!(freshDoneState as any)?.refunded;
        if (costFinal > 0 && !alreadyRefundedFinal) {
          try {
            const { data: row2 } = await supabase
              .from("composer_scenes").select("project_id").eq("id", sceneId).single();
            const { data: proj2 } = await supabase
              .from("composer_projects").select("user_id").eq("id", (row2 as any)?.project_id).single();
            const uid2 = (proj2 as any)?.user_id;
            if (uid2) {
              const { data: w2 } = await supabase
                .from("wallets").select("balance").eq("user_id", uid2).single();
              await supabase
                .from("wallets")
                .update({ balance: Number((w2 as any)?.balance ?? 0) + costFinal, updated_at: nowIso })
                .eq("user_id", uid2);
            }
          } catch (_e) { /* best-effort */ }
        }
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: {
              ...freshDoneState,
              passes: freshDonePasses,
              status: "failed",
              finished_at: nowIso,
              refunded: costFinal > 0,
              error: failReason,
              partial_done_count: doneCount,
              partial_failed_speakers: failedSpeakers,
            },
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error: failReason,
            updated_at: nowIso,
          })
          .eq("id", sceneId);
        console.warn(
          `[sync-so-webhook] v48 scene=${sceneId} COMPLETED-branch race — refusing partial mux (${doneCount}/${totalPasses} done, failed=${failedSpeakers.join(",")}) — refund=${costFinal}`,
        );
        return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments", refused: "partial_mux_3plus" });
      }

      if (!allDone) {
        // Plan D (v93): atomic per-slot patch via RPC. Replaces the prior
        // read-modify-write of `passes[]` which could lose updates when
        // sibling parallel passes completed within milliseconds. The slot
        // patch is idempotent — only `passes[currentPass]` is touched.
        try {
          await supabase.rpc("update_dialog_pass_slot", {
            _scene_id: sceneId,
            _pass_idx: currentPass,
            _patch: {
              status: "done",
              output_url: rehostedUrl ?? outputUrl,
              rehosted: !!rehostedUrl,
              finished_at: nowIso,
            },
          });
          // Top-level scene status / counters — non-slot fields, safe to UPDATE.
          await supabase
            .from("composer_scenes")
            .update({
              lip_sync_status: "running",
              twoshot_stage: `syncso_fanout_${doneCount}_of_${totalPasses}`,
              updated_at: nowIso,
            })
            .eq("id", sceneId);
        } catch (e) {
          // RPC failure → fall back to the legacy full-array write so a
          // missing/migration-pending RPC never strands a scene.
          console.warn(`[sync-so-webhook] plan_d rpc failed, falling back: ${(e as Error)?.message ?? e}`);
          await supabase
            .from("composer_scenes")
            .update({
              dialog_shots: { ...freshDoneState, passes: freshDonePasses, status: "rendering", updated_at: nowIso },
              lip_sync_status: "running",
              twoshot_stage: `syncso_fanout_${doneCount}_of_${totalPasses}`,
              updated_at: nowIso,
            })
            .eq("id", sceneId);
        }
        console.log(`[sync-so-webhook] v25/plan_d scene=${sceneId} pass ${currentPass + 1}/${totalPasses} done (${doneCount} done, ${pendingIdxs.length} pending)`);

        // v94 — Lambda warm-ping. When second-to-last pass completes, wake
        // the audio-mux edge function so it's hot by the time the last pass
        // arrives ~25-45s later. Fire-and-forget; the warmup branch returns
        // 200 immediately without touching the DB or Lambda.
        if (doneCount === totalPasses - 1 && totalPasses >= 2) {
          try {
            fetch(`${supabaseUrl}/functions/v1/render-sync-segments-audio-mux`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({ warmup: true }),
            }).catch(() => {});
          } catch { /* ignore */ }
        }

        // Kick the next pending pass — now that we freed a slot, advance.
        if (pendingIdxs.length > 0) {
          const nextIdx = pendingIdxs[0];
          try { triggerV5Advance(supabaseUrl, serviceKey, sceneId, nextIdx, totalPasses); } catch { /* ignore */ }
        }
        return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments", done: doneCount, total: totalPasses });
      }

      // ── All passes complete ──────────────────────────────────────────
      const lastDonePass = [...freshDonePasses].reverse().find((p: any) => p?.status === "done" && p?.output_url);
      const finalUrl = (lastDonePass as any)?.output_url ?? outputUrl;

      // v64 — Single-speaker path:
      //   • If the pass was dispatched with a TIGHT per-turn WAV
      //     (`audio_tight` set), Sync.so's output equals only the speech
      //     duration. We must overlay it onto the original full-length plate
      //     via the audio-mux Lambda (same shots mechanism the N≥2 fan-out
      //     uses) so the final scene length matches `totalSec`.
      //   • Legacy non-tight single-speaker scenes finalize directly (audio
      //     already matches the plate length).
      const singleTight = totalPasses === 1 && !!(lastDonePass as any)?.audio_tight;
      if (totalPasses === 1 && !singleTight) {
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: {
              ...freshDoneState, passes: freshDonePasses,
              status: "done",
              final_url: finalUrl,
              sync_so_url: outputUrl,
              finished_at: nowIso,
            },
            clip_url: finalUrl,
            clip_status: "ready",
            lip_sync_status: "applied",
            lip_sync_applied_at: nowIso,
            twoshot_stage: "complete",
            clip_error: null,
            updated_at: nowIso,
          })
          .eq("id", sceneId);
        console.log(`[sync-so-webhook] v25 scene=${sceneId} single-speaker DONE (no tight, direct finalize)`);
        return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments", applied: true });
      }
      if (singleTight) {
        console.log(`[sync-so-webhook] v64 scene=${sceneId} single-speaker TIGHT → dispatching audio-mux (overlay on master plate)`);
      }

      // Multi-speaker: dispatch fan-in compositor.
      // Plan D (v93): atomic mux-claim via try_claim_mux_dispatch RPC.
      // When parallel passes complete near-simultaneously, all N webhooks
      // see allDone=true; without the claim each would POST to the audio
      // mux Lambda. The RPC sets dialog_shots.audio_mux.dispatched_at once
      // and returns true only to the first caller — race-safe.
      let muxClaimed = false;
      try {
        const { data: claimRes } = await supabase
          .rpc("try_claim_mux_dispatch", { _scene_id: sceneId });
        muxClaimed = claimRes === true;
      } catch (e) {
        // RPC missing/failure → fall back to legacy behavior (always dispatch).
        // Lambda mux is idempotent via audio_mux.render_id so duplicate calls
        // are safe; we only lose the wasted-invocation guard.
        console.warn(`[sync-so-webhook] plan_d mux-claim rpc failed, falling through: ${(e as Error)?.message ?? e}`);
        muxClaimed = true;
      }
      if (!muxClaimed) {
        console.log(`[sync-so-webhook] plan_d_mux_lock_skipped scene=${sceneId} reason=already_claimed`);
        return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments", compositor: "already_dispatched" });
      }
      console.log(`[sync-so-webhook] plan_d_mux_lock_acquired scene=${sceneId}`);

      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...freshDoneState, passes: freshDonePasses,
            status: "audio_muxing",
            final_url: finalUrl,
            sync_so_url: outputUrl,
            finished_at: nowIso,
            audio_mux: {
              ...((freshDoneState as any)?.audio_mux ?? {}),
              dispatched_at: nowIso,
            },
          },
          lip_sync_status: "audio_muxing",
          twoshot_stage: "audio_muxing",
          clip_error: null,
          updated_at: nowIso,
        })
        .eq("id", sceneId);
      console.log(`[sync-so-webhook] v25 scene=${sceneId} ALL ${totalPasses} passes done → dispatching fan-in compositor`);
      try {
        fetch(`${supabaseUrl}/functions/v1/render-sync-segments-audio-mux`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ scene_id: sceneId }),
        }).catch(() => {});
      } catch { /* ignore */ }
      return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments", compositor: "dispatched" });
    } else {
      // FAILED / REJECTED / CANCELED

      const rawErr = (errorMsg ?? "unknown").toString();
      const errClass = classifySyncError(rawErr);
      // OFFICIAL Sync.so error_code routing (overrides message-based heuristic
      // when the provider gives us a real enum value). Decides whether we:
      //   • retry as-is (transient)         → run the variant ladder
      //   • retry with audio repair          → mark for re-encode + retry
      //   • fail-fast (permanent input err)  → skip ladder, refund immediately
      const codeBucket = classifySyncErrorCode(errorCode);
      const codeExplain = explainSyncErrorCode(errorCode);
      const passesArr: any[] = Array.isArray((state as any).passes) ? (state as any).passes : [];
      // v25 Fan-Out: failure applies to the pass owning THIS job_id, not the
      // stale top-level current_pass cursor (which always points to the last
      // dispatched pass). Without this fix, a pass-0 FAILED webhook arriving
      // after pass-2 was dispatched would patch pass-2 instead.
      const currentPass = matchedIdx >= 0 ? matchedIdx : Number((state as any).current_pass ?? 0);
      const currentPassState = passesArr[currentPass] ?? null;
      // ── PER-PASS retry budget (Stage H) ──
      // Previously `retry_count` was stored only on the TOP-LEVEL state, so a
      // shared budget across all passes (e.g. 3 speakers) caused the last
      // speaker to be refunded/failed before her own ladder ran. Track the
      // budget per pass instead; keep top-level as aggregate for diagnostics.
      const passRetryCount = Number(currentPassState?.retry_count ?? 0);
      const aggregateRetryCount = Number((state as any).retry_count ?? 0);
      const MAX_V5_RETRIES = 3;

      // Stage E.6 — persist the full webhook payload so we can post-mortem
      // "unknown error" without grepping logs. Keep it bounded.
      try {
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          job_id: jobId,
          engine: "sync-segments",
          sync_status: status,
          http_status: 200,
          error_class: errClass,
          error_message: rawErr.slice(0, 500),
          meta: {
            diagnostic_id: currentPassState?.diagnostic_id ?? (state as any).last_diagnostic_id ?? null,
            pass_idx: currentPass,
            total_passes: Number((state as any).total_passes ?? passesArr.length ?? 1),
            retry_variant: currentPassState?.retry_variant ?? (state as any).retry_variant ?? "coords-pro",
            input_summary: {
              video: currentPassState?.input_url ?? (state as any).source_clip_url ?? null,
              audio: currentPassState?.audio_url ?? null,
              coords: currentPassState?.coords ?? null,
              speaker: currentPassState?.speaker_name ?? null,
            },
            webhook_payload: payload,
            pass_retry_count_seen: passRetryCount,
            aggregate_retry_count_seen: aggregateRetryCount,
            transient: isTransientSyncError(errClass),
            sync_error_code: errorCode ?? null,
            sync_error_bucket: codeBucket,
          },
        });
      } catch (_e) { /* ignore log errors */ }

      // ── E.5 Webhook-Retry-Pfad ─────────────────────────────────────────
      // For transient failures (rate_limited, timeout, provider_unknown_error,
      // http_5xx) we re-dispatch instead of refunding. compose-dialog-segments
      // is called with retry=true so it skips re-charging the wallet.
      // Provider "unknown error" is opaque but often recoverable with a
      // payload/model variant. Retry through a bounded fallback ladder:
      // coords-pro → auto-pro → auto-standard, then refund if all fail.
      // The official Sync.so error_code takes priority over the message
      // heuristic: `fail_fast` codes mean retrying CANNOT help (wrong
      // model, audio too long, missing input), so we skip the ladder and
      // refund immediately. `retry_transient` codes mean provider/infra
      // hiccup → ladder is the right move. `retry_with_repair` means the
      // audio metadata is broken → retry once after a re-encode (handled
      // by compose-dialog-segments via the `repair_audio` flag).
      const treatAsTransient =
        codeBucket === "retry_transient" ||
        codeBucket === "retry_with_repair" ||
        (codeBucket === "unknown" && isTransientSyncError(errClass));
      const speakerCount = passesArr.length;
      const currentVariant = currentPassState?.retry_variant ?? (state as any).retry_variant ?? "coords-pro";
      let nextVariant: string | null = nextV5RetryVariant(currentVariant);
      // v28: For 3+ speaker scenes the generic "An unknown error occurred."
      // path on `coords-pro` is almost always triggered by per-speaker WAVs
      // with multi-second leading silence (live confirmed: Matthew/Kailee on
      // scene bd60c826…). Instead of jumping to `auto-*` (face-swap risk)
      // or instantly exhausting, allow ONE coords-pro retry with audio
      // repair (lead-in trim handled in compose-dialog-segments). Only
      // after that do we fall back to the legacy block.
      let forceCoordsRepair = false;
      const isProviderUnknown =
        codeBucket === "unknown" && errClass === "provider_unknown_error";
      // v30: For 3+ speakers with provider_unknown_error (no error_code),
      // walk a face-swap-safe ladder before exhausting:
      //   retry 1: coords-pro + repair_audio  (existing)
      //   retry 2: coords-pro-box             (NEW — bounding-box targeting)
      // We never fall back to auto-* on 3+ speakers (face-swap risk).
      if (
        speakerCount >= 3 &&
        isProviderUnknown &&
        currentVariant === "coords-pro" &&
        passRetryCount === 0
      ) {
        nextVariant = "coords-pro";
        forceCoordsRepair = true;
        console.warn(
          `[sync-so-webhook] v30 scene=${sceneId} 3+ speakers (${speakerCount}) — coords-pro+repair_audio retry ${passRetryCount + 1}/${MAX_V5_RETRIES}`,
        );
      } else if (
        speakerCount >= 3 &&
        isProviderUnknown &&
        (currentVariant === "coords-pro" || currentVariant === "coords-pro-box") &&
        passRetryCount === 1
      ) {
        nextVariant = "coords-pro-box";
        forceCoordsRepair = true; // also re-emit canonical WAV
        console.warn(
          `[sync-so-webhook] v30 scene=${sceneId} 3+ speakers (${speakerCount}) — coords-pro-box (bounding-box ASD) retry ${passRetryCount + 1}/${MAX_V5_RETRIES}`,
        );
      } else if (
        // v37 — After coords-pro-box, escalate to Sync.so's recommended
        // sync-3 model for difficult plates rather than jumping to auto-*
        // (which carries face-swap risk for 3+ speaker scenes).
        speakerCount >= 3 &&
        currentVariant === "coords-pro-box" &&
        passRetryCount < MAX_V5_RETRIES
      ) {
        nextVariant = "sync3-coords";
        console.warn(
          `[sync-so-webhook] v37 scene=${sceneId} 3+ speakers (${speakerCount}) — escalating to sync-3 (model fallback) retry ${passRetryCount + 1}/${MAX_V5_RETRIES}`,
        );
      } else if (
        // v61 — After sync-3 attempts exhaust, fall back ONCE to the
        // historically-stable lipsync-2-pro chained path (same coords-pro
        // shape, different model). This restores the "Erfolgs-Pfad" that
        // ran reliably in production before sync-3 was promoted to default.
        speakerCount >= 2 &&
        (currentVariant === "sync3-coords" || currentVariant === "coords-pro-lp2pro") &&
        passRetryCount < MAX_V5_RETRIES
      ) {
        nextVariant = "coords-pro-lp2pro";
        console.warn(
          `[sync-so-webhook] v61 scene=${sceneId} ${speakerCount}+ speakers — falling back to lipsync-2-pro (proven chained path) retry ${passRetryCount + 1}/${MAX_V5_RETRIES}`,
        );
      } else if (speakerCount >= 3 && (nextVariant === "auto-pro" || nextVariant === "auto-standard")) {
        const allPassesFailedNoFace = passesArr.every(
          (p: any) =>
            p?.status === "failed" &&
            /provider_unknown_error|face_not_found/.test(String(p?.last_error_class ?? "")),
        );
        const isFirstPass = currentPass === 0;
        const lastDitchAllowed =
          allPassesFailedNoFace && isFirstPass && nextVariant === "auto-pro";
        if (!lastDitchAllowed) {
          console.warn(
            `[sync-so-webhook] v30 scene=${sceneId} 3+ speakers (${speakerCount}) — blocking auto-* fallback (from=${currentVariant} blocked=${nextVariant}); marking exhausted`,
          );
          nextVariant = null;
        } else {
          console.warn(
            `[sync-so-webhook] v30 scene=${sceneId} 3+ speakers (${speakerCount}) — last-ditch-lite ${currentVariant} → auto-pro on pass 0`,
          );
        }
      }
      // v121 — `provider_unknown_error` Stop-Loss.
      // After a single retry of the same pass with an opaque
      // `provider_unknown_error` (no `error_code`, generic message), further
      // variant-churn on full-plate ↔ preclip routinely keeps the scene
      // running for 10+ minutes without ever recovering (DB-confirmed across
      // scenes ec4290f2, 0207e3a4). Doc-strict Sync.so payload is already
      // sent; the failure is upstream and not addressable by another retry.
      // Stop here so the scene goes terminal-failed + refund kicks in.
      const v121StopLoss =
        codeBucket === "unknown" &&
        errClass === "provider_unknown_error" &&
        !errorCode &&
        passRetryCount >= 1;
      if (v121StopLoss) {
        console.warn(
          `[sync-so-webhook] v121 scene=${sceneId} pass=${currentPass} stop-loss on provider_unknown_error (no code, retry=${passRetryCount}) → no more variant churn`,
        );
      }
      // v128 — Alpha-Plan v3.1 §1.2: terminal means terminal.
      // The automatic retry ladder (variant churn, repair_audio, sync-3
      // fallback, lipsync-2-pro fallback, partial-mux) has been removed.
      // FAILED/REJECTED/CANCELED is now terminal on first dispatch.
      // The user explicitly triggers a retry via the UI, which creates a
      // new `attempt_id` and re-charges credits. Fall through to refund
      // + scene-fail handling unchanged below.
      const canRetry = false;
      // Diagnostic flags kept for `syncso_dispatch_log` only.
      void v121StopLoss; void treatAsTransient; void forceCoordsRepair; void nextVariant;


      if (canRetry) {
        const needsAudioRepair = codeBucket === "retry_with_repair" || forceCoordsRepair;

        // v29: Re-read scene right before write so parallel pass webhooks
        // don't clobber each other's job_ids. We only own the row at
        // `currentPass` — everything else is merged from the freshest state.
        const { data: freshRow } = await supabase
          .from("composer_scenes")
          .select("dialog_shots")
          .eq("id", sceneId)
          .maybeSingle();
        const freshState: any = (freshRow as any)?.dialog_shots ?? state;
        const freshPasses: any[] = Array.isArray(freshState?.passes)
          ? freshState.passes
          : passesArr;
        const updatedPasses = freshPasses.map((p: any, i: number) =>
          i === currentPass
            ? {
                ...p,
                status: "retrying",
                retry_count: passRetryCount + 1,
                // v126 — Force preclip-autodetect path on every retry.
                retry_variant: "coords-pro",
                last_error: rawErr.slice(0, 200),
                last_error_class: errClass,
                sync_error_code: errorCode ?? null,
                sync_error_bucket: codeBucket,
                repair_audio: needsAudioRepair || !!p.repair_audio,
                // v126 — Clear the dead provider state so compose-dialog-segments
                // re-renders the preclip and dispatches a fresh sync-3 job.
                job_id: null,
                output_url: null,
                started_at: null,
                finished_at: null,
                preclip_url: null,
                preclip_render_id: null,
                preclip_crop: null,
                preclip_face_count: null,
                preclip_error: null,
              }
            : p,
        );
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: {
              ...freshState,
              passes: updatedPasses,
              status: "retrying",
              retry_variant: nextVariant,
              retry_count: aggregateRetryCount + 1,
              last_error: rawErr.slice(0, 200),
              last_error_class: errClass,
              sync_error_code: errorCode ?? null,
              sync_error_bucket: codeBucket,
              fallback_history: [
                ...((freshState as any).fallback_history ?? []),
                {
                  at: nowIso,
                  job_id: jobId,
                  pass_idx: currentPass,
                  from_variant: currentVariant,
                  to_variant: nextVariant,
                  error_class: errClass,
                  sync_error_code: errorCode ?? null,
                  sync_error_bucket: codeBucket,
                  error: rawErr.slice(0, 200),
                },
              ].slice(-16),
            },
            lip_sync_status: "running",
            twoshot_stage: `syncso_retry_${nextVariant}_pass_${currentPass + 1}_of_${Number((freshState as any).total_passes ?? freshPasses.length ?? 1)}`,
            updated_at: nowIso,
          })
          .eq("id", sceneId);
        console.warn(
          `[sync-so-webhook] v5 scene=${sceneId} pass=${currentPass} ${status} code=${errorCode ?? "null"} bucket=${codeBucket} class=${errClass} → retry ${passRetryCount + 1}/${MAX_V5_RETRIES} variant=${nextVariant}${needsAudioRepair ? " +repair_audio" : ""}`,
        );
        // Fire-and-forget re-dispatch. compose-dialog-segments reads the
        // existing state (cost_credits already debited and stored) and uses
        // retry=true to skip re-charging.
        try {
          // v59 — carry the v58 multipass markers across pass-level retries
          // so compose-dialog-segments cannot accidentally fall back into
          // the broken sync-3 segments[] path.
          const carryForceMultipass =
            (freshState as any)?.force_multipass === true ||
            (freshState as any)?.multipass_fallback_attempted === true ||
            (state as any)?.force_multipass === true ||
            (state as any)?.multipass_fallback_attempted === true;
          fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              scene_id: sceneId,
              retry: true,
              // v126 — always force unified preclip-autodetect path.
              retry_variant: "coords-pro",
              repair_audio: needsAudioRepair,
              pass_idx: currentPass,
              ...(carryForceMultipass ? { force_multipass: true } : {}),
            }),
          }).catch(() => {});
        } catch {
          /* ignore */
        }
        return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments", retried: true, retry_variant: nextVariant, sync_error_code: errorCode ?? null });
      }



      // Non-retryable OR retry budget exhausted → refund (idempotent) + mark failed
      // Prefix the reason with the official error_code (when present) so the
      // UI badge surfaces a real diagnostic instead of "unknown error".
      const noCodeSuffix = !errorCode && isGenericMsg(rawErr)
        ? " — Sync.so lieferte keinen error_code (3-Sprecher-Plate + Audio-Lead-In wahrscheinliche Ursache)"
        : "";
      const codePrefix = errorCode ? `[${errorCode}] ` : "";
      const explainSuffix = codeExplain ? ` — ${codeExplain}` : "";
      const reason = `syncso_segments_${status}: ${codePrefix}${rawErr.slice(0, 200)}${explainSuffix}${noCodeSuffix}`;
      const effectiveBucket = codeBucket === "unknown" && !errorCode && isGenericMsg(rawErr)
        ? "provider_unknown_no_code"
        : codeBucket;
      const cost = Number((state as any).cost_credits ?? 0);
      const alreadyRefunded = !!(state as any).refunded;
      // v29: Determine scene survivability FIRST (re-read state below). Only
      // refund + mark scene failed if no sibling pass is still alive.
      const { data: freshFailRow } = await supabase
        .from("composer_scenes")
        .select("dialog_shots")
        .eq("id", sceneId)
        .maybeSingle();
      const freshFailState: any = (freshFailRow as any)?.dialog_shots ?? state;
      const freshFailPasses: any[] = Array.isArray(freshFailState?.passes)
        ? freshFailState.passes
        : passesArr;
      // v68 — A pass in `retrying` with retry_count >= MAX_V5_RETRIES has
      // already exhausted its budget; the next failure (this one) leaves it
      // dead-ended. Don't count it as `alive`, otherwise the scene hangs
      // forever in lip_sync_status='running' because aliveSiblings>0 blocks
      // the refund+failure path.
      // v120 — Also discount passes that are `retrying` but have no live
      // provider job (no `job_id` or job_id matches our just-failed pass).
      // Without this, a sibling that webhook-set to `retrying` but never
      // got re-dispatched (silent invoke loss) blocks the scene forever.
      const aliveSiblings = freshFailPasses
        .map((p: any, i: number) => ({ p, i }))
        .filter(({ p, i }) => {
          if (i === currentPass) return false;
          const st = String(p?.status ?? "");
          if (!["rendering", "retrying", "pending"].includes(st)) return false;
          const rc = Number(p?.retry_count ?? 0);
          if (st === "retrying" && rc >= MAX_V5_RETRIES) return false;
          // v120: stale retrying with no fresh job_id → treat as dead.
          if (st === "retrying") {
            const lastStarted = typeof p?.started_at === "string" ? Date.parse(p.started_at) : NaN;
            const stale = Number.isFinite(lastStarted) && (Date.now() - lastStarted) > 8 * 60_000;
            if (stale) return false;
          }
          return true;
        });
      const doneSiblings = freshFailPasses.filter((p: any, i: number) => i !== currentPass && p?.status === "done").length;
      let sceneWillFail = aliveSiblings.length === 0 && doneSiblings === 0;

      // v129.4a — Terminal Scene Aggregation (Option A).
      // For 3+ speaker scenes the v36 honesty policy already mandates a
      // scene-wide failure when a pflicht-pass fails (partial mux is not an
      // acceptable final result). Previously this only fired in the
      // `mustFailScene` branch, which required `allTerminal` — so a terminal
      // `provider_unknown_error` left pending siblings alive, the scene stayed
      // `running`, and the Watchdog later overwrote the root cause with
      // `watchdog_provider_timeout` ~10 min later. We now terminalise the
      // scene immediately in the webhook, under the dialog lock, with the
      // real `provider_unknown_error` reason preserved. Non-terminal sibling
      // passes are cancelled below via the existing `sceneWillFail` branch.
      const v1294RequiredPassFail = speakerCount >= 3;
      if (v1294RequiredPassFail && !sceneWillFail) {
        console.warn(
          `[sync-so-webhook] v129.4a scene=${sceneId} required-pass failure on ${speakerCount}-speaker scene → terminalising scene now ` +
          `(was alive=${aliveSiblings.length}, done=${doneSiblings}, errClass=${errClass}, bucket=${effectiveBucket})`,
        );
        sceneWillFail = true;
      }


      if (sceneWillFail && cost > 0 && !alreadyRefunded) {
        const { data: row } = await supabase
          .from("composer_scenes")
          .select("project_id")
          .eq("id", sceneId)
          .single();
        const { data: proj } = await supabase
          .from("composer_projects")
          .select("user_id")
          .eq("id", (row as any)?.project_id)
          .single();
        const uid = (proj as any)?.user_id;
        if (uid) {
          const { data: w } = await supabase
            .from("wallets").select("balance").eq("user_id", uid).single();
          await supabase
            .from("wallets")
            .update({
              balance: Number((w as any)?.balance ?? 0) + cost,
              updated_at: nowIso,
            })
            .eq("user_id", uid);
        }
      }
      // (freshFailState/freshFailPasses/aliveSiblings/sceneWillFail are
      // already computed above for the refund decision.)
      const patchedThisPass = (p: any) => ({
        ...p,
        status: "failed",
        finished_at: nowIso,
        last_error: rawErr.slice(0, 200),
        last_error_class: errClass,
        sync_error_code: errorCode ?? null,
        sync_error_bucket: effectiveBucket,
      });

      const finalPasses = freshFailPasses.map((p: any, i: number) => {
        if (i === currentPass) return patchedThisPass(p);
        if (!sceneWillFail) return p; // keep siblings untouched
        // Scene-wide fail: cancel anything still alive.
        if (["rendering", "retrying", "pending"].includes(String(p?.status ?? ""))) {
          return { ...p, status: "canceled_by_scene_failure", finished_at: nowIso };
        }
        return p;
      });

      if (sceneWillFail) {
        // v129.4a — Consistent failure fields. Provider_unknown_error without
        // an error_code gets the dedicated `terminal_provider_unknown_no_retry`
        // bucket; everything else keeps the existing classification. The
        // `scene_failure_source` + `watchdog_finalized:false` lets the
        // Watchdog distinguish webhook-finalised scenes from its own.
        const v1294Bucket =
          codeBucket === "unknown" &&
          errClass === "provider_unknown_error" &&
          !errorCode
            ? "terminal_provider_unknown_no_retry"
            : effectiveBucket;
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: {
              ...freshFailState,
              passes: finalPasses,
              status: "failed",
              finished_at: nowIso,
              refunded: cost > 0,
              error: reason,
              last_error_class: errClass,
              sync_error_code: errorCode ?? null,
              sync_error_bucket: v1294Bucket,
              sync_error_explain: codeExplain ?? null,
              scene_failure_source: "sync-so-webhook",
              watchdog_finalized: false,
              ...(v1294RequiredPassFail ? { v1294_required_pass_failure: true } : {}),
            },
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error: reason,
            updated_at: nowIso,
          })
          .eq("id", sceneId);
        console.warn(
          `[sync-so-webhook] v5/v129.4a scene=${sceneId} ${status} code=${errorCode ?? "null"} bucket=${v1294Bucket} class=${errClass} retries=${passRetryCount}/${aggregateRetryCount} refunded=${cost} reason=${reason}`,
        );
      } else {
        // Roll back the refund decision: scene still has alive siblings, so
        // we must NOT refund yet. Only patch this pass and keep going.
        const { doneCount, allTerminal } = terminalV5Counts(finalPasses);
        const totalSpeakers = Number(freshFailState?.total_passes ?? finalPasses.length ?? 1);
        const pendingIdxs = finalPasses
          .map((p: any, i: number) => ((p?.status === "pending" || (!p?.job_id && p?.status !== "failed")) ? i : -1))
          .filter((i: number) => i >= 0);
        // v36: Honesty policy — for 3+ speaker scenes a partial mux is NOT
        // an acceptable final result. If even one pflicht-speaker pass
        // failed and no further retries remain, fail the scene cleanly so
        // the user sees the truth ("Sprecher 1/3 konnte nicht lip-synct
        // werden") instead of a video where 2 of 3 characters are silent.
        // For 1- and 2-speaker scenes the legacy partial-mux behaviour
        // stays: a single bad speaker should not lose the rest.
        const failedCount = finalPasses.filter((p: any) =>
          ["failed", "canceled_by_scene_failure"].includes(String(p?.status ?? ""))
        ).length;
        const partialMuxAllowed = totalSpeakers <= 2;
        const partialMux = allTerminal && doneCount > 0 && partialMuxAllowed;
        const lastDonePass = [...finalPasses].reverse().find((p: any) => p?.status === "done" && p?.output_url);

        // v36: 3+ speakers with a failure AND no more pending work → scene fails.
        const mustFailScene = !partialMuxAllowed && allTerminal && failedCount > 0;

        if (mustFailScene) {
          // Mirror the sceneWillFail refund/fail path so credits are
          // returned and the UI flips to a clear failed state.
          const costFinal = Number((freshFailState as any)?.cost_credits ?? cost);
          const alreadyRefundedFinal = !!(freshFailState as any)?.refunded;
          if (costFinal > 0 && !alreadyRefundedFinal) {
            const { data: row2 } = await supabase
              .from("composer_scenes").select("project_id").eq("id", sceneId).single();
            const { data: proj2 } = await supabase
              .from("composer_projects").select("user_id").eq("id", (row2 as any)?.project_id).single();
            const uid2 = (proj2 as any)?.user_id;
            if (uid2) {
              const { data: w2 } = await supabase
                .from("wallets").select("balance").eq("user_id", uid2).single();
              await supabase
                .from("wallets")
                .update({ balance: Number((w2 as any)?.balance ?? 0) + costFinal, updated_at: nowIso })
                .eq("user_id", uid2);
            }
          }
          const failedSpeakers = finalPasses
            .filter((p: any) => ["failed", "canceled_by_scene_failure"].includes(String(p?.status ?? "")))
            .map((p: any) => p?.speaker_name ?? `Speaker ${Number(p?.speaker_idx ?? 0) + 1}`);
          const failReason = `multi_speaker_incomplete_${doneCount}_of_${totalSpeakers}: Sprecher ${failedSpeakers.join(", ")} konnten nicht lip-synct werden — bitte Szene-Plate neu rendern oder Anzahl Sprecher reduzieren.`;
          await supabase
            .from("composer_scenes")
            .update({
              dialog_shots: {
                ...freshFailState,
                passes: finalPasses,
                status: "failed",
                finished_at: nowIso,
                refunded: costFinal > 0,
                error: failReason,
                last_error_class: errClass,
                sync_error_code: errorCode ?? null,
                sync_error_bucket: effectiveBucket,
                partial_done_count: doneCount,
                partial_failed_speakers: failedSpeakers,
              },
              lip_sync_status: "failed",
              twoshot_stage: "failed",
              clip_error: failReason,
              updated_at: nowIso,
            })
            .eq("id", sceneId);
          console.warn(
            `[sync-so-webhook] v36 scene=${sceneId} 3+ speakers — refusing partial mux (${doneCount}/${totalSpeakers} done, failed=${failedSpeakers.join(",")}) — refund=${costFinal} alreadyRefunded=${alreadyRefundedFinal}`,
          );
        } else {
          await supabase
            .from("composer_scenes")
            .update({
              dialog_shots: {
                ...freshFailState,
                passes: finalPasses,
                status: partialMux ? "audio_muxing" : (freshFailState?.status ?? "rendering"),
                final_url: partialMux ? ((lastDonePass as any)?.output_url ?? freshFailState?.final_url ?? null) : freshFailState?.final_url,
                partial_mux: partialMux ? true : freshFailState?.partial_mux,
              },
              lip_sync_status: partialMux ? "audio_muxing" : "running",
              twoshot_stage: partialMux ? "audio_muxing" : `syncso_fanout_${doneCount}_of_${totalSpeakers}`,
              updated_at: nowIso,
            })
            .eq("id", sceneId);
          console.warn(
            `[sync-so-webhook] v5 scene=${sceneId} pass=${currentPass} FAILED but scene can continue (alive=${aliveSiblings.length}, done=${doneCount}, partialMux=${partialMux}) — no refund yet`,
          );
          if (partialMux) {
            fetch(`${supabaseUrl}/functions/v1/render-sync-segments-audio-mux`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({ scene_id: sceneId }),
            }).catch(() => {});
          } else if (pendingIdxs.length > 0) {
            triggerV5Advance(supabaseUrl, serviceKey, sceneId, pendingIdxs[0], totalSpeakers);
          }
        }
      }
    }
    return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments" });
      },
      { ttlSeconds: 30, maxAttempts: 4 },
    );
    return __v5Result;
  }

  // ── v70: legacy v4 per-turn chain removed ─────────────────────────────
  // Historical scenes with `dialog_shots.version === 4` (or v5 + shots[])
  // are no longer dispatched. Any late-arriving webhook for them is
  // accepted with a 200 so Sync.so stops retrying, but no state is
  // mutated and `poll-dialog-shots` is no longer fanned out (function
  // deleted). The user must reset such scenes via `reset-lipsync-scene`
  // to restart on the v69 unified pipeline.
  console.log(
    `[sync-so-webhook] legacy_v4_ignored scene=${sceneId} job=${jobId} version=${(state as any)?.version ?? "?"}`,
  );
  return ok({ ok: true, skipped: "legacy_v4_ignored" });
});
