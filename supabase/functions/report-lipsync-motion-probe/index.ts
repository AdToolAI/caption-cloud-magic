/**
 * v248 — report-lipsync-motion-probe (Slice 3 + Slice 4)
 * ------------------------------------------------------------------
 * Client (computeMouthYavg) posts here after a lipsync pass completes.
 *
 * Slice 3: persist yavg to `syncso_dispatch_log` + flag pass with
 *          `motion_noop=true` when below threshold.
 *
 * Slice 4 (NEW): when motion-noop is detected, plug into the existing
 *          v134/v150 NOOP ladder used by `sync-so-webhook`:
 *            - if escalation slot available (step < NOOP_LADDER.length,
 *              plate coords + preclip crop present) → reset the pass to
 *              `pending`, bump `noop_escalation_step`, set
 *              `retry_variant = 'coords-pro-box'`, and fire the same
 *              re-dispatch call to `compose-dialog-segments`.
 *            - else → hard-fail the pass with
 *              `sync_noop_unrecoverable`, mark the scene
 *              `needs_clip_rerender`, log NOOP_LADDER_EXHAUSTED. The
 *              existing failure-credit-refund automation
 *              (mem: architecture/failure-credit-refund-automation) picks
 *              this up.
 *
 * Auth: user JWT (scene must belong to the caller's project).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { failLipSync } from "../_shared/lipsync-fail.ts";

const YAVG_NOOP_THRESHOLD = 4.0;

// v249 Slice C: face-share-aware ladder. When the persisted
// `preclip_face_share` is below SMALL_FACE_THRESHOLD we suspect the mouth
// region is too small for Sync.so to lock onto — try a mouth-anchored
// re-zoom preclip first, before falling back to the sync-3 bounding-box ASD
// rung. Above threshold, the classic `coords-pro-box` rung (v150) stays as
// the first rung so we don't waste an extra provider call on a preclip that
// is already correctly framed.
const SMALL_FACE_THRESHOLD = 0.30;
const LADDER_SMALL_FACE: Array<{ step: number; variant: string; label: string }> = [
  { step: 0, variant: "mouth-anchored-zoom", label: "mouth-anchored re-zoom preclip (v247)" },
  { step: 1, variant: "coords-pro-box", label: "bounding-box ASD (sync-3)" },
];
const LADDER_NORMAL_FACE: Array<{ step: number; variant: string; label: string }> = [
  { step: 0, variant: "coords-pro-box", label: "bounding-box ASD (sync-3)" },
];

interface Payload {
  scene_id: string;
  job_id?: string | null;
  pass_idx: number;
  yavg: number;
  yavg_normalized?: number;
  control_yavg?: number;
  differential_yavg?: number;
  motion_ratio?: number;
  frames?: number;
  method?: string;
}

function isPayload(x: unknown): x is Payload {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return typeof p.scene_id === "string" &&
    typeof p.pass_idx === "number" &&
    typeof p.yavg === "number";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing_bearer" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!isPayload(body)) return json({ error: "invalid_payload" }, 400);

    const admin = createClient(url, service);

    // Ownership check: scene → project → user
    const { data: scene } = await admin
      .from("composer_scenes")
      .select("id, project_id, dialog_shots")
      .eq("id", body.scene_id)
      .maybeSingle();
    if (!scene) return json({ error: "scene_not_found" }, 404);
    const { data: proj } = await admin
      .from("composer_projects")
      .select("user_id")
      .eq("id", (scene as { project_id: string }).project_id)
      .maybeSingle();
    if (!proj || (proj as { user_id: string }).user_id !== userId) {
      return json({ error: "forbidden" }, 403);
    }

    const hasDifferential = Number.isFinite(body.differential_yavg) && Number.isFinite(body.motion_ratio);
    const isNoop = hasDifferential
      ? Number(body.differential_yavg) < YAVG_NOOP_THRESHOLD || Number(body.motion_ratio) < 1.12
      : true;
    const nowIso = new Date().toISOString();

    // Persist metric to dispatch log (best-effort, latest row for this job/pass).
    try {
      const query = admin
        .from("syncso_dispatch_log")
        .update({
          noop_mouth_yavg: body.yavg,
          meta_yavg_probe: {
            yavg: body.yavg,
            yavg_normalized: body.yavg_normalized ?? null,
            control_yavg: body.control_yavg ?? null,
            differential_yavg: body.differential_yavg ?? null,
            motion_ratio: body.motion_ratio ?? null,
            frames: body.frames ?? null,
            method: body.method ?? "canvas-mouth-band-v248",
            is_noop: isNoop,
            threshold: YAVG_NOOP_THRESHOLD,
            ratio_threshold: 1.12,
            reported_at: nowIso,
          },
        })
        .eq("scene_id", body.scene_id);
      if (body.job_id) await query.eq("job_id", body.job_id);
      else await query;
    } catch (e) {
      console.warn(`[report-lipsync-motion-probe] log update failed: ${(e as Error).message}`);
    }

    // Always mark the pass as probed so we don't re-probe on the client.
    const dialogShots = (scene as { dialog_shots?: { passes?: unknown[] } }).dialog_shots ?? {};
    const passes = Array.isArray((dialogShots as { passes?: unknown[] }).passes)
      ? (dialogShots as { passes: Record<string, unknown>[] }).passes
      : [];
    const pass = passes[body.pass_idx] as Record<string, unknown> | undefined;
    if (!pass) return json({ ok: true, is_noop: isNoop, threshold: YAVG_NOOP_THRESHOLD });

    // v337 stale-result guard: a probe belongs to one provider attempt only.
    // A late browser callback from an earlier retry must never approve or fail
    // the current job occupying this pass slot.
    const currentJobId = String(pass.job_id ?? pass.motion_probe_job_id ?? "");
    if (!body.job_id || !currentJobId || body.job_id !== currentJobId) {
      console.warn(`[report-lipsync-motion-probe] v337 stale probe ignored scene=${body.scene_id} pass=${body.pass_idx} reported_job=${body.job_id ?? "none"} current_job=${currentJobId || "none"}`);
      return json({ ok: true, ignored: "stale_job", is_noop: isNoop });
    }

    try {
      await admin.rpc("update_dialog_pass_slot", {
        _scene_id: body.scene_id,
        _pass_idx: body.pass_idx,
        _patch: {
          yavg_probed_at: nowIso,
          yavg_value: body.yavg,
          motion_probe_job_id: body.job_id,
          motion_probe_status: isNoop ? "failed" : "passed",
          ...(isNoop ? { motion_noop: true, motion_noop_yavg: body.yavg, motion_noop_reported_at: nowIso } : {}),
        },
      });
    } catch (e) {
      console.warn(`[report-lipsync-motion-probe] pass probe patch failed: ${(e as Error).message}`);
    }

    if (!isNoop) {
      await admin.rpc("update_dialog_pass_slot", {
        _scene_id: body.scene_id,
        _pass_idx: body.pass_idx,
        _patch: {
          status: "done",
          motion_probe_status: "passed",
          motion_probe_job_id: body.job_id,
          motion_probe_passed_at: nowIso,
          yavg_probed_at: nowIso,
          yavg_value: body.yavg,
        },
      });
      await logDispatch(admin, {
        scene_id: body.scene_id,
        job_id: body.job_id,
        turn_idx: Number(pass.idx ?? body.pass_idx),
        sync_status: "MOTION_PROBE_PASSED",
        meta: { pass_idx: body.pass_idx, yavg: body.yavg, threshold: YAVG_NOOP_THRESHOLD },
      });

      // Re-read after the atomic slot promotion. Only the final passing probe
      // may claim and dispatch the mux (or directly finalize a legacy N=1).
      const { data: freshScene } = await admin
        .from("composer_scenes")
        .select("dialog_shots")
        .eq("id", body.scene_id)
        .single();
      const freshState = (freshScene as { dialog_shots?: Record<string, unknown> } | null)?.dialog_shots ?? {};
      const freshPasses = Array.isArray((freshState as { passes?: unknown[] }).passes)
        ? (freshState as { passes: Record<string, unknown>[] }).passes
        : [];
      const allPassed = freshPasses.length > 0 && freshPasses.every((p) =>
        p.status === "done" && p.motion_probe_status === "passed" && !!p.output_url
      );
      if (allPassed) {
        const lastPass = [...freshPasses].reverse().find((p) => !!p.output_url);
        const finalUrl = String(lastPass?.output_url ?? "");
        const singleTight = freshPasses.length === 1 && lastPass?.audio_tight === true;
        if (freshPasses.length === 1 && !singleTight) {
          await admin.from("composer_scenes").update({
            dialog_shots: { ...freshState, passes: freshPasses, status: "done", final_url: finalUrl, finished_at: nowIso },
            clip_url: finalUrl,
            clip_status: "ready",
            lip_sync_status: "applied",
            lip_sync_applied_at: nowIso,
            twoshot_stage: "complete",
            clip_error: null,
            updated_at: nowIso,
          }).eq("id", body.scene_id);
        } else {
          let claimed = false;
          try {
            const { data } = await admin.rpc("try_claim_mux_dispatch", { _scene_id: body.scene_id });
            claimed = data === true;
          } catch {
            claimed = !(freshState as { audio_mux?: { dispatched_at?: string } }).audio_mux?.dispatched_at;
          }
          if (claimed) {
            await admin.from("composer_scenes").update({
              dialog_shots: {
                ...freshState,
                passes: freshPasses,
                status: "audio_muxing",
                final_url: finalUrl,
                finished_at: nowIso,
                audio_mux: { ...((freshState as any).audio_mux ?? {}), dispatched_at: nowIso },
              },
              lip_sync_status: "audio_muxing",
              twoshot_stage: "audio_muxing",
              clip_error: null,
              updated_at: nowIso,
            }).eq("id", body.scene_id);
            fetch(`${url}/functions/v1/render-sync-segments-audio-mux`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${service}` },
              body: JSON.stringify({ scene_id: body.scene_id }),
            }).catch((e) => console.warn(`[report-lipsync-motion-probe] mux dispatch failed: ${(e as Error).message}`));
          }
        }
      }
      console.log(
        `[report-lipsync-motion-probe] v248 scene=${body.scene_id} pass=${body.pass_idx} yavg=${body.yavg.toFixed(3)} OK`,
      );
      return json({ ok: true, is_noop: false, threshold: YAVG_NOOP_THRESHOLD });
    }

    console.warn(
      `[report-lipsync-motion-probe] v248 scene=${body.scene_id} pass=${body.pass_idx} yavg=${body.yavg.toFixed(3)} → MOTION_NOOP (slice-4 escalation)`,
    );

    // ---------- Slice 4: NOOP-Ladder escalation ----------
    const passSpeakerName = String(pass.speaker_name ?? "Speaker");
    const passTurnIdx = Number(pass.idx ?? body.pass_idx);
    const noopEscalationStep = Number(pass.noop_escalation_step ?? 0);
    const havePlateCoords = Array.isArray(pass.coords) &&
      (pass.coords as unknown[]).length === 2;
    const havePreclipCrop = !!pass.preclip_crop &&
      Number.isFinite(Number((pass.preclip_crop as { size?: number }).size));
    const haveReferenceFrame = Number.isFinite(Number(pass.reference_frame_number));
    const faceShare = Number((pass as any).preclip_face_share);
    const NOOP_LADDER = Number.isFinite(faceShare) && faceShare < SMALL_FACE_THRESHOLD
      ? LADDER_SMALL_FACE
      : LADDER_NORMAL_FACE;
    const nextRung = NOOP_LADDER.find((r) => r.step === noopEscalationStep);
    const canEscalate = !!nextRung && havePlateCoords && havePreclipCrop && haveReferenceFrame;

    const jobId = body.job_id ?? String(pass.job_id ?? "") ?? null;

    if (canEscalate && nextRung) {
      const newAttemptId = crypto.randomUUID();
      const nextStep = nextRung.step + 1;
      const noopReason = "sync_output_motion_noop_yavg";

      const prevHistory = Array.isArray(pass.retry_history)
        ? (pass.retry_history as unknown[]).slice(-7)
        : [];
      const newRetryEntry = {
        ts: nowIso,
        reason: "yavg_below_threshold",
        from_variant: pass.retry_variant ?? null,
        to_variant: nextRung.variant,
        step: nextStep,
        noop_reason: noopReason,
        yavg: body.yavg,
      };

      try {
        await admin.rpc("update_dialog_pass_slot", {
          _scene_id: body.scene_id,
          _pass_idx: body.pass_idx,
          _patch: {
            status: "pending",
            job_id: null,
            output_url: null,
            finished_at: null,
            retry_variant: nextRung.variant,
            noop_escalation_step: nextStep,
            noop_retry_attempted: true,
            noop_retry_attempt_id: newAttemptId,
            noop_retry_reason: noopReason,
            previous_noop_output_url: pass.output_url ?? null,
            yavg_probed_at: null,
            yavg_value: null,
            motion_noop: false,
            motion_noop_yavg: null,
            motion_probe_status: null,
            motion_probe_job_id: null,
            retry_history: [...prevHistory, newRetryEntry],
          },
        });
      } catch (e) {
        console.warn(`[report-lipsync-motion-probe] escalation patch failed: ${(e as Error).message}`);
      }

      await logDispatch(admin, {
        scene_id: body.scene_id,
        job_id: jobId,
        turn_idx: passTurnIdx,
        sync_status: "NOOP_ESCALATING",
        error_class: "sync_completed_noop",
        meta: {
          v248_slice4_yavg: true,
          pass_idx: body.pass_idx,
          speaker_name: passSpeakerName,
          noop_escalation_step: nextStep,
          from_variant: pass.retry_variant ?? null,
          to_variant: nextRung.variant,
          rung_label: nextRung.label,
          noop_reason: noopReason,
          yavg: body.yavg,
          attempt_id: newAttemptId,
        },
      });

      // Fire-and-forget re-dispatch with the same shape sync-so-webhook uses.
      try {
        fetch(`${url}/functions/v1/compose-dialog-segments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${service}` },
          body: JSON.stringify({
            scene_id: body.scene_id,
            retry: true,
            pass_idx: body.pass_idx,
            retry_variant: nextRung.variant,
            user_retry_flag: true,
            new_attempt_id: newAttemptId,
            credit_charge_result: "skip",
            noop_auto_escalation: true,
            noop_escalation_step: nextStep,
          }),
        }).catch((e) => console.warn(`[report-lipsync-motion-probe] redispatch fetch failed: ${(e as Error).message}`));
      } catch (e) {
        console.warn(`[report-lipsync-motion-probe] redispatch dispatch failed: ${(e as Error).message}`);
      }

      console.warn(
        `[report-lipsync-motion-probe] v248_slice4 scene=${body.scene_id} pass=${body.pass_idx} → escalating step=${nextStep} variant=${nextRung.variant}`,
      );
      return json({ ok: true, is_noop: true, escalated: true, step: nextStep, variant: nextRung.variant });
    }

    // Ladder exhausted → hard fail + needs_clip_rerender (refund automation picks it up).
    const noopReasonHard = "sync_output_motion_noop_yavg_unrecoverable";
    try {
      await admin.rpc("update_dialog_pass_slot", {
        _scene_id: body.scene_id,
        _pass_idx: body.pass_idx,
        _patch: {
          status: "failed",
          job_id: null,
          finished_at: nowIso,
          error: "sync_noop_unrecoverable",
          last_error: "sync_noop_unrecoverable",
          last_error_class: "sync_noop_unrecoverable",
          noop_escalation_step: noopEscalationStep,
          noop_reason: noopReasonHard,
        },
      });
    } catch (e) {
      console.warn(`[report-lipsync-motion-probe] hard-fail patch failed: ${(e as Error).message}`);
    }

    const turnStart = Number(
      (Array.isArray(pass.segments) && (pass.segments as Array<{ startTime?: number }>)[0]?.startTime) ?? 0,
    ).toFixed(1);
    const turnEnd = Number(
      (Array.isArray(pass.segments) && (pass.segments as Array<{ endTime?: number }>)[0]?.endTime) ?? 0,
    ).toFixed(1);
    const userMsg = `Lip-Sync für ${passSpeakerName} (Turn ${turnStart}s–${turnEnd}s) konnte nach ${NOOP_LADDER.length + 1} Versuchen nicht erzeugt werden. Bitte Plate neu rendern.`;

    const failure = await failLipSync({
      supabase: admin,
      sceneId: body.scene_id,
      reason: userMsg,
      userId,
      extraSyncJobIds: jobId ? [jobId] : [],
      syncApiKey: Deno.env.get("SYNC_API_KEY") ?? Deno.env.get("SYNCSO_API_KEY") ?? null,
    });
    await admin.from("composer_scenes").update({
      twoshot_stage: "needs_clip_rerender",
      updated_at: nowIso,
    }).eq("id", body.scene_id);

    await logDispatch(admin, {
      scene_id: body.scene_id,
      job_id: jobId,
      turn_idx: passTurnIdx,
      sync_status: "NOOP_LADDER_EXHAUSTED",
      error_class: "sync_noop_unrecoverable",
      error_message: userMsg,
      meta: {
        v248_slice4_yavg: true,
        pass_idx: body.pass_idx,
        speaker_name: passSpeakerName,
        noop_escalation_step: noopEscalationStep,
        noop_reason: noopReasonHard,
        ladder_size: NOOP_LADDER.length,
        previous_noop_output_url: pass.output_url ?? null,
        yavg: body.yavg,
      },
    });

    console.error(
      `[report-lipsync-motion-probe] v248_slice4 scene=${body.scene_id} pass=${body.pass_idx} speaker="${passSpeakerName}" NOOP-LADDER-EXHAUSTED → hard-fail`,
    );

    return json({ ok: true, is_noop: true, escalated: false, hard_failed: true, refunded: failure.refunded });
  } catch (e) {
    console.error(`[report-lipsync-motion-probe] error: ${(e as Error).message}`);
    return json({ error: "internal", message: (e as Error).message }, 500);
  }
});

interface DispatchLog {
  scene_id: string;
  job_id?: string | null;
  turn_idx?: number;
  sync_status: string;
  error_class?: string;
  error_message?: string;
  meta?: Record<string, unknown>;
}

async function logDispatch(admin: ReturnType<typeof createClient>, row: DispatchLog) {
  try {
    await admin.from("syncso_dispatch_log").insert({
      scene_id: row.scene_id,
      engine: "sync-segments",
      job_id: row.job_id ?? null,
      turn_idx: row.turn_idx ?? null,
      sync_status: row.sync_status,
      error_class: row.error_class ?? null,
      error_message: row.error_message ?? null,
      meta: row.meta ?? {},
    });
  } catch (e) {
    console.warn(`[report-lipsync-motion-probe] logDispatch failed: ${(e as Error).message}`);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
