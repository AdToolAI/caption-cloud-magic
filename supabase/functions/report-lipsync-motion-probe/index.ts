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
  frames?: number;
  method?: string;
  /**
   * v344 — when true, the report is persisted for forensics but MUST NOT
   * trigger escalation, hard-fail or refund. The authoritative motion
   * verdict is produced server-side in `sync-so-webhook` via
   * `_shared/mouth-motion-verdict.ts`; a browser canvas probe is a
   * best-effort signal and is not allowed to decide production outcomes.
   */
  observe_only?: boolean;
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

    const isNoop = body.yavg < YAVG_NOOP_THRESHOLD;
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
            frames: body.frames ?? null,
            method: body.method ?? "canvas-mouth-band-v248",
            is_noop: isNoop,
            threshold: YAVG_NOOP_THRESHOLD,
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

    const observeOnly = body.observe_only === true;

    try {
      await admin.rpc("update_dialog_pass_slot", {
        _scene_id: body.scene_id,
        _pass_idx: body.pass_idx,
        _patch: {
          yavg_probed_at: nowIso,
          yavg_value: body.yavg,
          ...(observeOnly ? { client_probe_observe_only: true } : {}),
          ...(isNoop && !observeOnly
            ? { motion_noop: true, motion_noop_yavg: body.yavg, motion_noop_reported_at: nowIso }
            : {}),
        },
      });
    } catch (e) {
      console.warn(`[report-lipsync-motion-probe] pass probe patch failed: ${(e as Error).message}`);
    }

    if (!isNoop) {
      console.log(
        `[report-lipsync-motion-probe] v248 scene=${body.scene_id} pass=${body.pass_idx} yavg=${body.yavg.toFixed(3)} OK`,
      );
      return json({ ok: true, is_noop: false, threshold: YAVG_NOOP_THRESHOLD });
    }

    // v344 — telemetry-only reports stop here. Escalation, hard-fail and
    // refunds are owned by the server-side verdict in `sync-so-webhook`.
    if (observeOnly) {
      console.log(
        `[report-lipsync-motion-probe] v344 scene=${body.scene_id} pass=${body.pass_idx} yavg=${body.yavg.toFixed(3)} low — observe_only, no escalation`,
      );
      return json({
        ok: true,
        is_noop: true,
        observe_only: true,
        escalated: false,
        threshold: YAVG_NOOP_THRESHOLD,
      });
    }

    console.warn(
      `[report-lipsync-motion-probe] v248 scene=${body.scene_id} pass=${body.pass_idx} yavg=${body.yavg.toFixed(3)} → MOTION_NOOP (slice-4 escalation)`,
    );


    // ---------- v353: NOOP-Ladder abgeschafft ----------
    // Identisch zu sync-so-webhook: ein Retry mit derselben Eingangs-
    // bedingung liefert nachweislich dasselbe Passthrough. Der Client-Probe-
    // Report darf deshalb keinen zweiten Dispatch mehr auslösen; er endet
    // terminal und der Pre-Dispatch-Floor (pass-face-preclip v353) verhindert
    // die Fälle bereits vorher.
    const passSpeakerName = String(pass.speaker_name ?? "Speaker");
    const passTurnIdx = Number(pass.idx ?? body.pass_idx);
    const noopEscalationStep = Number(pass.noop_escalation_step ?? 0);
    const NOOP_LADDER: Array<{ step: number; variant: string; label: string }> = [];
    const nextRung: { step: number; variant: string; label: string } | undefined = undefined;
    const canEscalate = false as boolean;


    const jobId = body.job_id ?? String(pass.job_id ?? "") ?? null;


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
    const userMsg = `Lip-Sync für ${passSpeakerName} (Turn ${turnStart}s–${turnEnd}s): Der Anbieter hat das Video unverändert zurückgegeben (keine Mundbewegung). Bitte die Szene mit näherem Bildausschnitt / größeren Gesichtern neu rendern.`;

    await admin
      .from("composer_scenes")
      .update({
        lip_sync_status: "failed",
        twoshot_stage: "needs_clip_rerender",
        clip_error: userMsg,
        updated_at: nowIso,
      })
      .eq("id", body.scene_id);

    await logDispatch(admin, {
      scene_id: body.scene_id,
      job_id: jobId,
      turn_idx: passTurnIdx,
      sync_status: "NOOP_TERMINAL_V353",
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

    return json({ ok: true, is_noop: true, escalated: false, hard_failed: true });
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
