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
const V5_RETRY_VARIANTS = ["coords-pro", "coords-pro-box", "auto-pro", "auto-standard"] as const;

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

function terminalV5Counts(passes: any[]) {
  const doneCount = passes.filter((p: any) => p?.status === "done").length;
  const failedCount = passes.filter((p: any) => ["failed", "canceled_by_scene_failure"].includes(String(p?.status ?? ""))).length;
  return { doneCount, failedCount, allTerminal: doneCount + failedCount >= passes.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
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

  const state = scene.dialog_shots ?? null;
  if (!state) {
    return ok({ ok: true, skipped: "no_state" });
  }

  const nowIso = new Date().toISOString();

  // ── v5: Sync.so Segments (1-call pipeline) ────────────────────────────
  // No per-turn shots; the webhook output IS the final clip.
  if (state.version === 5 && state.engine === "sync-segments") {
    // v25 Fan-Out: match the job_id against passes[].job_id (preferred) OR
    // the legacy top-level state.sync_job_id (single-pass scenes). Previously
    // we required state.sync_job_id === jobId which dropped EVERY pass
    // webhook except the most recently dispatched pass — causing scenes to
    // hang indefinitely with only the last pass marked done.
    const passesPre = Array.isArray((state as any).passes) ? [...(state as any).passes] : [];
    const matchedIdx = passesPre.findIndex((p: any) => p?.job_id === jobId);
    const isLegacySingle = matchedIdx < 0 && state.sync_job_id === jobId;
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
      if (freshDonePasses[currentPass]) {
        freshDonePasses[currentPass] = {
          ...freshDonePasses[currentPass],
          status: "done",
          output_url: rehostedUrl ?? outputUrl,
          rehosted: !!rehostedUrl,
          finished_at: nowIso,
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

      if (!allDone) {
        // Just persist this pass — let the fan-out parallel dispatches finish.
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: { ...freshDoneState, passes: freshDonePasses, status: "rendering", updated_at: nowIso },
            lip_sync_status: "running",
            twoshot_stage: `syncso_fanout_${doneCount}_of_${totalPasses}`,
            updated_at: nowIso,
          })
          .eq("id", sceneId);
        console.log(`[sync-so-webhook] v25 scene=${sceneId} pass ${currentPass + 1}/${totalPasses} done (${doneCount} done, ${pendingIdxs.length} pending)`);

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

      // Single-speaker fast path: no fan-in needed, audio already matches.
      if (totalPasses === 1) {
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
        console.log(`[sync-so-webhook] v25 scene=${sceneId} single-speaker DONE`);
        return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments", applied: true });
      }

      // Multi-speaker: dispatch fan-in compositor (idempotent via audio_mux.render_id).
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...freshDoneState, passes: freshDonePasses,
            status: "audio_muxing",
            final_url: finalUrl,
            sync_so_url: outputUrl,
            finished_at: nowIso,
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
      // fail_fast codes short-circuit the ladder entirely.
      const canRetry = codeBucket !== "fail_fast"
        && (treatAsTransient || forceCoordsRepair)
        && passRetryCount < MAX_V5_RETRIES
        && nextVariant !== null;

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
                retry_variant: nextVariant,
                last_error: rawErr.slice(0, 200),
                last_error_class: errClass,
                sync_error_code: errorCode ?? null,
                sync_error_bucket: codeBucket,
                repair_audio: needsAudioRepair || !!p.repair_audio,
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
          fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              scene_id: sceneId,
              retry: true,
              retry_variant: nextVariant,
              repair_audio: needsAudioRepair,
              pass_idx: currentPass,
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
      const aliveSiblings = freshFailPasses
        .map((p: any, i: number) => ({ p, i }))
        .filter(({ p, i }) =>
          i !== currentPass &&
          ["rendering", "retrying", "pending"].includes(String(p?.status ?? "")),
        );
      const doneSiblings = freshFailPasses.filter((p: any, i: number) => i !== currentPass && p?.status === "done").length;
      const sceneWillFail = aliveSiblings.length === 0 && doneSiblings === 0;

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
              sync_error_bucket: effectiveBucket,
              sync_error_explain: codeExplain ?? null,
            },
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error: reason,
            updated_at: nowIso,
          })
          .eq("id", sceneId);
        console.warn(
          `[sync-so-webhook] v5 scene=${sceneId} ${status} code=${errorCode ?? "null"} bucket=${codeBucket} class=${errClass} retries=${passRetryCount}/${aggregateRetryCount} refunded=${cost} reason=${reason}`,
        );
      } else {
        // Roll back the refund decision: scene still has alive siblings, so
        // we must NOT refund yet. Only patch this pass and keep going.
        const { doneCount, allTerminal } = terminalV5Counts(finalPasses);
        const pendingIdxs = finalPasses
          .map((p: any, i: number) => ((p?.status === "pending" || (!p?.job_id && p?.status !== "failed")) ? i : -1))
          .filter((i: number) => i >= 0);
        const partialMux = allTerminal && doneCount > 0;
        const lastDonePass = [...finalPasses].reverse().find((p: any) => p?.status === "done" && p?.output_url);
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
            twoshot_stage: partialMux ? "audio_muxing" : `syncso_fanout_${doneCount}_of_${Number(freshFailState?.total_passes ?? finalPasses.length ?? 1)}`,
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
          triggerV5Advance(supabaseUrl, serviceKey, sceneId, pendingIdxs[0], Number(freshFailState?.total_passes ?? finalPasses.length ?? 1));
        }
      }
    }
    return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments" });
  }

  // ── v4: legacy per-turn chain ─────────────────────────────────────────
  if (state.version !== 4 || !Array.isArray(state.shots)) {
    return ok({ ok: true, skipped: "unknown_state_version" });
  }

  // v16 race-fix: do the entire read→mutate→update inside the per-scene
  // dispatch lock. Previously the webhook patched dialog_shots from a stale
  // snapshot while poll-dialog-shots concurrently wrote, dropping fields
  // (e.g. preclip_url for turn 2 in 3-speaker scenes).
  let logLine = "";
  await withDialogLock(supabase, sceneId, "syncso-webhook", async () => {
    // Re-read inside the lock so we always patch the latest snapshot.
    const { data: fresh } = await supabase
      .from("composer_scenes")
      .select("dialog_shots, lip_sync_applied_at")
      .eq("id", sceneId)
      .maybeSingle();
    if ((fresh as any)?.lip_sync_applied_at) {
      logLine = "already_applied";
      return;
    }
    const freshState = (fresh as any)?.dialog_shots ?? state;
    if (!Array.isArray(freshState.shots)) {
      logLine = "no_shots";
      return;
    }
    const shots = freshState.shots.map((s: any) => ({ ...s }));
    const idx = shots.findIndex((s: any) => s.sync_job_id === jobId);
    if (idx < 0) {
      logLine = "shot_not_found";
      return;
    }
    const shot = shots[idx];
    const wasReady = shot.status === "ready";
    if (status === "COMPLETED" && outputUrl) {
      // v19 — Re-host per-turn Sync.so output to ai-videos so Remotion
      // Lambda has a stable, public, redirect-free MP4 URL during the
      // dialog stitch. Without this, Lambda often fails to load the
      // auth-token `api.sync.so/v2/generations/…/result?token=…` URL and
      // silently falls back to the muted master plate — the user sees a
      // clip where lips don't move at all. The v5 multi-pass path already
      // re-hosts; we mirror that behavior here for v4 per-turn shots.
      let rehostedTurnUrl: string | null = null;
      try {
        const { data: row } = await supabase
          .from("composer_scenes")
          .select("project_id")
          .eq("id", sceneId)
          .maybeSingle();
        const { data: proj } = await supabase
          .from("composer_projects")
          .select("user_id")
          .eq("id", (row as any)?.project_id)
          .maybeSingle();
        const uid = (proj as any)?.user_id;
        if (uid) {
          const dl = await fetch(outputUrl, { signal: AbortSignal.timeout(60_000) });
          if (dl.ok) {
            const bytes = new Uint8Array(await dl.arrayBuffer());
            const objectPath = `composer/${uid}/${sceneId}-dialog-turn-${shot.idx}.mp4`;
            const up = await supabase.storage.from("ai-videos").upload(
              objectPath,
              bytes,
              { contentType: "video/mp4", upsert: true },
            );
            if (!up.error) {
              const { data: pub } = supabase.storage
                .from("ai-videos")
                .getPublicUrl(objectPath);
              if (pub?.publicUrl) {
                rehostedTurnUrl = pub.publicUrl;
                console.log(
                  `[sync-so-webhook] v19 scene=${sceneId} turn=${shot.idx} re-hosted ${bytes.length} bytes → ${rehostedTurnUrl}`,
                );
              }
            } else {
              console.warn(
                `[sync-so-webhook] v19 scene=${sceneId} turn=${shot.idx} re-host upload failed: ${up.error.message}`,
              );
            }
          } else {
            console.warn(
              `[sync-so-webhook] v19 scene=${sceneId} turn=${shot.idx} re-host download HTTP ${dl.status}`,
            );
          }
        }
      } catch (err) {
        console.warn(
          `[sync-so-webhook] v19 scene=${sceneId} turn=${shot.idx} re-host exception: ${(err as Error).message}`,
        );
      }
      shot.status = "ready";
      shot.output_url = rehostedTurnUrl ?? outputUrl;
      shot.output_url_rehosted = !!rehostedTurnUrl;
      shot.completed_at = nowIso;
      shot.error = undefined;
    } else if (!prepareRetryFromWebhook(shot, `sync_${status}`, shots)) {
      // v17: graceful-degrade darf NIE für 3+ Sprecher passieren — ein Turn
      // ohne output_url heißt dort: dieser Sprecher hat im Stitch keinen
      // Lipsync. Lieber hart failen + idempotent refunden (poll-tick erkennt
      // den Zustand und triggert den Refund-Pfad).
      const speakerCount = new Set(shots.map((s: any) => s?.speaker_idx)).size;
      if (speakerCount >= 3) {
        shot.status = "failed";
        shot.degraded = false;
        shot.output_url = undefined;
        shot.error = `multi_speaker_no_degrade: sync_${status}: ${(errorMsg ?? "unknown").toString().slice(0, 200)}`;
        shot.completed_at = nowIso;
      } else {
        // 1/2 Sprecher: alter sicherer Degrade-Pfad bleibt.
        shot.status = "ready";
        shot.degraded = true;
        shot.output_url = undefined;
        shot.error = `degraded_to_master: sync_${status}: ${(errorMsg ?? "unknown").toString().slice(0, 200)}`;
        shot.completed_at = nowIso;
      }
    }
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: { ...freshState, shots },
        updated_at: nowIso,
      })
      .eq("id", sceneId);
    logLine = `scene=${sceneId} job=${jobId} turn=${shot.idx} ${wasReady ? "already_ready" : status}`;
  }, { ttlSeconds: 30 });

  console.log(`[sync-so-webhook] ${logLine}`);

  // Fire-and-forget poll-dialog-shots so the pipeline advances immediately.
  try {
    fetch(`${supabaseUrl}/functions/v1/poll-dialog-shots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ scene_id: sceneId }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }

  return ok({ ok: true, scene_id: sceneId, job_id: jobId, status });
});
