/**
 * compose-dialog-segments — Sync.so Segments API, multi-pass per-speaker.
 *
 * MAY 2026 PIVOT (character-swap fix):
 * --------------------------------------------------------------------
 * The old "1-call" segments dispatch (single audio multiplexed across
 * speakers via `segments[]` + `active_speaker_detection.bounding_boxes`)
 * has two unsolvable problems against `lipsync-2-pro`:
 *
 *   1. Sync.so segments + per-frame `bounding_boxes` returns
 *      `An unknown error occurred` (DB-confirmed across May 2026 runs;
 *      v4 source comment in compose-twoshot-lipsync also documents this
 *      regression). Removing ASD makes the call complete BUT Sync.so
 *      then picks the audio→face mapping itself and routinely swaps
 *      speakers — exactly the bug the user reported.
 *   2. There is no per-segment ASD field in the documented schema:
 *      https://sync.so/docs/developer-guides/speaker-selection (top-level
 *      `options.active_speaker_detection` only).
 *
 * The only stable multi-speaker pattern is the one v4 used: one Sync.so
 * call per speaker, each with single-coord ASD pointing at THAT speaker's
 * face. We chain them: pass N's video input = pass N-1's output. The final
 * pass's output has every speaker correctly lip-synced.
 *
 * State model (dialog_shots, multi-pass):
 *  {
 *    version: 5,
 *    engine: "sync-segments",
 *    status: "queued" | "rendering" | "done" | "failed",
 *    multi_pass: true,
 *    passes: [{
 *      idx, speaker_idx, character_id, audio_url, coords,
 *      segments[], input_url, job_id?, output_url?, status, started_at?,
 *      finished_at?
 *    }, ...],
 *    current_pass: number,           // index into passes[]
 *    total_passes: number,
 *    sync_job_id: string,            // CURRENT pass's job id (for webhook)
 *    source_clip_url: string,        // pass 0 video input (master plate)
 *    total_sec: number,
 *    cost_credits: number,           // SUM across all passes
 *    refunded: boolean,
 *    final_url?: string,
 *    error?: string,
 *  }
 *
 * The webhook calls back into this function with `{ advance: true }` to
 * dispatch the next pass once a pass completes. Idempotent. Single-speaker
 * scenes still run as a single pass (no behaviour change for monologues).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import {
  classifySyncError,
  detectVoicedFrames,
  countInflightSyncJobs,
  emitSystemAlert,
  evaluateCircuit,
  getSyncApiKey,
  inspectWav,
  logSyncDispatch,
  normalizeWav,
  sliceWavToWindows,
  openCircuit,
  probeAsset,
  readPreferredSyncSourceKind,
  recordCircuitFailure,
  recordCircuitSuccess,
  registerInflightSyncJob,
  SYNCSO_DEFAULT_MAX_PARALLEL,
  // trimWavLeadIn intentionally NOT imported (v33: lead-in trim disabled).
  validateFrameFace,
  validateSegments,
  validateSyncResponseShape,
} from "../_shared/syncso-preflight.ts";
import {
  pickSpeakerCoordinates,
  probeMp4Dims,
  resolveCharacterPortraits,
  resolveSceneFaceMap,
} from "../_shared/twoshot-face-map.ts";
import { detectPlateFaces } from "../_shared/plate-face-detect.ts";
import { validateCast } from "../_shared/cast-validation.ts";
import { failLipSync } from "../_shared/lipsync-fail.ts";
import { withDialogLock } from "../_shared/dialog-lock.ts";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYNC_API_BASE = "https://api.sync.so/v2";
const LIPSYNC_MODEL = "lipsync-2-pro";
const LIPSYNC_FALLBACK_MODEL = "lipsync-2";
// v37 — `sync3-coords` added as the Sync.so-recommended fallback for
// difficult / static / occluded / multi-speaker plates per
// https://sync.so/docs/models/lipsync (sync-3 has built-in obstruction
// detection and can open closed lips, which lipsync-2-pro cannot).
// Order is intentional: try lipsync-2-pro first (better fidelity when it
// works), then sync-3 BEFORE the auto-* face-swap-risk variants.
const SYNC3_MODEL = "sync-3";
const RETRY_VARIANTS = ["coords-pro", "coords-pro-box", "sync3-coords", "auto-pro", "auto-standard"] as const;
type RetryVariant = typeof RETRY_VARIANTS[number];

// Pricing: Sync.so lipsync-2-pro = 9 credits/s.  ONE pass over the full clip
// (regardless of speaker count), so cost = ceil(totalSec) * 9 (min 9).
const LIPSYNC_CREDITS_PER_SEC = 9;
const LIPSYNC_MIN_CREDITS = 9;
const MIN_TURN_DUR_SEC = 0.4;

const computeCost = (durSec: number) =>
  Math.max(LIPSYNC_MIN_CREDITS, Math.ceil(Math.max(0, durSec)) * LIPSYNC_CREDITS_PER_SEC);

const isRetryVariant = (value: unknown): value is RetryVariant =>
  typeof value === "string" && (RETRY_VARIANTS as readonly string[]).includes(value);

const clampSyncCoords = (coords: [number, number] | null | undefined): [number, number] | null => {
  if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
  const [x, y] = coords;
  if (x <= 1 && y <= 1) return [Math.round(x * 1280), Math.round(y * 720)];
  return [Math.max(1, Math.round(x)), Math.max(1, Math.round(y))];
};

async function inspectSpeakerAudio(url: string) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`audio_get_${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const wav = inspectWav(bytes);
  const vad = detectVoicedFrames(bytes);
  return { bytes: bytes.byteLength, wav, vad };
}

interface Turn { startSec: number; endSec: number }
interface TwoshotSpeaker {
  speaker?: string;
  character_id?: string | null;
  track_url?: string;
  voicedRange?: { turns?: Turn[]; startSec?: number; endSec?: number };
}

interface SegmentItem {
  startTime: number;
  endTime: number;
  speakerIdx: number;
  speakerName: string;
  refId: string;
}

interface PassState {
  idx: number;
  speaker_idx: number;
  character_id: string | null;
  speaker_name: string;
  audio_url: string;
  coords: [number, number] | null;
  segments: SegmentItem[];
  input_url: string;
  job_id?: string;
  diagnostic_id?: string;
  retry_variant?: RetryVariant;
  reference_frame_number?: number;
  face_repair?: Record<string, unknown>;
  output_url?: string;
  status: "pending" | "rendering" | "done" | "failed";
  started_at?: string;
  finished_at?: string;
  error?: string;
}

interface SegmentsState {
  version: 5;
  engine: "sync-segments";
  status: "queued" | "rendering" | "done" | "failed" | "retrying";
  // Multi-pass per-speaker chain (added May 2026 to fix character swap).
  // Optional for back-compat with in-flight single-pass rows.
  multi_pass?: boolean;
  passes?: PassState[];
  current_pass?: number;
  total_passes?: number;
  sync_job_id?: string;
  source_clip_url: string;
  total_sec: number;
  segments: SegmentItem[];
  cost_credits: number;
  refunded: boolean;
  started_at: string;
  first_started_at?: string;
  retry_count?: number;
  retry_variant?: RetryVariant;
  fallback_history?: Array<Record<string, unknown>>;
  last_diagnostic_id?: string;
  last_error?: string;
  last_error_class?: string;
  finished_at?: string;
  final_url?: string | null;
  error?: string;
}

function uniqueSortedFrames(frames: number[]): number[] {
  return Array.from(new Set(frames.filter((n) => Number.isFinite(n)).map((n) => Math.max(0, Math.round(n))))).sort((a, b) => a - b);
}

function frameCandidatesForTurn(turn: SegmentItem, totalSec: number, fps: number): number[] {
  const start = Math.max(0, Number(turn.startTime) || 0);
  const end = Math.min(Math.max(start + MIN_TURN_DUR_SEC, Number(turn.endTime) || start), Math.max(totalSec, start + MIN_TURN_DUR_SEC));
  const points = [
    start + Math.min(0.35, Math.max(0.08, (end - start) * 0.2)),
    (start + end) / 2,
    Math.max(start, end - Math.min(0.35, Math.max(0.08, (end - start) * 0.2))),
    Math.max(0, (start + end) / 2 - 1),
    Math.min(totalSec, (start + end) / 2 + 1),
  ];
  return uniqueSortedFrames(points.map((sec) => sec * fps));
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // v33: strict per-scene single-flight lock. Released in `finally` below so
  // every return path (including early 202s, 422s, and thrown errors) frees it.
  let lockSupabase: any = null;
  let lockSceneId: string | null = null;
  let lockHolder: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const syncApiKey = getSyncApiKey();
    if (!syncApiKey) {
      return json(
        {
          error: "missing_sync_api_key",
          checked: ["SYNC_API_KEY", "SYNC_SO_API_KEY", "SYNCSO_API_KEY"],
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const sceneId = body?.scene_id;
    const isRetry = body?.retry === true;
    const requestedRetryVariant = isRetryVariant(body?.retry_variant) ? body.retry_variant : null;
    // Set by sync-so-webhook when the official error_code maps to
    // `retry_with_repair` (generation_input_audio_invalid / metadata_missing).
    // Surfaced in dispatch logs + downstream so an upcoming WAV-repair pass
    // (ffmpeg re-encode) can hook in without another routing change.
    const repairAudio = body?.repair_audio === true;
    // `advance: true` is sent by the webhook to chain to the next pass after
    // a successful pass completion. Skips wallet debit + face-gate (already
    // validated on pass 0) and dispatches passes[current_pass].
    const isAdvance = body?.advance === true;
    // v41 — single-call official Sync.so segments retry path (no re-charge,
    // bypasses v5 fan-out, re-dispatches the canonical segments[] payload).
    const isV41Retry = body?.retry_v41 === true;
    if (!sceneId || typeof sceneId !== "string") {
      return json({ error: "scene_id_required" }, 400);
    }
    if (repairAudio) {
      console.log(`[compose-dialog-segments] scene=${sceneId} repair_audio=true (audio re-encode requested by webhook)`);
    }
    if (isV41Retry) {
      console.log(`[compose-dialog-segments] scene=${sceneId} v41_retry=true (single-call segments re-dispatch)`);
    }

    // ── v33: strict single-flight lock ───────────────────────────────────
    // Without this the client + sync-so-webhook + fan-out self-invoke can all
    // fire compose-dialog-segments for the same scene within ~ms, producing
    // duplicate Sync.so jobs that never match the latest passes[] state and
    // burn provider credits. `withDialogLock` falls back to "no lock" on
    // contention which is exactly what we must avoid here.
    {
      const holder = `compose-dialog-segments-${crypto.randomUUID()}`;
      const { data: acquired, error: lockErr } = await supabase.rpc(
        "try_acquire_dialog_lock",
        { _scene_id: sceneId, _holder: holder, _ttl_seconds: 90 },
      );
      if (lockErr) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} lock rpc error: ${lockErr.message} — proceeding without lock`);
      } else if (acquired !== true) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} BUSY — another dispatcher holds the lock; skipping`);
        return json({ ok: true, status: "scene_lock_busy", scene_id: sceneId }, 202);
      } else {
        lockSupabase = supabase;
        lockSceneId = sceneId;
        lockHolder = holder;
      }
    }



    const { data: scene, error: sceneErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, audio_plan, dialog_shots, clip_url, lip_sync_source_clip_url, lip_sync_applied_at, reference_image_url, lock_reference_url",
      )
      .eq("id", sceneId)
      .single();
    if (sceneErr || !scene) {
      return json({ error: "scene_not_found", details: sceneErr?.message }, 404);
    }

    const { data: project } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", scene.project_id)
      .single();
    const userId = project?.user_id;
    if (!userId) return json({ error: "missing_user" }, 403);

    // ── Validate audio plan ───────────────────────────────────────────────
    const plan = ((scene as any).audio_plan ?? {}) as Record<string, any>;
    const twoshot = (plan.twoshot ?? {}) as Record<string, any>;
    const speakers = (Array.isArray(twoshot.speakers) ? twoshot.speakers : []) as TwoshotSpeaker[];
    const masterAudioUrl = String(twoshot.url ?? "");
    const totalSec = Number(twoshot.totalSec ?? 0);

    if (!masterAudioUrl || speakers.length === 0 || totalSec <= 0) {
      return json(
        {
          error: "missing_audio_plan",
          message: "Sync-Segments requires compose-twoshot-audio output (master WAV + speakers[].voicedRange.turns[]).",
        },
        422,
      );
    }

    // ── Cast validation (max 4, no duplicate character_id, no overlap) ──
    // Run BEFORE wallet debit / Sync.so dispatch so an invalid cast never
    // costs credits and never reaches the provider.
    {
      const castCheck = validateCast(speakers as any[]);
      if (!castCheck.ok) {
        await failLipSync({
          supabase,
          sceneId,
          userId,
          reason: `${castCheck.reason}: ${castCheck.message ?? "invalid cast"}`,
          syncApiKey: syncApiKey || null,
        });
        return json(
          {
            error: castCheck.reason,
            message: castCheck.message,
            offenders: castCheck.offenders ?? [],
          },
          422,
        );
      }
    }

    // Pick the master plate for lipsync. CRITICAL: for cinematic-sync we
    // must NEVER use a `talking-head-renders/...` URL as the source — that
    // is a HeyGen avatar bust from an earlier engine, and using it as the
    // v5 lipsync input produces the "raw avatar instead of the scene" bug.
    // We check BOTH `clip_url` AND `lip_sync_source_clip_url` and block the
    // dispatch outright if both are talking-head plates.
    const isTalkingHead = (u: unknown) =>
      typeof u === "string" && u.includes("/talking-head-renders/");
    const lipSrcCandidate = (scene as any).lip_sync_source_clip_url ?? null;
    const clipUrlCandidate = (scene as any).clip_url ?? null;
    let sourceClipUrl: string | null = null;
    if (typeof lipSrcCandidate === "string" && !isTalkingHead(lipSrcCandidate)) {
      sourceClipUrl = lipSrcCandidate;
    } else if (typeof clipUrlCandidate === "string" && !isTalkingHead(clipUrlCandidate)) {
      sourceClipUrl = clipUrlCandidate;
    }
    const bothTalkingHead =
      (lipSrcCandidate == null || isTalkingHead(lipSrcCandidate)) &&
      isTalkingHead(clipUrlCandidate);
    if (bothTalkingHead) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} BLOCKED — both clip_url and lip_sync_source_clip_url are raw talking-head plates → resetting clip for re-render`,
      );
      // Self-heal: clear the invalid talking-head master so the next
      // "Alle generieren" / per-scene render produces a real scene plate
      // (Hailuo/HappyHorse i2v) instead of looping back into this block.
      await supabase
        .from("composer_scenes")
        .update({
          clip_url: null,
          clip_status: "pending",
          lip_sync_status: "pending",
          lip_sync_source_clip_url: null,
          lip_sync_applied_at: null,
          twoshot_stage: null,
          dialog_shots: null,
          replicate_prediction_id: null,
          clip_error:
            'raw_talking_head_source_blocked: Cinematic-Sync benötigt eine Scene-Plate (Hailuo/HappyHorse), nicht den rohen Talking-Head-Clip. Clip wurde zurückgesetzt — bitte erneut „Alle generieren" drücken.',
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return json(
        {
          error: "raw_talking_head_source_blocked",
          message:
            "Cinematic-Sync benötigt eine Scene-Plate, nicht den rohen Avatar-Clip. Clip wurde zurückgesetzt — bitte erneut generieren.",
        },
        422,
      );
    }
    if (!sourceClipUrl) {
      return json(
        { error: "missing_source_clip", message: "Scene has no master plate to lipsync onto." },
        422,
      );
    }
    console.log(
      `[compose-dialog-segments] scene=${sceneId} source_kind=scene_plate url=${sourceClipUrl.slice(0, 80)}…`,
    );

    // Idempotency: an active render already exists → nudge and return.
    // On `retry=true` (E.5 webhook retry path) we bypass this guard because
    // the previous job already terminated FAILED.
    // On `advance=true` (multi-pass chain) we bypass too — the previous pass
    // completed and we're now dispatching the NEXT pass on the same scene.
    const existing = (scene as any).dialog_shots as SegmentsState | null;
    if (
      !isRetry &&
      !isAdvance &&
      !isV41Retry &&
      existing &&
      (
        (existing.version === 5 && existing.engine === "sync-segments") ||
        (existing as any).version === 41 || (existing as any).version === 42 || (existing as any).version === 43 || (existing as any).version === 44 || (existing as any).version === 45 || (existing as any).version === 46 || (existing as any).version === 47 || (existing as any).version === 48 || (existing as any).version === 49 || (existing as any).version === 50 || (existing as any).version === 51 || (existing as any).version === 52
      ) &&
      ["queued", "rendering", "retrying"].includes(String(existing.status))
    ) {
      return json({ ok: true, status: "already_running", scene_id: sceneId }, 202);
    }


    // ── Build segments from per-speaker turns ────────────────────────────
    interface RawSegment {
      startTime: number;
      endTime: number;
      speakerIdx: number;
      speakerName: string;
      audioUrl: string;
    }
    const raw: RawSegment[] = [];
    speakers.forEach((sp, sIdx) => {
      const turns: Turn[] = Array.isArray(sp.voicedRange?.turns)
        ? (sp.voicedRange!.turns as Turn[])
        : sp.voicedRange?.startSec != null && sp.voicedRange?.endSec != null
          ? [{ startSec: sp.voicedRange.startSec, endSec: sp.voicedRange.endSec }]
          : [];
      const speakerAudio = String(sp.track_url ?? "").trim() || masterAudioUrl;
      const speakerName = String(sp.speaker ?? `Speaker ${sIdx + 1}`);
      for (const t of turns) {
        const start = Math.max(0, Number(t.startSec));
        const end = Math.max(start + MIN_TURN_DUR_SEC, Number(t.endSec));
        raw.push({
          startTime: start,
          endTime: Math.min(end, totalSec),
          speakerIdx: sIdx,
          speakerName,
          audioUrl: speakerAudio,
        });
      }
    });

    if (raw.length === 0) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "dialog_pipeline_no_turns",
        })
        .eq("id", sceneId);
      return json({ error: "no_turns" }, 422);
    }

    raw.sort((a, b) => a.startTime - b.startTime);

    // De-dup audio sources → refIds
    const audioRefMap = new Map<string, string>();
    raw.forEach((r) => {
      if (!audioRefMap.has(r.audioUrl)) {
        audioRefMap.set(r.audioUrl, `audio_${audioRefMap.size + 1}`);
      }
    });

    const rawSegments = raw.map((r) => ({
      startTime: Number(r.startTime.toFixed(3)),
      endTime: Number(r.endTime.toFixed(3)),
      speakerIdx: r.speakerIdx,
      speakerName: r.speakerName,
      refId: audioRefMap.get(r.audioUrl)!,
    }));

    // Stage E.4: validate + auto-repair segments before paying Sync.so.
    const segValidation = validateSegments(rawSegments, totalSec);
    if (!segValidation.ok) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `segments_invalid_${segValidation.reason}`,
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "SEGMENTS_INVALID", error_class: "segments_invalid",
        error_message: segValidation.reason ?? "unknown",
        meta: { repairs: segValidation.repairs, original_count: rawSegments.length },
      });
      return json({ error: "segments_invalid", reason: segValidation.reason, repairs: segValidation.repairs }, 422);
    }
    if (segValidation.repairs.length > 0) {
      console.warn(`[compose-dialog-segments] scene=${sceneId} segments auto-repaired: ${segValidation.repairs.join(", ")}`);
    }
    const segments = segValidation.fixed as typeof rawSegments;
    // v25 Fan-Out pricing: N Sync.so passes (1 per distinct speaker) on the
    // SAME original plate (no chaining). Cost = ceil(totalSec)*9 * speakers.
    // Min 1 to cover the single-speaker case. validateCast() above already
    // capped speakers at 4 distinct character_ids.
    const speakerCount = Math.max(1, speakers.length);
    const totalCost = computeCost(totalSec) * speakerCount;

    // ── Stage F.3 — Circuit Breaker (BEFORE wallet debit) ────────────────
    // If Sync.so is in OPEN state, don't charge the user — defer with retry.
    // v32: for an in-flight retry/advance against an existing v5 state, we
    // MUST NOT flip the scene back to `pending`. That kicked the scene out
    // of the running-scene watchdog scan and created a `pending+circuit_open`
    // loop the client kept re-triggering. Keep `lip_sync_status='running'`
    // so the watchdog can finalize it after TTL.
    const circuit = await evaluateCircuit(supabase, "sync.so");
    if (!circuit.allow) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} CIRCUIT_OPEN state=${circuit.state} reason=${circuit.reason} recent=${circuit.recentFailures} isRetry=${isRetry} isAdvance=${isAdvance}`,
      );
      const retryInMs = circuit.retryInMs ?? 30 * 60_000;
      const hasActiveV5 =
        (existing as any)?.version === 5 &&
        (existing as any)?.engine === "sync-segments" &&
        Array.isArray((existing as any)?.passes);
      const keepRunning = isRetry || isAdvance || hasActiveV5;
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: keepRunning ? "running" : "pending",
          twoshot_stage: "circuit_open",
          clip_error: `syncso_circuit_open:${circuit.reason ?? "unknown"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "CIRCUIT_BLOCKED", error_class: "rate_limited",
        error_message: `circuit ${circuit.state}: ${circuit.reason}`,
        meta: { circuit_state: circuit.state, recent_failures: circuit.recentFailures, retry_in_ms: retryInMs, kept_running: keepRunning },
      });
      return json(
        {
          ok: false,
          status: "circuit_open",
          state: circuit.state,
          retry_in_ms: retryInMs,
          recent_failures: circuit.recentFailures,
          refunded: 0,
          message: "Sync.so ist aktuell instabil — Dispatch pausiert für 30 min.",
        },
        202,
      );
    }

    // E.5: on retry path, wallet was already debited at the original dispatch
    // and the cost is preserved in state.cost_credits. Skip re-charging.
    if (!isRetry && !isV41Retry) {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .single();
      if (!wallet || Number(wallet.balance) < totalCost) {
        return json(
          {
            error: "INSUFFICIENT_CREDITS",
            required: totalCost,
            have: wallet?.balance ?? 0,
            message: `Sync-Segments benötigt ${totalCost} Credits.`,
          },
          402,
        );
      }
      await supabase
        .from("wallets")
        .update({
          balance: Number(wallet.balance) - totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    } else {
      console.log(`[compose-dialog-segments] scene=${sceneId} RETRY path (no re-charge)`);
    }

    // Stage F.7 — read auto-tuner preferred source kind (best-effort signal only)
    const tunerKind = await readPreferredSyncSourceKind(supabase);
    if (tunerKind) {
      console.log(`[compose-dialog-segments] scene=${sceneId} auto-tuner prefers source_kind=${tunerKind}`);
    }

    // ── Webhook URL ──────────────────────────────────────────────────────
    const webhookUrl = appendWebhookToken(
      `${supabaseUrl}/functions/v1/sync-so-webhook?scene_id=${sceneId}`,
    );

    // ── Face-targeting (resolve per-speaker coords) ──────────────────────
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const anchorUrl =
      (scene as any).lock_reference_url ||
      (scene as any).reference_image_url ||
      null;
    const characterIds = speakers.map((sp) => sp.character_id ?? null);
    const characters = await resolveCharacterPortraits(supabase, userId, characterIds);
    const cachedFaceMap = (twoshot as any).faceMap ?? null;
    let faceMap: Awaited<ReturnType<typeof resolveSceneFaceMap>> | null = null;
    try {
      faceMap = await resolveSceneFaceMap({
        supabase,
        sceneId,
        anchorUrl,
        cachedFaceMap,
        lovableKey,
        characters,
        expectedFaceCount: speakers.length,
      });
    } catch (err) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} faceMap resolve failed: ${(err as Error).message}`,
      );
    }
    // Probe ACTUAL plate dimensions so per-speaker coords are in plate-space.
    // Anchor image (Nano Banana) and Hailuo i2v plate often differ in aspect
    // ratio/crop → coords computed against the anchor land off-face on the
    // plate, Sync.so rejects coords-pro with provider_unknown_error.
    // NOTE: `state` is built later (after prevState/passes setup). Use the
    // already-resolved `sourceClipUrl` (master plate) and any cached dims on
    // the existing dialog_shots row as fallback. This avoids a TDZ crash.
    const platePrimaryUrl =
      sourceClipUrl ||
      (scene as any).clip_url ||
      null;
    let plateDims: { width: number; height: number } | null = null;
    if (platePrimaryUrl) {
      plateDims = await probeMp4Dims(platePrimaryUrl);
    }
    // v33+: HARD-FAIL if we can't measure the plate for 3+ speakers — but
    // first try the anchor-derived dimensions from the cached faceMap. Some
    // Hailuo MP4 muxers write a tkhd with zero dimensions, so probeMp4Dims
    // returns null even though the clip is visually valid. The anchor
    // faceMap was built from the same scene composition so its aspect
    // ratio is a safe trusted fallback for per-speaker coordinates.
    let plateDimsSource: "mp4_probe" | "anchor_facemap_fallback" | "default" = "default";
    if (plateDims) {
      plateDimsSource = "mp4_probe";
    } else if (speakers.length >= 3 && !isAdvance) {
      const fmW = Number((cachedFaceMap as any)?.width);
      const fmH = Number((cachedFaceMap as any)?.height);
      const anchorOk =
        Number.isFinite(fmW) && Number.isFinite(fmH) &&
        fmW >= 256 && fmH >= 256 && fmW <= 8192 && fmH <= 8192;
      if (anchorOk) {
        plateDims = { width: Math.round(fmW), height: Math.round(fmH) };
        plateDimsSource = "anchor_facemap_fallback";
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} probeMp4Dims=null — using anchor faceMap dims ${fmW}x${fmH} as trusted fallback for 3+ speakers`,
        );
      }
    }

    if (!plateDims && speakers.length >= 3 && !isAdvance) {
      const alreadyRefunded = !!(existing as any)?.refunded;
      if (!alreadyRefunded && !isRetry) {
        const { data: w0 } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({ balance: Number(w0?.balance ?? 0) + totalCost, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
      }
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...(existing ?? {}),
            version: 5,
            engine: "sync-segments",
            status: "failed",
            cost_credits: Number((existing as any)?.cost_credits ?? totalCost),
            refunded: !alreadyRefunded,
            error: "plate_probe_failed_3plus_speakers",
            finished_at: new Date().toISOString(),
          },
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: 'plate_probe_failed_3plus_speakers: Video-Geometrie konnte nicht gelesen werden. Bitte "Sauber neu starten" drücken — beim erneuten Versuch nutzt das System die Anchor-Dimensionen als Fallback.',
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "PREFLIGHT_BLOCKED", error_class: "plate_probe_failed",
        error_message: "probeMp4Dims returned null AND no anchor faceMap dims available for 3+ speaker scene",
        meta: { plate_url: platePrimaryUrl, speaker_count: speakers.length, anchor_facemap_present: !!cachedFaceMap },
      });
      return json(
        {
          error: "plate_probe_failed_3plus_speakers",
          message: "Plate dimensions could not be measured. Re-render the scene clip.",
          refunded: alreadyRefunded || isRetry ? 0 : totalCost,
        },
        422,
      );
    }
    const videoDims = plateDims ?? {
      width: Number((existing as any)?.video_width) || 1280,
      height: Number((existing as any)?.video_height) || 720,
    };
    console.log(
      `[compose-dialog-segments] scene=${sceneId} plateDims source=${plateDimsSource} dims=${videoDims.width}x${videoDims.height}`,
    );

    const coordSources: string[] = [];
    const speakerCoords: Array<[number, number] | null> = speakers.map((sp, idx) => {
      const picked = pickSpeakerCoordinates({
        speakerIdx: idx,
        characterId: sp.character_id ?? null,
        faceMap,
        videoDims,
        totalSpeakers: speakers.length,
      });
      coordSources.push(picked?.source ?? "none");
      return picked?.coords ?? null;
    });
    // Final safety fallback: evenly spaced along the horizontal midline so
    // 3+ speakers never collide on the same x.
    for (let i = 0; i < speakerCoords.length; i++) {
      if (!speakerCoords[i]) {
        const total = Math.max(speakers.length, 2);
        const t = 0.2 + (0.6 * i) / (total - 1);
        speakerCoords[i] = [
          Math.round(videoDims.width * t),
          Math.round(videoDims.height * 0.5),
        ];
      }
      speakerCoords[i] = clampSyncCoords(speakerCoords[i]);
      // Bounds-clamp into the inner 90% of the plate. Identity-match coords
      // are in anchor-space; if anchor/plate aspect-ratios differ (common
      // for 3+ speaker wide group shots) the rescaled point can land
      // outside the actual video frame and Sync.so returns the opaque
      // "An unknown error occurred." Clamp is a no-op when coords already
      // sit inside the plate — so 1- and 2-speaker scenes are unaffected.
      if (speakerCoords[i] && plateDims) {
        const margin = 0.05;
        const minX = Math.round(plateDims.width * margin);
        const maxX = Math.round(plateDims.width * (1 - margin));
        const minY = Math.round(plateDims.height * margin);
        const maxY = Math.round(plateDims.height * (1 - margin));
        const [cx, cy] = speakerCoords[i]!;
        speakerCoords[i] = [
          Math.min(Math.max(cx, minX), maxX),
          Math.min(Math.max(cy, minY), maxY),
        ];
      }
    }
    const ASSUMED_FPS = 24;
    console.log(
      `[compose-dialog-segments] scene=${sceneId} faceMap=${faceMap?.source ?? "none"} faces=${faceMap?.faces?.length ?? 0} ` +
      `anchor=${faceMap?.width ?? "?"}x${faceMap?.height ?? "?"} plate=${plateDims ? `${plateDims.width}x${plateDims.height}` : "probe-failed"} ` +
      `speakers=${speakers.length} coords=${JSON.stringify(speakerCoords)} sources=${JSON.stringify(coordSources)}`,
    );

    // ─────────────────────────────────────────────────────────────────────
    // v41 — Official Sync.so Multi-Speaker Segments (for 3+ speakers)
    // ─────────────────────────────────────────────────────────────────────
    // Sync.so's Segments Guide (https://sync.so/docs/developer-guides/segments)
    // documents the canonical multi-speaker path: ONE generation, top-level
    // `segments[]`, each segment with `audioInput.refId` + `optionsOverride.
    // active_speaker_detection`. lipsync-2-pro previously rejected this in
    // 2025 (the old MAY 2026 comment below records that history); sync-3
    // accepts the official shape today and is the documented model for
    // 3+ speaker / multi-person / static plates.
    //
    // We use v41 for 3+ speaker scenes (and only on fresh dispatch or an
    // explicit v41 retry). 1–2 speaker scenes keep the v5 fan-out path
    // (it has been stable for them) so we don't regress simpler dialogs.
    let useV41Official = speakers.length >= 3 && (isV41Retry || !isAdvance);
    const v41PrevState = ((existing as any)?.version === 41 || (existing as any)?.version === 42 || (existing as any)?.version === 43 || (existing as any)?.version === 44 || (existing as any)?.version === 45 || (existing as any)?.version === 46 || (existing as any)?.version === 47 || (existing as any)?.version === 48 || (existing as any)?.version === 49 || (existing as any)?.version === 50 || (existing as any)?.version === 51) ? (existing as any) : null;

    // ── v49 face-gate REMOVED (2026-06-05) ──────────────────────────────
    // The v49 payload no longer uses per-segment ASD coordinates (see the
    // probe results in mem://architecture/lipsync/v49-docs-exact-segments).
    // The previous plate-native face probe gated v49 on detecting ≥N faces
    // and forced doomed-from-the-start v5 fan-out (bounding_boxes + coords,
    // a doc-violating mutually-exclusive combo per the Sync.so Segments
    // guide) whenever the plate cropped heads, producing 15-min "unknown
    // error" loops. v49 now always runs for 3+ speaker scenes with valid
    // per-speaker `track_url`; Sync.so's auto-ASD picks the right face per
    // segment from the audio track.

    if (useV41Official && !isAdvance) {
      // v47 — fully aligned with the official Sync.so Segments spec
      // (docs.sync.so/developer-guides/segments). Multi-speaker payload uses
      // model `lipsync-2-pro` (sync-3 silently ignores `segments[]`), per
      // segment ASD `{ frame_number, coordinates }` ONLY (no `auto_detect`
      // — the four ASD variants are mutually exclusive per docs), audio
      // inputs use the official `refId` (camelCase) key, and `coordinates`
      // come from a plate-native face probe (see v47 block above).
      const FPS_HINT_V46 = 24;

      // v47 cost correction: this branch dispatches exactly ONE Sync.so
      // generation, so the legitimate price is computeCost(totalSec). The
      // outer wallet debit charged `× speakerCount` for the v5 fan-out
      // worst case; refund the difference now (idempotent — skipped on
      // retry which never re-charged).
      const v47Cost = computeCost(totalSec);
      if (!isRetry && !isV41Retry && totalCost > v47Cost) {
        try {
          const { data: wOver } = await supabase
            .from("wallets").select("balance").eq("user_id", userId).single();
          await supabase
            .from("wallets")
            .update({
              balance: Number(wOver?.balance ?? 0) + (totalCost - v47Cost),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
          console.log(`[compose-dialog-segments] scene=${sceneId} v47 cost adjust refund=${totalCost - v47Cost} (charged=${totalCost} actual=${v47Cost})`);
        } catch (e) {
          console.warn(`[compose-dialog-segments] scene=${sceneId} v47 cost-adjust refund failed: ${(e as Error)?.message}`);
        }
      }

      // Build inputs: 1 video + N audio (one per speaker with track_url).
      type V41Input =
        | { type: "video"; url: string }
        | { type: "audio"; url: string; refId: string };
      const v41Inputs: V41Input[] = [{ type: "video", url: sourceClipUrl }];

      const v41SpeakerRefs: Array<{ idx: number; refId: string; audioUrl: string; coords: [number, number] | null; name: string; characterId: string | null }> = [];
      speakers.forEach((sp, idx) => {
        const audioUrl = String(sp.track_url ?? "").trim();
        if (!audioUrl) return;
        const refId = `speaker_${idx + 1}`;
        v41Inputs.push({ type: "audio", url: audioUrl, refId });
        const coords = clampSyncCoords(speakerCoords[idx]) ?? null;
        v41SpeakerRefs.push({
          idx,
          refId,
          audioUrl,
          coords,
          name: String(sp.speaker ?? `Speaker ${idx + 1}`),
          characterId: sp.character_id ?? null,
        });
      });

      if (v41SpeakerRefs.length < 3) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v47 skipped — only ${v41SpeakerRefs.length} of ${speakers.length} speakers have per-speaker tracks; falling back to v5 fan-out`,
        );
      } else {
        // ─────────────────────────────────────────────────────────────
        // v52 — Pro + per-segment frame_number + coordinates (POINT ASD)
        // ─────────────────────────────────────────────────────────────
        // v50/v51 sent `bounding_boxes` per segment as a single static
        // 4-tuple repeated for every frame. Per Sync.so docs
        // (developer-guides/speaker-selection) `bounding_boxes` is meant
        // as a *per-frame array across the entire video* (one entry per
        // frame, [x1,y1,x2,y2] or null) — our shape was malformed.
        //
        // v52 switches to the doc-recommended "Manual selection" mode for
        // multi-person clips: per-segment
        // `optionsOverride.active_speaker_detection = { auto_detect: false,
        // frame_number, coordinates: [cx, cy] }`. Point-based ASD is
        // tolerant — even if the point sits 30–50 px from the real face
        // Sync.so snaps to the closest face. This makes anchor-derived
        // centres usable as a standalone fallback when plate detection
        // is unavailable (which it currently is — the Replicate frame-
        // extract models lucataco/ffmpeg-extract-frame &
        // lucataco/frame-extractor both return 404 as of June 5, 2026).
        //
        // Source priority for (cx, cy):
        //   1. plate-detected face centre (if frame extraction succeeds)
        //   2. anchor face-map face centre, rescaled to plate pixels
        //   3. even-spaced heuristic (x = 0.2 + 0.6·i/(N-1), y = 0.5)
        const V50_FPS = 24;
        const plateW = (plateDims?.width ?? videoDims.width) || 1280;
        const plateH = (plateDims?.height ?? videoDims.height) || 720;
        const fmFacesAll: any[] = Array.isArray((faceMap as any)?.faces) ? (faceMap as any).faces : [];
        const fmW = Number((faceMap as any)?.width) || plateW;
        const fmH = Number((faceMap as any)?.height) || plateH;

        // ── PLATE-SIDE DETECTION (best-effort, optional) ─────────────
        let plateFaceMap: Awaited<ReturnType<typeof detectPlateFaces>> = null;
        try {
          plateFaceMap = await detectPlateFaces({
            supabase,
            plateUrl: sourceClipUrl,
            plateWidth: plateW,
            plateHeight: plateH,
            expectedCount: speakers.length,
            sceneId,
            projectId: String((existing as any)?.project_id ?? ""),
            midDurationSec: totalSec,
          });
        } catch (e) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v52 plate-detect EXCEPTION: ${(e as Error)?.message} — degrading to anchor centres`,
          );
        }
        const usePlateDetection =
          !!plateFaceMap && plateFaceMap.faces.length >= speakers.length;
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v52 plate_detect=${
            usePlateDetection ? "ok" : "fallback-anchor"
          } plate_faces=${plateFaceMap?.faces.length ?? 0} expected=${speakers.length} ` +
          `cached=${plateFaceMap?.cached ?? false}`,
        );

        // Pre-compute left-to-right ordering of ANCHOR faces (fallback chain).
        const fmFacesByX = [...fmFacesAll]
          .filter((f) => Array.isArray(f?.bbox) && f.bbox.length === 4)
          .sort((a, b) => {
            const ax = (Number(a.bbox[0]) + Number(a.bbox[2])) / 2;
            const bx = (Number(b.bbox[0]) + Number(b.bbox[2])) / 2;
            return ax - bx;
          });

        type PointSource =
          | "plate-detected"
          | "anchor-characterId"
          | "anchor-slotIndex"
          | "anchor-left-to-right"
          | "even-spaced";

        const pointForSpeaker = (
          speakerIdx: number,
          characterId: string | null,
        ): { point: [number, number]; source: PointSource } => {
          // PRIMARY: plate-detected face centre.
          if (usePlateDetection && plateFaceMap) {
            const pf = plateFaceMap.faces[speakerIdx];
            if (pf && Array.isArray(pf.bbox) && pf.bbox.length === 4) {
              const [x1, y1, x2, y2] = pf.bbox.map((n: any) => Number(n));
              if ([x1, y1, x2, y2].every(Number.isFinite)) {
                const cx = Math.round(Math.max(0, Math.min(plateW, (x1 + x2) / 2)));
                const cy = Math.round(Math.max(0, Math.min(plateH, (y1 + y2) / 2)));
                return { point: [cx, cy], source: "plate-detected" };
              }
            }
          }
          // SECONDARY: anchor face-map centre rescaled to plate.
          let src: PointSource = "anchor-left-to-right";
          let matched: any =
            (characterId && fmFacesAll.find((f) => f?.characterId && f.characterId === characterId)) || null;
          if (matched) src = "anchor-characterId";
          if (!matched) {
            matched = fmFacesAll.find((f) => Number(f?.slotIndex) === Number(speakerIdx)) || null;
            if (matched) src = "anchor-slotIndex";
          }
          if (!matched) matched = fmFacesByX[speakerIdx] || null;
          if (matched && Array.isArray(matched.bbox) && matched.bbox.length === 4) {
            const [bx1, by1, bx2, by2] = matched.bbox.map((n: any) => Number(n));
            if ([bx1, by1, bx2, by2].every(Number.isFinite)) {
              const sx = plateW / Math.max(1, fmW);
              const sy = plateH / Math.max(1, fmH);
              const cx = Math.round(Math.max(0, Math.min(plateW, ((bx1 + bx2) / 2) * sx)));
              const cy = Math.round(Math.max(0, Math.min(plateH, ((by1 + by2) / 2) * sy)));
              return { point: [cx, cy], source: src };
            }
          }
          // TERTIARY: even-spaced heuristic across the plate width.
          const N = Math.max(1, speakers.length);
          const t = N === 1 ? 0.5 : 0.2 + (0.6 * speakerIdx) / (N - 1);
          const cx = Math.round(t * plateW);
          const cy = Math.round(0.5 * plateH);
          return { point: [cx, cy], source: "even-spaced" };
        };

        const v41Segments: Array<Record<string, unknown>> = [];
        const v50BoxDiag: Array<{ refId: string; point: number[] | null; source: string }> = [];
        const pointSourceCounts: Record<string, number> = {};
        v41SpeakerRefs.forEach(({ idx, refId, name, characterId }) => {
          const sp = speakers[idx];
          const turns: Turn[] = Array.isArray(sp?.voicedRange?.turns)
            ? (sp!.voicedRange!.turns as Turn[])
            : [];
          const { point, source } = pointForSpeaker(idx, characterId);
          pointSourceCounts[source] = (pointSourceCounts[source] ?? 0) + 1;
          v50BoxDiag.push({ refId, point, source });
          for (const t of turns) {
            const sRaw = Math.max(0, Number(t.startSec));
            const eRaw = Math.min(totalSec, Math.max(sRaw + MIN_TURN_DUR_SEC, Number(t.endSec)));
            if (!Number.isFinite(sRaw) || !Number.isFinite(eRaw) || eRaw <= sRaw + 0.05) continue;
            const s = Number(sRaw.toFixed(3));
            const e = Number(eRaw.toFixed(3));
            const frameNumber = Math.max(0, Math.round(s * V50_FPS));
            const seg: Record<string, unknown> = {
              startTime: s,
              endTime: e,
              audioInput: { refId, startTime: s, endTime: e },
              // Per Sync.so docs (developer-guides/speaker-selection),
              // the four ASD variants are mutually exclusive. Manual
              // point selection (`frame_number` + `coordinates`) is the
              // recommended deterministic mode for multi-person clips.
              optionsOverride: {
                active_speaker_detection: {
                  auto_detect: false,
                  frame_number: frameNumber,
                  coordinates: point,
                },
              },
            };
            v41Segments.push(seg);
          }
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v52 speaker=${refId} name=${name} point=${JSON.stringify(point)} src=${source}`,
          );
        });
        v41Segments.sort((a: any, b: any) => Number(a.startTime) - Number(b.startTime));

        if (v41Segments.length === 0) {
          await supabase
            .from("composer_scenes")
            .update({
              lip_sync_status: "failed",
              twoshot_stage: "failed",
              clip_error: "v50_no_segments_built",
            })
            .eq("id", sceneId);
          return json({ error: "v50_no_segments_built" }, 422);
        }

        // Pre-dispatch validation: every segment refId must exist in inputs.
        const inputRefSet = new Set(
          v41Inputs.filter((i) => i.type === "audio").map((i: any) => i.refId),
        );
        for (const seg of v41Segments) {
          const refId = (seg as any).audioInput?.refId;
          if (!refId || !inputRefSet.has(refId)) {
            console.error(
              `[compose-dialog-segments] scene=${sceneId} v50 INVALID segment refId=${refId} inputs=${JSON.stringify([...inputRefSet])}`,
            );
            await supabase
              .from("composer_scenes")
              .update({ lip_sync_status: "failed", twoshot_stage: "failed", clip_error: "v50_segment_refid_missing" })
              .eq("id", sceneId);
            return json({ error: "v50_segment_refid_missing", refId }, 422);
          }
        }

        const v41Webhook = appendWebhookToken(
          `${supabaseUrl}/functions/v1/sync-so-webhook?scene_id=${sceneId}`,
        );
        // v52 — Pro for fidelity + per-segment frame_number+coordinates
        // (doc-conform POINT ASD). Replaces the malformed per-frame box
        // payload from v50/v51.
        const V50_MODEL = "lipsync-2-pro";
        const segmentsWithBox = v41Segments.length; // every v52 segment carries a point
        const segmentsAutoFallback = 0;
        const v41Payload = {
          model: V50_MODEL,
          input: v41Inputs,
          segments: v41Segments,
          options: { sync_mode: "cut_off" },
          webhookUrl: v41Webhook,
        };

        console.log(
          `[compose-dialog-segments] scene=${sceneId} v52_official_segments_payload model=${V50_MODEL} asd=point_per_segment ` +
          `speakers=${v41SpeakerRefs.length} audio_refs=${JSON.stringify(v41SpeakerRefs.map((s) => s.refId))} ` +
          `segments=${v41Segments.length} totalSec=${totalSec} sync_mode=cut_off plate=${plateW}x${plateH} ` +
          `facemap_faces=${fmFacesAll.length} plate_detected=${usePlateDetection} ` +
          `point_sources=${JSON.stringify(pointSourceCounts)} points=${JSON.stringify(v50BoxDiag)}`,
        );


        const v41Resp = await fetch(`${SYNC_API_BASE}/generate`, {
          method: "POST",
          headers: { "x-api-key": syncApiKey, "Content-Type": "application/json" },
          body: JSON.stringify(v41Payload),
        });

        if (!v41Resp.ok) {
          const errTxt = await v41Resp.text().catch(() => "");
          console.error(
            `[compose-dialog-segments] scene=${sceneId} v50 dispatch FAILED status=${v41Resp.status} body=${errTxt.slice(0, 600)}`,
          );
          const alreadyRefunded = !!(v41PrevState as any)?.refunded;
          if (!alreadyRefunded && !isV41Retry) {
            const { data: wRef } = await supabase
              .from("wallets").select("balance").eq("user_id", userId).single();
            await supabase
              .from("wallets")
              .update({
                balance: Number(wRef?.balance ?? 0) + v47Cost,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
          }
          await supabase
            .from("composer_scenes")
            .update({
              dialog_shots: {
                ...(v41PrevState ?? {}),
                version: 52,
                engine: "sync-official-segments-v52",
                asd_mode: "point_per_segment",
                status: "failed",
                model: V50_MODEL,
                cost_credits: Number(v41PrevState?.cost_credits ?? v47Cost),
                refunded: !alreadyRefunded,
                error: `v50_dispatch_${v41Resp.status}:${errTxt.slice(0, 200)}`,
                finished_at: new Date().toISOString(),
              },
              lip_sync_status: "failed",
              twoshot_stage: "failed",
              clip_error: `v50_dispatch_${v41Resp.status}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sceneId);
          await logSyncDispatch(supabase, {
            scene_id: sceneId, user_id: userId, engine: "sync-official-segments-v52",
            sync_source_kind: "v50_segments_bbox", video_url: sourceClipUrl,
            http_status: v41Resp.status, sync_status: "DISPATCH_FAILED",
            error_class: classifySyncError(errTxt),
            error_message: errTxt.slice(0, 500),
            meta: { payload_summary: { model: V50_MODEL, segments_count: v41Segments.length, with_box: segmentsWithBox, speakers: v41SpeakerRefs.length, input_refs: v41SpeakerRefs.map((s) => s.refId) } },
          });
          return json({ error: "v50_dispatch_failed", status: v41Resp.status, body: errTxt.slice(0, 400) }, 502);
        }

        const v41Data = await v41Resp.json();
        const v41Shape = validateSyncResponseShape(v41Data);
        if (!v41Shape.ok) {
          console.error(
            `[compose-dialog-segments] scene=${sceneId} v50 SCHEMA_DRIFT missing=${v41Shape.missingKeys.join(",")}`,
          );
          return json({ error: "v50_schema_drift", missing: v41Shape.missingKeys }, 502);
        }
        const v41JobId = String(v41Data.id ?? "");
        if (!v41JobId) return json({ error: "v50_no_job_id" }, 502);

        await registerInflightSyncJob(supabase, {
          job_id: v41JobId, user_id: userId, scene_id: sceneId, engine: "sync-official-segments-v52",
        });
        await recordCircuitSuccess(supabase, "sync.so");

        const v41NowIso = new Date().toISOString();
        const v41RetryCount = Number(v41PrevState?.retry_count ?? 0) + (isV41Retry ? 1 : 0);
        const v41State = {
          version: 52,
          engine: "sync-official-segments-v52",
          asd_mode: "point_per_segment",
          status: "rendering",
          model: V50_MODEL,
          sync_job_id: v41JobId,
          source_clip_url: sourceClipUrl,
          total_sec: totalSec,
          segments: v41Segments,
          speaker_refs: v41SpeakerRefs,
          v50_box_map: v50BoxDiag,
          v50_segments_with_box: segmentsWithBox,
          v50_segments_auto_fallback: segmentsAutoFallback,
          point_sources: pointSourceCounts,
          plate_detected: usePlateDetection,
          cost_credits: Number(v41PrevState?.cost_credits ?? v47Cost),
          refunded: false,
          retry_count: v41RetryCount,
          started_at: v41PrevState?.first_started_at ?? v41NowIso,
          first_started_at: v41PrevState?.first_started_at ?? v41NowIso,
          video_width: videoDims.width,
          video_height: videoDims.height,
        };

        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: v41State,
            lip_sync_status: "running",
            twoshot_stage: "syncso_v52_official_segments",
            lip_sync_source_clip_url: sourceClipUrl,
            replicate_prediction_id: `sync:${v41JobId}`,
            clip_error: null,
            updated_at: v41NowIso,
          })
          .eq("id", sceneId);

        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-official-segments-v52",
          job_id: v41JobId, sync_source_kind: "v50_segments_bbox",
          video_url: sourceClipUrl,
          window_start_sec: 0, window_end_sec: totalSec,
          http_status: v41Resp.status, sync_status: "DISPATCHED",
          meta: {
            model: V50_MODEL,
            segments_count: v41Segments.length,
            segments_with_box: segmentsWithBox,
            segments_auto_fallback: segmentsAutoFallback,
            speakers: v41SpeakerRefs.map((s) => ({ idx: s.idx, refId: s.refId, name: s.name, coords: s.coords })),
            box_map: v50BoxDiag,
            input_refs: v41SpeakerRefs.map((s) => s.refId),
            is_retry: isV41Retry,
            retry_count: v41RetryCount,
            plate: { width: plateW, height: plateH },
            facemap_faces: fmFacesAll.length,
          },
        });

        return json(
          {
            ok: true,
            status: "rendering",
            scene_id: sceneId,
            sync_job_id: v41JobId,
            engine: "sync-official-segments-v52",
            model: V50_MODEL,
            segments: v41Segments.length,
            segments_with_box: segmentsWithBox,
            speakers: v41SpeakerRefs.length,
            cost_credits: v41State.cost_credits,
          },
          202,
        );
      }
    }




    // ── Build PASSES (one per speaker that has turns) ────────────────────
    // MAY 2026 pivot: instead of one Sync.so call with segments[]+ASD (which
    // crashes lipsync-2-pro), we chain N per-speaker calls where each pass:
    //  • takes prev pass output as video input (pass 0 = master plate)
    //  • takes that speaker's pre-mixed audio track (with silence between
    //    their turns — compose-twoshot-audio guarantees this)
    //  • locks ASD to that speaker's single-coord face
    //  • NO segments[] → no crash
    //
    // Result: each pass only modifies its own speaker's mouth. After the
    // final pass, every speaker is correctly lip-synced.
    const passSpeakers = speakers
      .map((sp, originalIdx) => ({ sp, originalIdx }))
      .filter(({ sp }) => {
        const turns = Array.isArray(sp.voicedRange?.turns) ? sp.voicedRange!.turns! : [];
        return turns.length > 0 && !!String(sp.track_url ?? "").trim();
      });

    // If we can't build per-speaker passes (missing track_url), bail with a
    // clear error rather than silently swap speakers.
    if (passSpeakers.length === 0) {
      // Refund the wallet debit we just took.
      const { data: wErr } = await supabase
        .from("wallets").select("balance").eq("user_id", userId).single();
      await supabase
        .from("wallets")
        .update({
          balance: Number(wErr?.balance ?? 0) + totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "dialog_pipeline_no_per_speaker_tracks",
        })
        .eq("id", sceneId);
      return json(
        {
          error: "no_per_speaker_tracks",
          message: "Per-speaker audio tracks missing. Re-run compose-twoshot-audio.",
          refunded: totalCost,
        },
        422,
      );
    }

    const builtPasses: PassState[] = passSpeakers.map(({ sp, originalIdx }, passIdx) => {
      const turns = sp.voicedRange!.turns! as Turn[];
      const passSegments: SegmentItem[] = turns.map((t) => ({
        startTime: Number(Math.max(0, t.startSec).toFixed(3)),
        endTime: Number(Math.min(totalSec, Math.max(t.startSec + MIN_TURN_DUR_SEC, t.endSec)).toFixed(3)),
        speakerIdx: originalIdx,
        speakerName: String(sp.speaker ?? `Speaker ${originalIdx + 1}`),
        refId: "a1",
      }));
      return {
        idx: passIdx,
        speaker_idx: originalIdx,
        character_id: sp.character_id ?? null,
        speaker_name: String(sp.speaker ?? `Speaker ${originalIdx + 1}`),
        audio_url: String(sp.track_url),
        coords: speakerCoords[originalIdx] ?? [0.5, 0.5],
        segments: passSegments,
        input_url: "", // filled per pass below
        status: "pending",
      };
    });

    // ── Stufe B: HEAD-probe inputs once before paying Sync.so ────────────
    const audioUrls = builtPasses.map((p) => p.audio_url);
    const probes = await Promise.all([
      probeAsset(sourceClipUrl, "video", 50_000),
      ...audioUrls.map((u) => probeAsset(u, "audio", 5_000)),
    ]);
    const videoProbe = probes[0];
    const audioProbes = probes.slice(1);
    const badProbe =
      (!videoProbe.ok ? `video:${videoProbe.error}` : null) ??
      audioProbes
        .map((p, i) => (p.ok ? null : `audio[${i}]:${p.error}`))
        .find(Boolean);
    if (badProbe && !isAdvance) {
      console.error(
        `[compose-dialog-segments] scene=${sceneId} PREFLIGHT BLOCK ${badProbe}`,
      );
      const { data: w0 } = await supabase
        .from("wallets").select("balance").eq("user_id", userId).single();
      await supabase
        .from("wallets")
        .update({
          balance: Number(w0?.balance ?? 0) + totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `syncso_segments_preflight_${badProbe}`,
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_source_kind: "segments", video_url: sourceClipUrl,
        sync_status: "PREFLIGHT_BLOCKED",
        error_class: badProbe.startsWith("video") ? "video_head_fail" : "audio_head_fail",
        error_message: badProbe,
      });
      return json({ error: "preflight_failed", details: badProbe, refunded: totalCost }, 422);
    }

    // ── Deep audio preflight: Sync.so often reports only "unknown error" for
    // malformed, silent, or shorter-than-video WAV inputs. Validate the real
    // bytes before dispatch so failures become actionable and refundable here.
    const audioDiagnostics = await Promise.all(
      builtPasses.map(async (p) => {
        try {
          const diag = await inspectSpeakerAudio(p.audio_url);
          const durMismatch = diag.wav.durSec + 0.35 < totalSec;
          const silent = diag.vad.voicedSec < 0.15 && diag.vad.longestVoicedRun < 0.12;
          return { pass: p.idx, speaker: p.speaker_name, ok: !durMismatch && !silent, durMismatch, silent, ...diag };
        } catch (err) {
          return { pass: p.idx, speaker: p.speaker_name, ok: false, error: (err as Error).message };
        }
      }),
    );
    const badAudio = audioDiagnostics.find((d: any) => !d.ok) as any;
    if (badAudio) {
      const reason = badAudio.error
        ? `audio_invalid_${badAudio.error}`
        : badAudio.silent
          ? "audio_silent_no_voice_detected"
          : `audio_too_short_${Number(badAudio.wav?.durSec ?? 0).toFixed(2)}s_expected_${totalSec}s`;
      console.error(`[compose-dialog-segments] scene=${sceneId} AUDIO PREFLIGHT BLOCK ${reason}`);
      const alreadyRefunded = !!(existing as any)?.refunded;
      if (!alreadyRefunded) {
        const { data: w0 } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({ balance: Number(w0?.balance ?? 0) + totalCost, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
      }
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...(existing ?? {}),
            version: 5,
            engine: "sync-segments",
            status: "failed",
            cost_credits: Number((existing as any)?.cost_credits ?? totalCost),
            refunded: !alreadyRefunded,
            error: reason,
            audio_diagnostics: audioDiagnostics,
            finished_at: new Date().toISOString(),
          },
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `syncso_audio_preflight_${reason}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "PREFLIGHT_BLOCKED", error_class: "audio_invalid",
        error_message: reason,
        meta: { audio_diagnostics: audioDiagnostics, expected_total_sec: totalSec },
      });
      return json({ error: "audio_preflight_failed", reason, refunded: alreadyRefunded ? 0 : totalCost }, 422);
    }

    // ── Face-gate per pass (one frame check per speaker's first turn) ────
    // For 1- and 2-speaker scenes: keep the legacy "any face visible" check
    // unchanged (those flows were stable). For 3+ speakers we additionally
    // validate that a face actually exists at the per-speaker target
    // coordinates BEFORE paying Sync.so — otherwise Sync.so returns the
    // opaque "An unknown error occurred." and burns credits / time.
    if (!isAdvance) {
      // v37 — If the anchor faceMap returned identity matches for every
      // speaker (i.e. Gemini Vision confidently mapped each character_id to
      // a face box on the anchor image), trust those coordinates and skip
      // the strict per-frame plate face-check. Sync.so's ActiveSpeaker DTO
      // operates on `frame_number + coordinates` in plate-pixel space — it
      // does NOT require that the same face be re-detected via Gemini at
      // that exact frame. The strict check was producing false-negative
      // `plate_target_face_missing_*` blocks even when all three speakers
      // were clearly visible in the plate, because Gemini's per-frame face
      // detection sometimes only locks onto the most prominent face. See:
      // https://sync.so/docs/developer-guides/speaker-selection
      const allIdentityMatched =
        speakers.length >= 3 &&
        coordSources.length === speakers.length &&
        coordSources.every((s) => s === "identity");
      const strictTargetCheck = speakers.length >= 3 && !!plateDims && !allIdentityMatched;
      if (allIdentityMatched) {
        console.log(
          `[compose-dialog-segments] scene=${sceneId} face-gate SOFT-PASS — all ${speakers.length} speakers identity-matched on anchor; relying on Sync.so ASD with frame_number+coordinates`,
        );
      }
      for (const pass of builtPasses) {
        const firstTurn = pass.segments[0];
        if (!firstTurn) continue;
        const frames = strictTargetCheck
          ? frameCandidatesForTurn(firstTurn, totalSec, ASSUMED_FPS)
          : uniqueSortedFrames([((firstTurn.startTime + firstTurn.endTime) / 2) * ASSUMED_FPS]);
        let accepted = false;
        let lastValidation: any = null;
        for (const frame of frames) {
          let targetCoordsForCheck: [number, number] | null = null;
          if (strictTargetCheck && plateDims) {
            const c = pass.coords;
            if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
              targetCoordsForCheck = [
                Math.min(1, Math.max(0, Number(c[0]) / plateDims.width)),
                Math.min(1, Math.max(0, Number(c[1]) / plateDims.height)),
              ];
            }
          }
          const v = await validateFrameFace({
            supabaseUrl, serviceKey,
            videoUrl: sourceClipUrl,
            frameNumber: frame, fps: ASSUMED_FPS,
            targetCoords: targetCoordsForCheck,
          });
          lastValidation = { ...v, frame, targetCoordsForCheck };
          if (v.ok && !v.faceVisible) continue;
          if (!strictTargetCheck || v.coordsMatch !== false) {
            pass.reference_frame_number = frame;
            accepted = true;
            break;
          }
          const faceBoxes = Array.isArray(v.faceBoxes) ? [...v.faceBoxes] : [];
          const sortedBoxes = faceBoxes
            .filter((b: any) => Number(b?.w) > 0.02 && Number(b?.h) > 0.02)
            .sort((a: any, b: any) => Number(a.x) - Number(b.x));
          // v36: For 3+ speaker scenes we MUST NOT silently collapse a
          // missing speaker slot onto an existing face (slot=0 fallback).
          // That mapped two speakers to the same face → Sync.so animated
          // only one, the others stayed silent → the user saw a video
          // where 1 of 3 characters lip-synced. Require that the plate
          // actually contains enough distinct faces for the speaker index.
          const enoughFaces = sortedBoxes.length >= Math.max(1, speakers.length);
          const speakerHasOwnSlot = pass.speaker_idx < sortedBoxes.length;
          const canRepair = speakerHasOwnSlot && (speakers.length < 3 || enoughFaces);
          const slot = canRepair ? pass.speaker_idx : -1;
          const box = slot >= 0 ? sortedBoxes[slot] : null;
          if (box && plateDims) {
            const repaired: [number, number] = [
              Math.round((Number(box.x) + Number(box.w) / 2) * plateDims.width),
              Math.round((Number(box.y) + Number(box.h) * 0.45) * plateDims.height),
            ];
            const original = pass.coords;
            pass.coords = clampSyncCoords(repaired);
            pass.reference_frame_number = frame;
            pass.face_repair = {
              source: "plate_frame_left_to_right",
              frame_number: frame,
              original_coords: original,
              repaired_coords: pass.coords,
              face_count: sortedBoxes.length,
              slot,
            };
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} FACE-GATE REPAIR pass=${pass.idx} speaker=${pass.speaker_name} frame=${frame} original=${JSON.stringify(original)} repaired=${JSON.stringify(pass.coords)} faces=${sortedBoxes.length}`,
            );
            accepted = true;
            break;
          }
        }
        if (!accepted) {
          const hadFaces = !!lastValidation?.faceVisible;
          const reason = strictTargetCheck && hadFaces
            ? `plate_target_face_missing_pass_${pass.idx}_speaker_${pass.speaker_name}`
            : `face_validation_failed_pass_${pass.idx}_frame_${lastValidation?.frame ?? frames[0] ?? 0}`;
          console.error(
            `[compose-dialog-segments] scene=${sceneId} FACE-GATE BLOCK pass=${pass.idx} speaker=${pass.speaker_name} reason=${reason} frames=${frames.join(",")}`,
          );
          const { data: w0 } = await supabase
            .from("wallets").select("balance").eq("user_id", userId).single();
          await supabase
            .from("wallets")
            .update({
              balance: Number(w0?.balance ?? 0) + totalCost,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
          await supabase
            .from("composer_scenes")
            .update({
              lip_sync_status: "failed",
              twoshot_stage: "failed",
              clip_error: reason,
            })
            .eq("id", sceneId);
          return json(
            {
              error: strictTargetCheck && hadFaces ? "plate_target_face_missing" : "face_validation_failed",
              details: strictTargetCheck && hadFaces
                ? `target face for ${pass.speaker_name} is not reliably visible on the final scene plate — re-render with all faces in frame`
                : `no face for ${pass.speaker_name} in tested frames`,
              refunded: totalCost,
              hint: strictTargetCheck && hadFaces ? "re_render_scene_clip" : "switch_to_cinematic_sync_engine",
            },
            422,
          );
        }
      }
    }


    // ── Concurrency guard ────────────────────────────────────────────────
    const MAX_INFLIGHT = 3;
    const inflightCount = await countInflightSyncJobs(supabase, 10);
    if (inflightCount >= MAX_INFLIGHT) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} DEFER inflight=${inflightCount}/${MAX_INFLIGHT}`,
      );
      // Only refund on initial dispatch (advance path keeps the existing charge).
      if (!isAdvance && !isRetry) {
        const { data: wDef } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({
            balance: Number(wDef?.balance ?? 0) + totalCost,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
      const jitterMs = 5_000 + Math.floor(Math.random() * 10_000);
      // For advance/retry (fan-out): leave the scene in `running` with the
      // existing dialog_shots untouched. The pass row keeps status='pending'
      // and the lipsync-watchdog poller will dispatch it when a Sync.so slot
      // frees. Previously we wrote `syncso_segments_advance_deferred` here
      // which the client filter never advanced — pending passes hung forever.
      if (isAdvance || isRetry) {
        await supabase
          .from("composer_scenes")
          .update({
            // Status unchanged. Just touch updated_at + leave a soft marker
            // so we can debug from clip_error without changing routing.
            clip_error: `syncso_concurrency_deferred:${inflightCount}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
      } else {
        await supabase
          .from("composer_scenes")
          .update({
            lip_sync_status: "pending",
            twoshot_stage: "deferred",
            clip_error: `syncso_concurrency_deferred:${inflightCount}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
      }
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "DEFERRED", error_class: "rate_limited",
        error_message: `inflight ${inflightCount} >= ${MAX_INFLIGHT}`,
        meta: { inflight_count: inflightCount, retry_in_ms: jitterMs, is_advance: isAdvance, is_retry: isRetry },
      });
      return json(
        { ok: false, status: "deferred", inflight: inflightCount, retry_in_ms: jitterMs },
        202,
      );
    }

    // ── Determine which pass to dispatch (v25 Fan-Out) ───────────────────
    // CRITICAL: every pass uses the ORIGINAL source plate as input. We no
    // longer feed pass N-1's Sync.so output back into Sync.so for pass N —
    // that's exactly what caused the "An unknown error occurred." failures
    // on pass 2+ (Sync.so lipsync-2-pro rejects its own redirected outputs
    // in coords-pro mode). Instead, every pass produces a full-frame
    // lipsync of its own speaker on the pristine plate; the final compositor
    // (render-sync-segments-audio-mux) overlays them via face-mask circles.
    const prevState = (existing && (existing as any).version === 5) ? (existing as SegmentsState) : null;
    let passes: PassState[];
    let currentPassIdx: number;
    const passInputUrl: string = sourceClipUrl;

    if (isAdvance && prevState?.passes && typeof prevState.current_pass === "number") {
      // Webhook fan-in advance: dispatch the next pending pass (or the
      // explicitly requested one). Each pass is independent of all others.
      passes = prevState.passes.map((p) => ({ ...p }));
      const requested = Number(body?.pass_idx);
      if (Number.isFinite(requested) && requested >= 0 && requested < passes.length) {
        currentPassIdx = requested;
      } else {
        // Pick first pending/failed-without-job pass, else advance the cursor.
        const pendingIdx = passes.findIndex((p) => p.status === "pending" && !p.job_id);
        currentPassIdx = pendingIdx >= 0 ? pendingIdx : prevState.current_pass;
      }
      if (!passes[currentPassIdx]) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} advance but no pass at idx=${currentPassIdx}`);
        return json({ ok: true, skipped: "no_pass_at_cursor" }, 200);
      }
      if (passes[currentPassIdx].status === "done" || passes[currentPassIdx].status === "rendering") {
        return json({ ok: true, skipped: `pass_${currentPassIdx}_already_${passes[currentPassIdx].status}` }, 200);
      }
    } else if (isRetry && prevState?.passes && typeof prevState.current_pass === "number") {
      // Retry the same pass that just failed — still against original plate.
      passes = prevState.passes.map((p) => ({ ...p }));
      const requested = Number(body?.pass_idx);
      currentPassIdx = Number.isFinite(requested) && requested >= 0 && requested < passes.length
        ? requested
        : prevState.current_pass;
    } else {
      // Fresh dispatch: start at pass 0.
      passes = builtPasses;
      currentPassIdx = 0;
    }


    const pass = passes[currentPassIdx];
    pass.input_url = passInputUrl;
    pass.status = "rendering";
    pass.started_at = new Date().toISOString();

    // ── v40 — Canonical audio restore (FIX for v39 retry bug) ────────────
    // v39 bug: the first dispatch overwrote `pass.audio_url` with the
    // sliced "tight" WAV (turn-only, ~3.27s). On retry the cloned pass
    // still pointed at that tight URL, so the v39 slicer tried to cut
    // ABSOLUTE windows like [3.81, 7.082] out of a 3.27s file → throws
    // "sliceWav: no valid windows" → falls back to FULL-LENGTH path which
    // then sends `segments_secs:[[3.81,7.082]]` on the video input plus
    // the still-mutated 3.27s tight audio → Sync.so returns the opaque
    // "An unknown error occurred" because audio length and animation
    // window are incompatible.
    //
    // Fix: ALWAYS restore the canonical full-length per-speaker WAV from
    // `audio_url_full` before re-slicing. Also clear stale `audio_tight`
    // so the downstream slicer either rebuilds it cleanly or — if slicing
    // fails — falls back to the genuinely full-length audio (which IS
    // compatible with `segments_secs`).
    const canonicalAudioUrl = String(
      (pass as any).audio_url_full ?? pass.audio_url ?? "",
    );
    if (canonicalAudioUrl && canonicalAudioUrl !== pass.audio_url) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v40_restore_canonical_audio from=…${String(pass.audio_url).slice(-60)} to=…${canonicalAudioUrl.slice(-60)}`,
      );
    }
    if (canonicalAudioUrl) pass.audio_url = canonicalAudioUrl;
    (pass as any).audio_tight = null;

    // Each pass targets a DIFFERENT face with its own validated coords. Never
    // inherit a fallback variant from a sibling pass — that would drop the
    // coords for speakers 2+ and let Sync.so re-detect speaker 0 (causing
    // speakers 2 and 3 to stay frozen). The per-pass fallback ladder
    // (coords-pro → auto-pro → auto-standard) is still applied inside
    // sync-so-webhook on actual provider failures for THIS pass only.
    const retryVariant: RetryVariant = isRetry
      ? (requestedRetryVariant ?? (prevState?.passes?.[currentPassIdx]?.retry_variant as RetryVariant | undefined) ?? "coords-pro")
      : "coords-pro";

    const diagnosticId = `${sceneId}:${currentPassIdx + 1}:${retryVariant}:${crypto.randomUUID()}`;
    pass.retry_variant = retryVariant;
    pass.diagnostic_id = diagnosticId;

    // ── v33: Audio lead-in trim DISABLED for v25 fan-out passes ──────────
    // Each per-speaker WAV is silence-padded to the FULL plate duration so
    // its absolute timeline matches the 9s scene plate. Trimming the lead-in
    // (v28/v29 logic) shifted the voice forward by 2.5-4s, so Sync.so saw a
    // video where the active speaker's mouth opens at t=3s while the audio
    // says them speaking at t=0s. With `sync_mode=cut_off` that mismatch
    // routinely produces the opaque "An unknown error occurred." failures
    // we have been chasing for days. We keep the diagnostic log so we can
    // see when a track HAS a long lead-in (now informational only).
    const passDiag = audioDiagnostics.find((d: any) => d.pass === pass.idx) as any;
    const detectedLeadIn = Number(passDiag?.wav?.leadInSec ?? 0);
    if (Number.isFinite(detectedLeadIn) && detectedLeadIn > 0.3) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} leadIn=${detectedLeadIn.toFixed(2)}s (preserved — timeline must match full plate)`,
      );
    }
    if (repairAudio) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} repair_audio requested — re-encoding WAV without trimming timeline`,
      );
      try {
        const rawAudio = await fetch(pass.audio_url, { signal: AbortSignal.timeout(30_000) });
        if (rawAudio.ok) {
          const repaired = normalizeWav(new Uint8Array(await rawAudio.arrayBuffer()), {
            leadInSec: 0,
            minTotalSec: totalSec,
            peakDbFs: -1,
            forceMono: true,
            targetLufs: -16,
          });
          const repairPath = `${userId}/twoshot-vo/${sceneId}-pass-${pass.idx + 1}-repair-${Date.now()}.wav`;
          const up = await supabase.storage.from("voiceover-audio").upload(
            repairPath,
            repaired.bytes,
            { contentType: "audio/wav", upsert: true },
          );
          if (!up.error) {
            const { data: pub } = supabase.storage.from("voiceover-audio").getPublicUrl(repairPath);
            if (pub?.publicUrl) {
              pass.audio_url = pub.publicUrl;
              (pass as any).audio_repair = {
                source_url: passDiag?.pass != null ? "speaker_track" : "unknown",
                repaired_url: pub.publicUrl,
                dur_sec: repaired.info.durSec,
                peak_dbfs: repaired.info.peakDbFs,
                lead_in_sec: repaired.info.leadInSec,
              };
              console.log(`[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} repair_audio uploaded ${repairPath}`);
            }
          } else {
            console.warn(`[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} repair_audio upload failed: ${up.error.message}`);
          }
        }
      } catch (err) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} repair_audio failed: ${(err as Error)?.message ?? err}`);
      }
    }



    // ── Build per-pass Sync.so payload ───────────────────────────────────
    // v38 — Per-Turn Tight-Window Lip-Sync (Sync.so-konform):
    //   • frame_number = TURN START (not midpoint) — midpoint anchoring was
    //     pushing speaker N's mouth animation forward into speaker N+1's
    //     voiced window.
    //   • segments_secs on the video input restricts Sync.so animation to
    //     this speaker's turn windows ONLY. Outside the windows the original
    //     plate pixels are preserved → no cross-speaker leakage, even when
    //     the per-speaker WAV is silence-padded across the full plate.
    //     https://sync.so/docs/api-reference/endpoints/generate
    const firstTurn = pass.segments[0];
    const turnStartSec = firstTurn ? Math.max(0, firstTurn.startTime) : 0;
    const turnEndSec = firstTurn ? Math.min(totalSec, firstTurn.endTime) : totalSec;
    const startFrame = Math.max(0, Math.floor(turnStartSec * ASSUMED_FPS));
    const referenceFrameNumber = Number.isFinite(pass.reference_frame_number)
      ? Math.max(0, Math.round(Number(pass.reference_frame_number)))
      : startFrame;
    // Union of all turn windows for THIS speaker (a speaker may have multiple
    // turns; each becomes its own [start, end] entry inside segments_secs).
    // Small 0.08s pad both sides keeps consonant onsets/offsets natural.
    const SEG_PAD = 0.08;
    const speakerWindowsSecs: Array<[number, number]> = (pass.segments ?? [])
      .map((t) => {
        const s = Math.max(0, Number(t.startTime) - SEG_PAD);
        const e = Math.min(totalSec, Number(t.endTime) + SEG_PAD);
        return [Number(s.toFixed(3)), Number(e.toFixed(3))] as [number, number];
      })
      .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s + 0.05);

    // ── v39 — Per-Turn Tight WAV ─────────────────────────────────────────
    // For multi-speaker scenes we slice this pass's silence-padded WAV down
    // to ONLY the speaker's voiced turn windows. Sync.so then receives an
    // audio file that equals the turn duration; with `sync_mode=cut_off`
    // the output video is naturally cut to that length and animation starts
    // at output-t=0. The Remotion compositor can replay it at the original
    // absolute timeline with a plain `<Sequence from={turnStart}>` and NO
    // `startFrom` seek — making the pipeline INDEPENDENT of the deployed
    // Lambda bundle version (v38 needed a bundle-redeploy; v39 doesn't).
    let tightAudioInfo: { url: string; durSec: number } | null = null;
    if (passes.length >= 2 && speakerWindowsSecs.length > 0) {
      try {
        const wavResp = await fetch(pass.audio_url, { signal: AbortSignal.timeout(30_000) });
        if (!wavResp.ok) throw new Error(`fetch ${wavResp.status}`);
        const wavBytes = new Uint8Array(await wavResp.arrayBuffer());
        const sliced = sliceWavToWindows(
          wavBytes,
          speakerWindowsSecs.map(([s, e]) => ({ startSec: s, endSec: e })),
          { gapSec: 0.05 },
        );
        const tightPath = `${userId}/twoshot-vo/${sceneId}-pass-${pass.idx + 1}-tight-${Date.now()}.wav`;
        const up = await supabase.storage.from("voiceover-audio").upload(
          tightPath,
          sliced.bytes,
          { contentType: "audio/wav", upsert: true },
        );
        if (up.error) throw new Error(`upload: ${up.error.message}`);
        const { data: pub } = supabase.storage.from("voiceover-audio").getPublicUrl(tightPath);
        if (!pub?.publicUrl) throw new Error("publicUrl missing");
        (pass as any).audio_url_full = pass.audio_url;
        pass.audio_url = pub.publicUrl;
        (pass as any).audio_tight = {
          url: pub.publicUrl,
          dur_sec: Number(sliced.durSec.toFixed(3)),
          windows_secs: speakerWindowsSecs,
        };
        tightAudioInfo = { url: pub.publicUrl, durSec: sliced.durSec };
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v39_tight_audio dur=${sliced.durSec.toFixed(2)}s windows=${JSON.stringify(speakerWindowsSecs)} url=${pub.publicUrl.slice(0, 80)}`,
        );
      } catch (sliceErr) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v39_tight_audio_failed: ${(sliceErr as Error)?.message} — falling back to full-length WAV + segments_secs`,
        );
      }
    }

    const syncOptions: Record<string, unknown> = {
      // cut_off = "cut to shortest input length". With v39 tight audio the
      // per-speaker WAV equals the turn duration, so output is naturally tight.
      sync_mode: "cut_off",
    };
    if (retryVariant === "coords-pro" || retryVariant === "sync3-coords") {
      // Sync.so canonical ActiveSpeaker DTO (per
      // https://sync.so/docs/developer-guides/speaker-selection):
      // frame_number = a frame WHERE THE SPEAKER IS VISIBLE. We anchor on
      // the turn-start frame so the mouth animation begins where the audio
      // begins. sync-3 accepts the same shape but tolerates static/occluded
      // faces that lipsync-2-pro rejects with "An unknown error occurred."
      syncOptions.active_speaker_detection = {
        auto_detect: false,
        frame_number: referenceFrameNumber,
        coordinates: clampSyncCoords(pass.coords),
      };
    } else if (retryVariant === "coords-pro-box") {
      // v31 — Prefer the REAL face bounding box from the resolved faceMap
      // (anchor-space) and rescale to plate-space. Falls back to a synthetic
      // box around `pass.coords` only when no faceMap match exists.
      const dims = plateDims ?? videoDims;
      let box: [number, number, number, number] | null = null;
      let bboxSource = "synthetic";
      const fmFaces: any[] = Array.isArray((faceMap as any)?.faces)
        ? (faceMap as any).faces
        : [];
      const matchedFace =
        fmFaces.find((f) => f?.characterId && f.characterId === pass.character_id) ??
        fmFaces.find((f) => Number(f?.slotIndex) === Number(pass.speaker_idx)) ??
        null;
      const fmW = Number((faceMap as any)?.width) || dims.width;
      const fmH = Number((faceMap as any)?.height) || dims.height;
      if (
        matchedFace &&
        Array.isArray(matchedFace.bbox) &&
        matchedFace.bbox.length === 4 &&
        fmW > 0 && fmH > 0
      ) {
        const [bx1, by1, bx2, by2] = matchedFace.bbox.map((n: any) => Number(n));
        const sx = dims.width / fmW;
        const sy = dims.height / fmH;
        const padX = (bx2 - bx1) * 0.15;
        const padY = (by2 - by1) * 0.15;
        const x1 = Math.max(0, Math.round((bx1 - padX) * sx));
        const y1 = Math.max(0, Math.round((by1 - padY) * sy));
        const x2 = Math.min(dims.width, Math.round((bx2 + padX) * sx));
        const y2 = Math.min(dims.height, Math.round((by2 + padY) * sy));
        if (x2 > x1 + 4 && y2 > y1 + 4) {
          box = [x1, y1, x2, y2];
          bboxSource = `facemap:${matchedFace.matchSource ?? "unknown"}`;
        }
      }
      if (!box) {
        const [cx, cy] = pass.coords ?? [Math.round(dims.width / 2), Math.round(dims.height / 2)];
        const boxW = Math.round(dims.width * 0.18);
        const boxH = Math.round(dims.height * 0.28);
        const x1 = Math.max(0, Math.round(cx - boxW / 2));
        const y1 = Math.max(0, Math.round(cy - boxH / 2));
        const x2 = Math.min(dims.width, Math.round(cx + boxW / 2));
        const y2 = Math.min(dims.height, Math.round(cy + boxH / 2));
        box = [x1, y1, x2, y2];
      }
      const frameCount = Math.max(1, Math.ceil(totalSec * ASSUMED_FPS));
      const boundingBoxes: (number[] | null)[] = new Array(frameCount).fill(box);
      syncOptions.active_speaker_detection = {
        auto_detect: false,
        bounding_boxes: boundingBoxes,
      };
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} BBOX_ASD speaker=${pass.speaker_name} box=${JSON.stringify(box)} source=${bboxSource} frames=${frameCount}`,
      );

    } else {
      syncOptions.active_speaker_detection = { auto_detect: true };
    }
    const diagnosticWebhookUrl = `${webhookUrl}&diagnostic_id=${encodeURIComponent(diagnosticId)}`;
    // v37 — model picked per variant. sync-3 is Sync.so's recommended model
    // for difficult plates (static/occluded/multi-speaker); lipsync-2-pro
    // remains the default for first-pass quality.
    const payloadModel =
      retryVariant === "sync3-coords"
        ? SYNC3_MODEL
        : retryVariant === "auto-standard"
          ? LIPSYNC_FALLBACK_MODEL
          : LIPSYNC_MODEL;

    // v38/v39 — Restrict animation window via segments_secs ONLY when the
    // tight-audio slicer failed (fallback path). With v39 tight audio
    // active, the audio itself equals the turn duration so segments_secs
    // becomes redundant and we omit it to avoid double-cutting issues.
    const videoInput: Record<string, unknown> = { type: "video", url: passInputUrl };
    if (passes.length >= 2 && speakerWindowsSecs.length > 0 && !tightAudioInfo) {
      videoInput.segments_secs = speakerWindowsSecs;
    }
    const payload: Record<string, unknown> = {
      model: payloadModel,
      input: [
        videoInput,
        { type: "audio", url: pass.audio_url },
      ],
      options: syncOptions,
      webhookUrl: diagnosticWebhookUrl,
      webhook_url: diagnosticWebhookUrl,
    };
    console.log(
      `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v39_tight=${tightAudioInfo ? `${tightAudioInfo.durSec.toFixed(2)}s` : "fallback_full+segments"} windows=${JSON.stringify(speakerWindowsSecs)} turnStartFrame=${startFrame}`,
    );

    // ── Length sanity log ────────────────────────────────────────────────
    // compose-twoshot-audio writes mono 16-bit WAV @ 44.1kHz → ~88200 bytes/sec
    // (+ 44 byte header). Use the audio probe's Content-Length to estimate the
    // per-speaker track duration and warn loudly if it's shorter than the
    // scene plate — that's the classic "video stops mid-way" cause because
    // Sync.so cut_off trims to the shorter input.
    const WAV_BYTES_PER_SEC = 44100 * 1 * 2;
    const audioProbeIdx = passSpeakers.findIndex(({ originalIdx }) => originalIdx === pass.speaker_idx);
    const audioProbeBytes = audioProbeIdx >= 0 ? (audioProbes[audioProbeIdx]?.bytes ?? 0) : 0;
    const audioApproxSec = audioProbeBytes > 44
      ? Math.round(((audioProbeBytes - 44) / WAV_BYTES_PER_SEC) * 100) / 100
      : null;
    const videoBytes = videoProbe?.bytes ?? 0;
    const lengthMismatch =
      audioApproxSec !== null && audioApproxSec + 0.5 < totalSec;
    if (lengthMismatch) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} LENGTH_MISMATCH pass=${currentPassIdx + 1} ` +
        `audio≈${audioApproxSec}s < expected ${totalSec}s — Sync.so will truncate output. ` +
        `Re-run compose-twoshot-audio to re-pad per-speaker tracks.`,
      );
    }
    console.log(
      `[compose-dialog-segments] scene=${sceneId} DISPATCH pass=${currentPassIdx + 1}/${passes.length} ` +
      `speaker=${pass.speaker_name} coords=${JSON.stringify(pass.coords)} ` +
      `totalSec=${totalSec} audio≈${audioApproxSec}s videoBytes=${videoBytes} ` +
      `variant=${retryVariant} model=${payload.model} diagnostic=${diagnosticId} ` +
      `frame=${referenceFrameNumber} sync_mode=cut_off input=${passInputUrl.slice(0, 80)} audio=${pass.audio_url.slice(0, 80)}`,
    );

    const resp = await fetch(`${SYNC_API_BASE}/generate`, {
      method: "POST",
      headers: { "x-api-key": syncApiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      console.error(
        `[compose-dialog-segments] scene=${sceneId} dispatch FAILED pass=${currentPassIdx} status=${resp.status} body=${errTxt.slice(0, 600)}`,
      );
      // Refund only if no previous pass succeeded (i.e. this is pass 0 fresh
      // dispatch) — if a later pass fails, we still refund the full cost since
      // the partial output is unusable.
      const alreadyRefunded = !!(prevState as any)?.refunded;
      if (!alreadyRefunded) {
        const { data: w2 } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({
            balance: Number(w2?.balance ?? 0) + totalCost,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
      pass.status = "failed";
      pass.error = `dispatch_${resp.status}:${errTxt.slice(0, 200)}`;
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...(prevState ?? {}),
            version: 5,
            engine: "sync-segments",
            status: "failed",
            passes,
            current_pass: currentPassIdx,
            total_passes: passes.length,
            multi_pass: passes.length > 1,
            source_clip_url: sourceClipUrl,
            total_sec: totalSec,
            segments: pass.segments,
            cost_credits: totalCost,
            refunded: !alreadyRefunded,
            error: pass.error,
            finished_at: new Date().toISOString(),
          },
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `syncso_segments_dispatch_${resp.status}`,
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_source_kind: "segments", video_url: passInputUrl,
        http_status: resp.status, sync_status: "DISPATCH_FAILED",
        error_class: classifySyncError(errTxt),
        error_message: errTxt.slice(0, 500),
        meta: { diagnostic_id: diagnosticId, retry_variant: retryVariant, pass_idx: currentPassIdx, total_passes: passes.length, payload_summary: payload },
      });
      await recordCircuitFailure(supabase, "sync.so", classifySyncError(errTxt));
      return json(
        { error: "syncso_dispatch_failed", status: resp.status, body: errTxt.slice(0, 400) },
        502,
      );
    }

    const data = await resp.json();
    const shape = validateSyncResponseShape(data);
    if (!shape.ok) {
      console.error(
        `[compose-dialog-segments] scene=${sceneId} SCHEMA_DRIFT missing=${shape.missingKeys.join(",")}`,
      );
      await emitSystemAlert(supabase, {
        alert_type: "syncso_schema_drift", severity: "critical", source: "sync.so",
        message: `Sync.so /generate response missing keys: ${shape.missingKeys.join(", ")}`,
        payload: { missing_keys: shape.missingKeys, sample: data },
      });
      return json({ error: "schema_drift", missing: shape.missingKeys }, 502);
    }
    const jobId = String(data.id ?? "");
    if (!jobId) {
      return json({ error: "no_job_id" }, 502);
    }

    await registerInflightSyncJob(supabase, {
      job_id: jobId, user_id: userId, scene_id: sceneId, engine: "sync-segments",
    });
    await recordCircuitSuccess(supabase, "sync.so");

    pass.job_id = jobId;
    passes[currentPassIdx] = pass;

    const nowIso = new Date().toISOString();
    const state: SegmentsState = {
      version: 5,
      engine: "sync-segments",
      status: "rendering",
      multi_pass: passes.length > 1,
      passes,
      current_pass: currentPassIdx,
      total_passes: passes.length,
      sync_job_id: jobId,
      source_clip_url: sourceClipUrl,
      total_sec: totalSec,
      segments: pass.segments,
      cost_credits: isRetry || isAdvance ? Number(prevState?.cost_credits ?? totalCost) : totalCost,
      refunded: false,
      started_at: prevState?.first_started_at ?? prevState?.started_at ?? nowIso,
      first_started_at: prevState?.first_started_at ?? prevState?.started_at ?? nowIso,
      retry_count: Number(prevState?.retry_count ?? 0),
      retry_variant: retryVariant,
      fallback_history: prevState?.fallback_history ?? [],
      last_diagnostic_id: diagnosticId,
      final_url: null,
      // Plate dims (probed once on pass 0) — render-sync-segments-audio-mux
      // uses these for the Lambda canvas; multi-speaker fix uses them so
      // pickSpeakerCoordinates produces plate-space coords.
      video_width: videoDims.width,
      video_height: videoDims.height,
    } as SegmentsState;

    await logSyncDispatch(supabase, {
      scene_id: sceneId, user_id: userId, engine: "sync-segments",
      job_id: jobId, sync_source_kind: "segments",
      video_url: passInputUrl,
      video_bytes: videoProbe.bytes,
      video_content_type: videoProbe.contentType,
      window_start_sec: 0, window_end_sec: totalSec,
      http_status: resp.status, sync_status: "DISPATCHED",
      meta: {
        diagnostic_id: diagnosticId,
        pass_idx: currentPassIdx,
        total_passes: passes.length,
        speaker: pass.speaker_name,
        character_id: pass.character_id,
        coords: pass.coords,
          reference_frame_number: referenceFrameNumber,
          face_repair: pass.face_repair ?? null,
          audio_repair: (pass as any).audio_repair ?? null,
        retry_variant: retryVariant,
        model: payload.model,
        is_retry: isRetry,
        is_advance: isAdvance,
        face_map_source: faceMap?.source ?? null,
        sync_mode: "cut_off",
        audio_approx_sec: audioApproxSec,
        expected_total_sec: totalSec,
        length_mismatch: lengthMismatch,
        audio_probe: audioProbes[audioProbeIdx] ?? null,
        video_probe: videoProbe,
        audio_diagnostics: audioDiagnostics.find((d) => d.pass === pass.idx) ?? null,
        payload_summary: {
          model: payload.model,
          input_video: passInputUrl,
          audio: pass.audio_url,
          frame_number: referenceFrameNumber,
          coordinates: pass.coords,
          options: payload.options,
        },
      },
    });

    // v29: For retry/advance dispatches, re-read the DB and merge ONLY our
    // pass into the freshest passes[] so a concurrent webhook for a sibling
    // pass can't be overwritten by our stale `passes` snapshot.
    if (isRetry || isAdvance) {
      const { data: freshRow } = await supabase
        .from("composer_scenes")
        .select("dialog_shots")
        .eq("id", sceneId)
        .maybeSingle();
      const freshState: any = (freshRow as any)?.dialog_shots ?? state;
      const freshPasses: any[] = Array.isArray(freshState?.passes)
        ? freshState.passes.map((p: any) => ({ ...p }))
        : passes;
      freshPasses[currentPassIdx] = pass;
      const mergedState: any = {
        ...freshState,
        ...state,
        passes: freshPasses,
        // Preserve fields that may have been advanced by other passes:
        cost_credits: Number(freshState?.cost_credits ?? state.cost_credits ?? totalCost),
        fallback_history: freshState?.fallback_history ?? state.fallback_history ?? [],
      };
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: mergedState,
          lip_sync_status: "running",
          twoshot_stage: passes.length > 1 ? `syncso_pass_${currentPassIdx + 1}_of_${passes.length}` : "syncso_segments",
          lip_sync_source_clip_url: sourceClipUrl,
          replicate_prediction_id: `sync:${jobId}`,
          clip_error: null,
          updated_at: nowIso,
        })
        .eq("id", sceneId);
    } else {
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: state,
          lip_sync_status: "running",
          twoshot_stage: passes.length > 1 ? `syncso_pass_${currentPassIdx + 1}_of_${passes.length}` : "syncso_segments",
          lip_sync_source_clip_url: sourceClipUrl,
          replicate_prediction_id: `sync:${jobId}`,
          clip_error: null,
          updated_at: nowIso,
        })
        .eq("id", sceneId);
    }

    // ── v25 Fan-Out: on fresh dispatch, kick off all remaining passes in
    //    parallel via background self-invokes. Each runs as an independent
    //    Sync.so job against the SAME original plate (no chaining). The
    //    Sync.so 3-slot concurrency guard upstream handles back-pressure.
    // v33: For 3+ speaker scenes, do NOT fan out passes in parallel. The
    // webhook chains the next pass on completion (pendingIdxs[0]), so the
    // pipeline still completes — just one Sync.so job at a time per scene.
    // This eliminates the dispatch race we saw on scene 1a9bf866…: two pass-0
    // jobs within ms, one of which the webhook later reports as
    // "job ... not in passes[]". Two-speaker scenes still fan out (no race
    // reported there).
    const fanOutAllowed = passes.length > 1 && passes.length <= 2;
    if (!isAdvance && !isRetry && fanOutAllowed) {
      for (let i = 1; i < passes.length; i++) {
        const delayMs = i * 250;
        setTimeout(() => {
          fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ scene_id: sceneId, advance: true, pass_idx: i }),
          }).catch((err) =>
            console.warn(`[compose-dialog-segments] fan-out pass=${i} dispatch threw: ${(err as Error).message}`),
          );
        }, delayMs);
      }
      console.log(
        `[compose-dialog-segments] scene=${sceneId} FAN-OUT scheduled ${passes.length - 1} additional passes in parallel`,
      );
    } else if (!isAdvance && !isRetry && passes.length > 2) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} SERIAL mode (${passes.length} speakers) — webhook will chain pass 2..N as pass 1..N-1 complete`,
      );
    }


    return json(
      {
        ok: true,
        status: "rendering",
        scene_id: sceneId,
        sync_job_id: jobId,
        pass: currentPassIdx + 1,
        total_passes: passes.length,
        speaker: pass.speaker_name,
        cost_credits: totalCost,
      },
      202,
    );
  } catch (e) {
    console.error("[compose-dialog-segments] error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  } finally {
    if (lockSupabase && lockSceneId && lockHolder) {
      try {
        await lockSupabase.rpc("release_dialog_lock", {
          _scene_id: lockSceneId,
          _holder: lockHolder,
        });
      } catch (e) {
        console.warn(`[compose-dialog-segments] lock release failed: ${(e as Error)?.message ?? e}`);
      }
    }
  }
});

