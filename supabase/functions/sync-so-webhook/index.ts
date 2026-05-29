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
import {
  releaseInflightSyncJob,
  classifySyncError,
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
const MAX_SHOT_RETRIES = 1;
const RETRY_TEMPERATURES = [0.85, 1.0, 0.7];

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
  // Sync.so wraps the real cause in nested fields. Walk every known shape so
  // we stop persisting the useless "An unknown error occurred." placeholder.
  const extractError = (p: any): string | undefined => {
    if (!p) return undefined;
    const candidates = [
      p.error,
      p.errorMessage,
      p.error_message,
      p.message,
      p.failureReason,
      p.failure_reason,
      p.errorCode,
      p.error_code,
      p?.error?.message,
      p?.error?.details,
      p?.error?.detail,
      p?.error?.reason,
      p?.data?.error,
      p?.data?.errorMessage,
      p?.data?.error_message,
      p?.data?.failureReason,
      p?.data?.error?.message,
      p?.data?.error?.details,
      p?.data?.error?.detail,
      p?.data?.error?.reason,
    ].filter((x) => typeof x === "string" && x.trim().length > 0);
    const meaningful = candidates.find(
      (s) => !/^an unknown error occurred\.?$/i.test(String(s).trim()),
    );
    return meaningful ?? candidates[0];
  };
  const errorMsg: string | undefined = extractError(payload);
  if (status !== "COMPLETED") {
    // Log the full payload once so we can post-mortem the "unknown error"
    // class without re-instrumenting the webhook.
    console.log(
      `[sync-so-webhook] terminal=${status} job=${payload?.id ?? payload?.job_id} extractedErr=${JSON.stringify(errorMsg ?? null)} fullPayload=${JSON.stringify(payload).slice(0, 1500)}`,
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
  if (status === "COMPLETED") {
    await recordCircuitSuccess(supabase, "sync.so");
  } else {
    const cls = classifySyncError((errorMsg ?? "").toString());
    await recordCircuitFailure(supabase, "sync.so", cls);
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
      .select("id, dialog_shots, lip_sync_applied_at")
      .eq("id", sceneHint)
      .maybeSingle();
    if (data) {
      sceneId = data.id;
      scene = data;
    }
  }

  if (!scene) {
    // Fallback: scan in-flight scenes for the job id. Bounded scan, low volume.
    const { data: rows } = await supabase
      .from("composer_scenes")
      .select("id, dialog_shots, lip_sync_applied_at")
      .in("lip_sync_status", ["running", "stitching"])
      .limit(200);
    for (const r of rows ?? []) {
      const shots = (r as any)?.dialog_shots?.shots ?? [];
      if (Array.isArray(shots) && shots.some((s: any) => s?.sync_job_id === jobId)) {
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

  const state = scene.dialog_shots ?? null;
  if (!state) {
    return ok({ ok: true, skipped: "no_state" });
  }

  const nowIso = new Date().toISOString();

  // ── v5: Sync.so Segments (1-call pipeline) ────────────────────────────
  // No per-turn shots; the webhook output IS the final clip.
  if (state.version === 5 && state.engine === "sync-segments") {
    if (state.sync_job_id !== jobId) {
      return ok({ ok: true, skipped: "v5_job_mismatch", job_id: jobId });
    }
    if (status === "COMPLETED" && outputUrl) {
      // ── Multi-pass chain: advance to next pass if more remain ───────────
      const passes = Array.isArray((state as any).passes) ? [...(state as any).passes] : [];
      const currentPass = Number((state as any).current_pass ?? 0);
      const totalPasses = Number((state as any).total_passes ?? passes.length ?? 1);
      const isLastPass = currentPass >= totalPasses - 1 || passes.length === 0;

      if (passes[currentPass]) {
        passes[currentPass] = {
          ...passes[currentPass],
          status: "done",
          output_url: outputUrl,
          finished_at: nowIso,
        };
      }

      if (!isLastPass) {
        // Persist this pass's output, advance cursor, fire-and-forget next dispatch.
        const nextPassIdx = currentPass + 1;
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: {
              ...state,
              passes,
              current_pass: nextPassIdx,
              status: "rendering",
              updated_at: nowIso,
            },
            lip_sync_status: "running",
            twoshot_stage: `syncso_pass_${nextPassIdx + 1}_of_${totalPasses}`,
            updated_at: nowIso,
          })
          .eq("id", sceneId);
        console.log(
          `[sync-so-webhook] v5 scene=${sceneId} pass ${currentPass + 1}/${totalPasses} done → advancing`,
        );
        try {
          fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ scene_id: sceneId, advance: true }),
          }).catch(() => {});
        } catch {
          /* ignore */
        }
        return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments", advanced_to_pass: nextPassIdx + 1 });
      }

      // ── Last pass complete → re-host + apply ───────────────────────────
      let finalUrl = outputUrl;
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
            const objectPath = `composer/${uid}/${sceneId}-lipsync.mp4`;
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
                finalUrl = pub.publicUrl;
                console.log(
                  `[sync-so-webhook] v5 scene=${sceneId} re-hosted ${bytes.length} bytes → ${finalUrl}`,
                );
              }
            } else {
              console.warn(
                `[sync-so-webhook] v5 scene=${sceneId} re-host upload failed: ${up.error.message}`,
              );
            }
          } else {
            console.warn(
              `[sync-so-webhook] v5 scene=${sceneId} re-host download HTTP ${dl.status}`,
            );
          }
        }
      } catch (err) {
        console.warn(
          `[sync-so-webhook] v5 scene=${sceneId} re-host exception: ${(err as Error).message}`,
        );
      }

      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...state,
            passes,
            status: "done",
            final_url: finalUrl,
            sync_so_url: outputUrl,
            finished_at: nowIso,
          },
          clip_url: finalUrl,
          lip_sync_status: "applied",
          lip_sync_applied_at: nowIso,
          twoshot_stage: "complete",
          clip_error: null,
          updated_at: nowIso,
        })
        .eq("id", sceneId);
      console.log(
        `[sync-so-webhook] v5 scene=${sceneId} FINAL pass ${currentPass + 1}/${totalPasses} → clip_url updated, lip_sync_applied`,
      );
    } else {
      // FAILED / REJECTED / CANCELED
      const rawErr = (errorMsg ?? "unknown").toString();
      const errClass = classifySyncError(rawErr);
      const retryCount = Number((state as any).retry_count ?? 0);
      const MAX_V5_RETRIES = 2;

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
            webhook_payload: payload,
            retry_count_seen: retryCount,
            transient: isTransientSyncError(errClass),
          },
        });
      } catch (_e) { /* ignore log errors */ }

      // ── E.5 Webhook-Retry-Pfad ─────────────────────────────────────────
      // For transient failures (rate_limited, timeout, provider_unknown_error,
      // http_5xx) we re-dispatch instead of refunding. compose-dialog-segments
      // is called with retry=true so it skips re-charging the wallet.
      // IMPORTANT: provider_unknown_error has historically masked a payload
      // bug rather than a real transient outage. After the May-2026 retry
      // storm (71 jobs in 15min) we treat it as NON-retryable until proper
      // root-cause diagnostics come back — let the user see the failure
      // instead of looping silently.
      const treatAsTransient =
        isTransientSyncError(errClass) && errClass !== "provider_unknown_error";
      const canRetry = treatAsTransient && retryCount < MAX_V5_RETRIES;


      if (canRetry) {
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: {
              ...state,
              status: "retrying",
              retry_count: retryCount + 1,
              last_error: rawErr.slice(0, 200),
              last_error_class: errClass,
            },
            lip_sync_status: "running",
            twoshot_stage: "syncso_segments_retry",
            updated_at: nowIso,
          })
          .eq("id", sceneId);
        console.warn(
          `[sync-so-webhook] v5 scene=${sceneId} ${status} class=${errClass} → retry ${retryCount + 1}/${MAX_V5_RETRIES}`,
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
            body: JSON.stringify({ scene_id: sceneId, retry: true }),
          }).catch(() => {});
        } catch {
          /* ignore */
        }
        return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments", retried: true });
      }

      // Non-retryable OR retry budget exhausted → refund (idempotent) + mark failed
      const reason = `syncso_segments_${status}: ${rawErr.slice(0, 200)}`;
      const cost = Number((state as any).cost_credits ?? 0);
      const alreadyRefunded = !!(state as any).refunded;
      if (cost > 0 && !alreadyRefunded) {
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
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...state,
            status: "failed",
            finished_at: nowIso,
            refunded: cost > 0,
            error: reason,
            last_error_class: errClass,
          },
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: reason,
          updated_at: nowIso,
        })
        .eq("id", sceneId);
      console.warn(
        `[sync-so-webhook] v5 scene=${sceneId} ${status} class=${errClass} retries=${retryCount} refunded=${cost} reason=${reason}`,
      );
    }
    return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments" });
  }

  // ── v4: legacy per-turn chain ─────────────────────────────────────────
  if (state.version !== 4 || !Array.isArray(state.shots)) {
    return ok({ ok: true, skipped: "unknown_state_version" });
  }

  const shots = state.shots.map((s: any) => ({ ...s }));
  const idx = shots.findIndex((s: any) => s.sync_job_id === jobId);
  if (idx < 0) {
    return ok({ ok: true, skipped: "shot_not_found", job_id: jobId });
  }

  const shot = shots[idx];
  const wasReady = shot.status === "ready";

  if (status === "COMPLETED" && outputUrl) {
    shot.status = "ready";
    shot.output_url = outputUrl;
    shot.completed_at = nowIso;
    shot.error = undefined;
  } else if (!prepareRetryFromWebhook(shot, `sync_${status}`, shots)) {
    // v12 Graceful Degrade: statt die ganze Szene zu killen, markieren wir
    // den Turn als "ready ohne Lipsync-Overlay" — DialogStitchVideo zeigt
    // dann die saubere Master-Plate für dieses Fenster.
    shot.status = "ready";
    shot.degraded = true;
    shot.output_url = undefined;
    shot.error = `degraded_to_master: sync_${status}: ${(errorMsg ?? "unknown").toString().slice(0, 200)}`;
    shot.completed_at = nowIso;
  }

  await supabase
    .from("composer_scenes")
    .update({
      dialog_shots: { ...state, shots },
      updated_at: nowIso,
    })
    .eq("id", sceneId);

  console.log(
    `[sync-so-webhook] scene=${sceneId} job=${jobId} turn=${shot.idx} ${wasReady ? "already_ready" : status}`,
  );

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
