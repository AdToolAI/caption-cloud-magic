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
import { resolvePlateFaceIdentities, PlateIdentityFace } from "../_shared/plate-face-identity.ts";
import { validateCast } from "../_shared/cast-validation.ts";
import { failLipSync } from "../_shared/lipsync-fail.ts";
import { withDialogLock } from "../_shared/dialog-lock.ts";
import { renderPassFacePreclip } from "../_shared/pass-face-preclip.ts";





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
// v82 (Phase 2.1) — `bbox-url-pro` is the new PRIMARY for multi-speaker
// dialog when plate-identity is resolved. Uploads a per-frame
// `bounding_boxes` JSON to the `composer-frames` bucket and points
// Sync.so at it via `active_speaker_detection.bounding_boxes_url`.
// Deterministic per-speaker targeting → no more "Lipsync hat keinen
// Avatar getroffen". Falls through the existing ladder on failure.
// v84 (Phase 2.3): unified ladder — `coords-pro-lp2pro` now sits between
// `sync3-coords` and `auto-pro`, matching `V5_RETRY_VARIANTS` in
// sync-so-webhook. Single source of truth for valid variants accepted on
// fresh dispatch (`pass.retry_variant`).
const RETRY_VARIANTS = ["bbox-url-pro", "coords-pro", "coords-pro-box", "sync3-coords", "coords-pro-lp2pro", "auto-pro", "auto-standard"] as const;
type RetryVariant = typeof RETRY_VARIANTS[number];

/**
 * v82 — Uploads a Sync.so-compliant per-frame bounding_boxes JSON to the
 * `composer-frames` bucket and returns its public URL. Schema:
 *   { bounding_boxes: ([x1,y1,x2,y2] | null)[] }   // length === frame count
 * Per https://sync.so/docs/developer-guides/speaker-selection — preferred
 * over inline `bounding_boxes` for long / multi-speaker videos (no payload
 * size limit, no provider-side rejections).
 */
async function uploadBoundingBoxesJson(
  supabase: any,
  params: {
    userId: string;
    projectId: string;
    sceneId: string;
    passIdx: number;
    box: [number, number, number, number];
    frameCount: number;
  },
): Promise<string | null> {
  try {
    const sub = params.projectId || "shared";
    const ts = Date.now();
    const path = `${params.userId}/${sub}/asd/${params.sceneId}-p${params.passIdx + 1}-${ts}.json`;
    const payload = {
      bounding_boxes: new Array(Math.max(1, params.frameCount)).fill(params.box),
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const { error: upErr } = await supabase.storage
      .from("composer-frames")
      .upload(path, blob, {
        contentType: "application/json",
        upsert: true,
        cacheControl: "31536000",
      });
    if (upErr) {
      console.warn(`[compose-dialog-segments] bbox-url upload failed: ${upErr.message}`);
      return null;
    }
    const { data: pub } = supabase.storage.from("composer-frames").getPublicUrl(path);
    return pub?.publicUrl ?? null;
  } catch (e) {
    console.warn(`[compose-dialog-segments] bbox-url upload threw: ${(e as Error).message}`);
    return null;
  }
}

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

/**
 * v71 — transient fetch errors (Supabase Storage hiccup, edge-runtime
 * AbortSignal timeout) used to be misclassified as "audio is invalid" and
 * burned the entire scene. We classify these explicitly so the caller can
 * retry the dispatch later instead of marking the run failed + refunding
 * + wiping the already-successful Sync.so passes that came before.
 */
const TRANSIENT_FETCH_ERROR_RE =
  /signal timed out|timeoutexception|aborterror|the operation was aborted|network|fetch failed|connection (reset|refused|closed)|econnreset|etimedout|eai_again|http_5\d\d/i;
function isTransientFetchError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err ?? "");
  return TRANSIENT_FETCH_ERROR_RE.test(msg);
}

async function inspectSpeakerAudio(url: string) {
  // v71 — single-attempt fetch with longer timeout (60s) so transient
  // storage lag doesn't get reported as "audio invalid". Retries are now
  // owned by the audio-preflight caller, which can treat repeated transient
  // failures as "retry later" instead of a hard refund/wipe.
  const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!resp.ok) throw new Error(`audio_get_${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const wav = inspectWav(bytes);
  const vad = detectVoicedFrames(bytes);
  return { bytes: bytes.byteLength, wav, vad };
}

async function inspectSpeakerAudioWithRetry(url: string, attempts = 3) {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await inspectSpeakerAudio(url);
    } catch (err) {
      lastErr = err;
      if (!isTransientFetchError(err)) throw err;
      // small backoff: 250ms, 750ms
      await new Promise((r) => setTimeout(r, 250 * (i + 1) * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "audio_fetch_failed"));
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
  // v68 — single-face preclip cache (3+ speaker path). When set, dispatch
  // to Sync.so uses preclip_url as input with auto_detect:true; audio-mux
  // overlays the lipsynced crop back at preclip_crop on the master plate.
  preclip_url?: string;
  preclip_render_id?: string;
  preclip_crop?: { x: number; y: number; size: number; outputSize: number };
  preclip_error?: string;
  audio_url_full?: string;
  audio_tight?: { url: string; dur_sec: number; windows_secs: Array<[number, number]>; output_offsets_sec?: number[] };
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
    // v56 — retry without manual ASD (drop optionsOverride.active_speaker_detection)
    // so Sync.so picks the active speaker automatically per segment. Triggered
    // by sync-so-webhook when the v56 manual-point dispatch returns the opaque
    // "An unknown error occurred." (often caused by anchor-derived coords that
    // sit off-face on the actual Hailuo plate).
    const retryNoAsd = body?.retry_no_asd === true;
    // v58 — Multi-speaker fallback. Set by sync-so-webhook after a v56
    // single-call segments dispatch fails with the opaque
    // `provider_unknown_error` on a multi-speaker (≥3) scene. Forces this
    // dispatcher to skip the v56 segments[] path and use the proven v5
    // per-speaker chained-pass pipeline (each pass = ONE Sync.so call with
    // single-coord ASD, output of pass N feeds pass N+1) — the only payload
    // shape that Sync.so accepts reliably for multi-speaker plates.
    const forceMultipass = body?.force_multipass === true;
    if (!sceneId || typeof sceneId !== "string") {
      return json({ error: "scene_id_required" }, 400);
    }
    if (repairAudio) {
      console.log(`[compose-dialog-segments] scene=${sceneId} repair_audio=true (audio re-encode requested by webhook)`);
    }
    if (isV41Retry) {
      console.log(`[compose-dialog-segments] scene=${sceneId} v41_retry=true (single-call segments re-dispatch, no_asd=${retryNoAsd})`);
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

    // ── Plan v72 — Dispatch-attempt breadcrumb ───────────────────────────
    // Emit a lightweight DISPATCH_ATTEMPT_STARTED log right after lock + scene
    // load. Lets the watchdog and ops queries distinguish three states:
    //   1) no row at all                → dispatcher was never reached
    //   2) DISPATCH_ATTEMPT_STARTED only → reached but preflight blocked/crashed
    //   3) DISPATCHED                    → Sync.so was actually called
    // Best-effort; failures are logged but don't block the run.
    try {
      await logSyncDispatch(supabase, {
        scene_id: sceneId,
        user_id: userId,
        engine: "sync-segments",
        sync_status: "DISPATCH_ATTEMPT_STARTED",
        meta: {
          is_retry: isRetry,
          is_advance: isAdvance,
          is_v41_retry: isV41Retry,
          recovery: body?.recovery === true,
          auto: body?.auto === true,
          repair_audio: repairAudio,
          stage_at_entry: (scene as any).twoshot_stage ?? null,
          lip_sync_status_at_entry: (scene as any).lip_sync_status ?? null,
          existing_state_version: (scene as any).dialog_shots?.version ?? null,
          existing_state_status: (scene as any).dialog_shots?.status ?? null,
        },
      });
    } catch (e) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} dispatch_attempt_log_failed: ${(e as Error)?.message ?? e}`,
      );
    }

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
    const existingStatus = String((existing as any)?.status ?? "");
    const existingError = String((existing as any)?.error ?? (scene as any)?.clip_error ?? "");
    const isStaleFailedState =
      !isRetry &&
      !isAdvance &&
      !isV41Retry &&
      existing &&
      (existingStatus === "failed" || /v68|v58|v41|v56|recovery refund|provider_unknown/i.test(existingError));
    if (isStaleFailedState) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} reset_required — refusing stale failed state status=${existingStatus} error=${existingError.slice(0, 160)}`,
      );
      return json(
        {
          error: "reset_required",
          message: "Stale lip-sync failure state detected. Use reset-lipsync-scene before v69 dispatch.",
        },
        409,
      );
    }
    if (
      !isRetry &&
      !isAdvance &&
      !isV41Retry &&
      existing &&
      (
        (existing.version === 5 && existing.engine === "sync-segments") ||
        (existing as any).version === 41 || (existing as any).version === 42 || (existing as any).version === 43 || (existing as any).version === 44 || (existing as any).version === 45 || (existing as any).version === 46 || (existing as any).version === 47 || (existing as any).version === 48 || (existing as any).version === 49 || (existing as any).version === 50 || (existing as any).version === 51 || (existing as any).version === 52 || (existing as any).version === 55 || (existing as any).version === 56
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

    // ── Plate-native identity override (v77) ──────────────────────────────
    // Anchor coords drift 5–15 % vs the rendered Hailuo plate. For multi-
    // speaker scenes that drift routinely lands the Sync.so target on the
    // WRONG face. Detect faces on the ACTUAL plate frame and identity-match
    // against the character portraits, then replace anchor coords with
    // plate-pixel-space coords/bbox per character.
    const speakerPlateBboxes: Array<[number, number, number, number] | null> =
      new Array(speakers.length).fill(null);
    let plateIdentityMap: Awaited<ReturnType<typeof resolvePlateFaceIdentities>> | null = null;
    if (!isAdvance && speakers.length >= 2 && plateDims && sourceClipUrl) {
      try {
        plateIdentityMap = await resolvePlateFaceIdentities({
          supabase,
          sceneId,
          projectId: String((scene as any).project_id ?? ""),
          plateUrl: sourceClipUrl,
          plateWidth: plateDims.width,
          plateHeight: plateDims.height,
          midDurationSec: totalSec,
          characters,
        });
      } catch (err) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} plate-identity resolve threw: ${(err as Error)?.message}`,
        );
      }
    }
    if (plateIdentityMap && plateIdentityMap.faces.length > 0) {
      const byId = new Map<string, PlateIdentityFace>();
      for (const f of plateIdentityMap.faces) {
        if (f.characterId) byId.set(String(f.characterId).toLowerCase(), f);
      }
      // Slot-fallback for any face the identity step couldn't label.
      const unlabeled = plateIdentityMap.faces.filter((f) => !f.characterId);
      speakers.forEach((sp, idx) => {
        const cid = sp.character_id ? String(sp.character_id).toLowerCase() : "";
        let plateFace: PlateIdentityFace | undefined = cid ? byId.get(cid) : undefined;
        let source = "plate-identity";
        if (!plateFace && unlabeled.length > 0) {
          plateFace = unlabeled.find((f) => f.slot === idx) ?? unlabeled[0];
          source = "plate-slot-fallback";
          if (plateFace) unlabeled.splice(unlabeled.indexOf(plateFace), 1);
        }
        if (plateFace) {
          speakerCoords[idx] = [plateFace.center[0], plateFace.center[1]];
          speakerPlateBboxes[idx] = plateFace.bbox;
          coordSources[idx] = source;
        }
      });
      console.log(
        `[compose-dialog-segments] scene=${sceneId} plate-identity faces=${plateIdentityMap.faces.length} ` +
        `resolved=${plateIdentityMap.resolvedCount}/${speakers.length} cached=${plateIdentityMap.cached}`,
      );
    } else if (speakers.length >= 2 && !isAdvance) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} plate-identity unavailable — using anchor-rescale coords (may drift)`,
      );
    }

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
      `plate_identity=${plateIdentityMap ? `${plateIdentityMap.resolvedCount}/${plateIdentityMap.faces.length}` : "off"} ` +
      `speakers=${speakers.length} coords=${JSON.stringify(speakerCoords)} sources=${JSON.stringify(coordSources)}`,
    );

    // ── v87 — Block heuristic centre-grid dispatch (multi-speaker only) ──
    // Root cause of "alle Münder zu" bug (June 9 2026): when Gemini anchor-
    // faces aren't cached yet AND plate-identity resolve fails (e.g. Hailuo
    // MP4 still warming in CDN), every coordSource falls back to "heuristic"
    // / "none" — the safety grid plants y at plate.height * 0.5, which on a
    // portrait plate (faces at y≈0.3) lands mid-torso. Sync.so then animates
    // nothing because there's no face under the coordinate → user sees every
    // speaker with closed mouth. Refuse to dispatch in that state; refund &
    // mark the scene `pending` so the auto-trigger retries once anchor data
    // is available. Hard-fail only after 3 awaiting cycles.
    const coordsAreHeuristicOnly = speakers.length >= 2 && coordSources.every(
      (s) => !s || s === "none" || s === "heuristic",
    );
    if (coordsAreHeuristicOnly && !isAdvance && !isRetry) {
      // Retry counter is persisted inside dialog_shots — composer_scenes has
      // no `meta` column (PostgREST validates select/update keys, so any
      // reference to a missing column hard-fails the request with a 404
      // scene_not_found that masked the real bug for weeks).
      const existingDs = (scene as any)?.dialog_shots ?? {};
      const prevRetryCount = Number(existingDs?.face_detect_retry_count ?? 0);
      const nextRetryCount = prevRetryCount + 1;
      const giveUp = nextRetryCount >= 3;

      // Refund the wallet debit we already took at line ~741.
      const { data: wHeur } = await supabase
        .from("wallets").select("balance").eq("user_id", userId).single();
      await supabase
        .from("wallets")
        .update({
          balance: Number(wHeur?.balance ?? 0) + totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      await supabase
        .from("composer_scenes")
        .update(
          giveUp
            ? {
                lip_sync_status: "failed",
                twoshot_stage: "failed",
                clip_error:
                  "no_face_map_after_3_retries: Gesichts­erkennung für die Plate lieferte keine Treffer. Bitte Plate (Hailuo-Clip) neu rendern oder eine andere Szene wählen.",
                dialog_shots: { ...existingDs, face_detect_retry_count: 0 },
              }
            : {
                lip_sync_status: "pending",
                twoshot_stage: "pending",
                clip_error: `awaiting_face_detection_retry_${nextRetryCount}_of_3`,
                dialog_shots: { ...existingDs, face_detect_retry_count: nextRetryCount },
              },
        )
        .eq("id", sceneId);

      await logSyncDispatch(supabase, {
        scene_id: sceneId,
        user_id: userId,
        engine: "sync-segments",
        sync_status: "HEURISTIC_BLOCKED",
        error_class: "coords_heuristic_unverified",
        error_message: giveUp
          ? `no_face_map_after_3_retries (speakers=${speakers.length}, plate=${plateDims ? `${plateDims.width}x${plateDims.height}` : "probe-failed"})`
          : `awaiting_face_detection_retry_${nextRetryCount}_of_3 (speakers=${speakers.length})`,
        meta: {
          speakers: speakers.length,
          plate_dims: plateDims ?? null,
          face_map_source: faceMap?.source ?? "none",
          face_map_faces: faceMap?.faces?.length ?? 0,
          plate_identity_resolved: plateIdentityMap?.resolvedCount ?? 0,
          retry_count: nextRetryCount,
          gave_up: giveUp,
        },
      });

      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v87 HEURISTIC_BLOCKED ` +
        `speakers=${speakers.length} sources=${JSON.stringify(coordSources)} ` +
        `retry=${nextRetryCount}/3 giveUp=${giveUp} refunded=${totalCost}`,
      );

      return json(
        {
          ok: !giveUp,
          status: giveUp ? "failed" : "awaiting_face_detection",
          error: giveUp ? "no_face_map_after_3_retries" : "awaiting_face_detection_retry",
          message: giveUp
            ? "Face detection still empty after 3 retries — scene marked failed."
            : `Anchor face map not ready yet — refunded ${totalCost} credits and will retry automatically (${nextRetryCount}/3).`,
          retry_count: nextRetryCount,
          refunded: totalCost,
        },
        202,
      );
    }



    // ─────────────────────────────────────────────────────────────────────
    // v60+ — Unified per-speaker chained pipeline for ALL N (1..4)
    // ─────────────────────────────────────────────────────────────────────
    // The legacy `segments[]`-based single-call dispatch (v41/v54/v56) was
    // removed in v79 (2026-06-09). It was already gated behind a debug-only
    // body flag (`force_v56`) that no production code ever set, and the
    // Sync.so `sync-3 + segments[]` path returns `An unknown error occurred.`
    // on real plates regardless of ASD shape (see v58/v59 memory docs).
    //
    // The only stable path is the per-speaker chained pipeline below: one
    // Sync.so call per speaker, single-coord ASD, pass-N output feeds
    // pass-N+1. v69 extended this to ALL speaker counts via single-face
    // preclip renders. The `retry_v41` / `force_multipass` / `retry_no_asd`
    // body flags are still accepted from older webhook callers but are now
    // no-ops — the chained pipeline is the only dispatch path.
    // FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.1, I.2, I.9)




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

    // v86 — Defense-in-depth: if speakerTracks collapsed upstream (e.g. two
    // distinct cast members shared a name slug and compose-twoshot-audio's
    // ambiguity guard didn't catch it), distinct character_ids across
    // `speakers` must equal `speakers.length`. Otherwise two speakers point at
    // the same character_id → Sync.so would lipsync the same face twice while
    // another character stays silent. Fail-fast BEFORE the wallet debit.
    const distinctCharIds = new Set(
      speakers
        .map((sp) => String(sp.character_id || sp.speaker || "").trim().toLowerCase())
        .filter((s) => s.length > 0),
    );
    if (distinctCharIds.size > 0 && distinctCharIds.size < speakers.length) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} speaker_count_mismatch speakers=${speakers.length} distinct_ids=${distinctCharIds.size}`,
      );
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "speaker_count_mismatch: Zwei Cast-Mitglieder teilen denselben Character-Slot. Bitte vollen Namen verwenden oder eindeutige Cast-IDs zuweisen, dann 'Sauber neu starten'.",
        })
        .eq("id", sceneId);
      return json(
        {
          error: "speaker_count_mismatch",
          message: `${speakers.length} Sprecher, aber nur ${distinctCharIds.size} eindeutige Character-IDs. Pipeline würde Speaker-Pass kollidieren.`,
          speakers: speakers.length,
          distinct_character_ids: distinctCharIds.size,
        },
        400,
      );
    }

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
          const diag = await inspectSpeakerAudioWithRetry(p.audio_url, 3);
          const durMismatch = diag.wav.durSec + 0.35 < totalSec;
          const silent = diag.vad.voicedSec < 0.15 && diag.vad.longestVoicedRun < 0.12;
          return { pass: p.idx, speaker: p.speaker_name, ok: !durMismatch && !silent, durMismatch, silent, ...diag };
        } catch (err) {
          const transient = isTransientFetchError(err);
          return {
            pass: p.idx,
            speaker: p.speaker_name,
            ok: false,
            transient,
            error: (err as Error).message,
          } as any;
        }
      }),
    );
    const badAudio = audioDiagnostics.find((d: any) => !d.ok) as any;
    if (badAudio) {
      // ── v71 — Transient fetch error handling ──────────────────────────
      // If the preflight failed ONLY because we couldn't fetch the WAV
      // (storage hiccup / signal timeout), this is NOT proof the audio is
      // invalid. Marking the scene `failed` here wipes the already-successful
      // v69 passes for the other speakers and refunds the full cost — which
      // is exactly the bug the user reported on the 4-speaker scene where
      // passes 1–3 finished and only pass 4 hit a 30s fetch timeout.
      //
      // Instead: leave dialog_shots untouched (so the chained webhook can
      // still advance), do NOT refund, and return 202 so the auto-trigger
      // re-invokes us on the next 8s tick. The single-flight lock release
      // happens in the outer `finally`.
      const allBadAreTransient = audioDiagnostics
        .filter((d: any) => !d.ok)
        .every((d: any) => d?.transient === true);
      if (allBadAreTransient) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} AUDIO PREFLIGHT TRANSIENT — keeping pass state, will retry on next tick (isAdvance=${isAdvance})`,
        );
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_status: "PREFLIGHT_TRANSIENT", error_class: "audio_fetch_transient",
          error_message: badAudio.error ?? "transient_audio_fetch_failure",
          meta: { audio_diagnostics: audioDiagnostics, expected_total_sec: totalSec, is_advance: isAdvance },
        });
        // v71 — when this is a webhook-driven `advance` call, the auto-trigger
        // will NOT re-pick the scene (it only re-invokes pending scenes). Self-
        // reschedule the same advance call after a short delay so pass N+1
        // gets dispatched as soon as Storage settles.
        if (isAdvance) {
          try {
            EdgeRuntime.waitUntil((async () => {
              await new Promise((r) => setTimeout(r, 8_000));
              try {
                await supabase.functions.invoke("compose-dialog-segments", {
                  body: { scene_id: sceneId, advance: true },
                });
              } catch (e) {
                console.warn(
                  `[compose-dialog-segments] scene=${sceneId} self-retry after transient preflight failed: ${(e as Error)?.message ?? e}`,
                );
              }
            })());
          } catch { /* EdgeRuntime not available in some test contexts */ }
        }
        return json(
          { ok: true, status: "preflight_transient_retry_later", scene_id: sceneId, audio_diagnostics: audioDiagnostics },
          202,
        );
      }


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
      // v78 (June 9 2026) — Strict gate is now CONDITIONAL on plate identity.
      // v77 made the gate unconditional for 3+ speakers, which blocked
      // every scene whenever `resolvePlateFaceIdentities` failed (e.g.
      // Hailuo MP4 without moov-atom → plate frame extract crashes →
      // `plateIdentityMap=off` → anchor-rescale coords drift 5-15% from
      // real plate faces → strict gate hard-rejects everything → user
      // sees "Lip-Sync hat keinen Avatar getroffen". Now: only enforce
      // strict per-coordinate matching when we actually have plate-pixel
      // coords (i.e. plate identity resolved at least one speaker).
      // Otherwise fall back to v76 soft-pass + face-repair behaviour.
      const havePlateIdentity =
        !!plateIdentityMap && plateIdentityMap.resolvedCount > 0;
      const strictTargetCheck =
        speakers.length >= 3 && !!plateDims && havePlateIdentity;
      if (speakers.length >= 3 && !havePlateIdentity) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v78 soft-pass: ` +
          `plateIdentity unavailable for ${speakers.length} speakers — ` +
          `falling back to face-repair instead of hard-block`,
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

    // ── v87 — Coords refresh on advance/retry ────────────────────────────
    // Bug (verified in edge logs, scene 4c310576…): pass 1 dispatched with
    // heuristic [x, plateH*0.5] because anchor faceMap wasn't cached yet.
    // Those bad coords got baked into prevState.passes and every subsequent
    // isAdvance call cloned them verbatim — even though the freshly computed
    // `speakerCoords` now had real plate-identity / anchor coords. Refresh
    // pass.coords whenever the fresh source is *better* than what's stored.
    // "Better" = anything that isn't "heuristic"/"none". Heuristic coords
    // are blocked outright on the fresh path (above guard), so this only
    // upgrades — it never silently downgrades an already-good coord.
    if ((isAdvance || isRetry) && Array.isArray(speakerCoords) && speakerCoords.length > 0) {
      for (const p of passes) {
        const idx = Number(p.speaker_idx);
        if (!Number.isFinite(idx) || idx < 0 || idx >= speakerCoords.length) continue;
        const freshCoord = speakerCoords[idx];
        const freshSource = coordSources[idx] ?? "none";
        if (!freshCoord) continue;
        if (freshSource === "heuristic" || freshSource === "none") continue;
        const oldCoord = Array.isArray(p.coords) ? [p.coords[0], p.coords[1]] : null;
        const changed =
          !oldCoord ||
          Math.round(Number(oldCoord[0])) !== Math.round(Number(freshCoord[0])) ||
          Math.round(Number(oldCoord[1])) !== Math.round(Number(freshCoord[1]));
        if (changed) {
          p.coords = [freshCoord[0], freshCoord[1]];
          console.log(
            `[compose-dialog-segments] scene=${sceneId} ADVANCE COORDS REFRESH pass=${p.idx} ` +
            `speaker=${p.speaker_name} old=${JSON.stringify(oldCoord)} new=${JSON.stringify(p.coords)} source=${freshSource}`,
          );
        }
      }
    }

    // ── v87 — Sanity guard: never dispatch a multi-speaker pass with
    // heuristic-only coords. Belt-and-suspenders behind the fresh-path
    // guard above; covers any future code path that could reach here with
    // an unverified coord (e.g. retry after a successful pass 1 if the
    // faceMap regressed). 1-speaker scenes are exempt (centre-of-frame is
    // a sane single-face fallback).
    if (speakers.length >= 2) {
      const pSrc = coordSources[Number(passes[currentPassIdx]?.speaker_idx ?? -1)] ?? "none";
      if (pSrc === "heuristic" || pSrc === "none") {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v87 SANITY-BLOCK pass=${currentPassIdx} ` +
          `speaker_idx=${passes[currentPassIdx]?.speaker_idx} source=${pSrc} — skipping dispatch, awaiting retry`,
        );
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          user_id: userId,
          engine: "sync-segments",
          sync_status: "HEURISTIC_BLOCKED",
          error_class: "coords_heuristic_unverified",
          error_message: `pass=${currentPassIdx} speaker_idx=${passes[currentPassIdx]?.speaker_idx} source=${pSrc}`,
          meta: { speakers: speakers.length, pass_idx: currentPassIdx, is_advance: isAdvance, is_retry: isRetry },
        });
        return json(
          {
            ok: true,
            status: "awaiting_face_detection",
            skipped: `pass_${currentPassIdx}_heuristic_coord_unverified`,
          },
          202,
        );
      }
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
    // "sliceWav: no valid windows". v53 removes the old undocumented
    // `segments_secs` fallback entirely, so a failed tight-slice now fails
    // before provider dispatch instead of sending a non-doc Sync.so payload.
    //
    // Fix: ALWAYS restore the canonical full-length per-speaker WAV from
    // `audio_url_full` before re-slicing. Also clear stale `audio_tight`
    // so the downstream slicer either rebuilds it cleanly or fails safely
    // without falling back to a doc-violating video segment hint.
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
    // v82 (Phase 2.1) — Fresh dispatch prefers `bbox-url-pro` for N>=2
    // speakers when we have BOTH plateDims and a resolved plate-identity
    // map. That gives Sync.so a per-frame deterministic target box and
    // structurally fixes "Lipsync hat keinen Avatar getroffen" on
    // multi-face plates. Falls back to the legacy coords-pro entry-point
    // when plate identity is unavailable, when the per-pass preclip is
    // present (then auto_detect on the 1-face crop is best), or on retry.
    const havePlateIdentityForDispatch =
      !!plateIdentityMap && plateIdentityMap.resolvedCount > 0;
    const hasPassPreclipForDispatch = !!(pass as any).preclip_url;
    const freshDefaultVariant: RetryVariant =
      speakers.length >= 2 &&
      !!plateDims &&
      havePlateIdentityForDispatch &&
      !hasPassPreclipForDispatch
        ? "bbox-url-pro"
        : "coords-pro";
    const retryVariant: RetryVariant = isRetry
      ? (requestedRetryVariant ?? (prevState?.passes?.[currentPassIdx]?.retry_variant as RetryVariant | undefined) ?? "coords-pro")
      : freshDefaultVariant;

    // v85 (Mini-Phase 2.5) — Structured gate-decision log so we can answer
    // "why didn't bbox-url-pro fire?" without re-reading the source. Emitted
    // ONLY on fresh dispatch (retries inherit the previous variant) and only
    // for multi-speaker scenes (N>=2 is the only place where the gate is
    // meaningful). Keep on one line for easy grep.
    if (!isRetry && speakers.length >= 2) {
      const gateReason =
        freshDefaultVariant === "bbox-url-pro"
          ? "picked-bbox-url-pro"
          : !plateDims
            ? "fallback-no-plateDims"
            : !havePlateIdentityForDispatch
              ? `fallback-identity-unresolved(resolved=${plateIdentityMap?.resolvedCount ?? 0})`
              : hasPassPreclipForDispatch
                ? "fallback-preclip-present"
                : "fallback-unknown";
      console.log(
        `[v82-gate] scene=${sceneId} pass=${currentPassIdx + 1} speakers=${speakers.length} plateDims=${!!plateDims} resolved=${plateIdentityMap?.resolvedCount ?? 0} preclip=${hasPassPreclipForDispatch} → variant=${freshDefaultVariant} (${gateReason})`,
      );
    }

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
    //   • v53 removed the old undocumented `segments_secs` video hint. The
    //     scoped turn timing now comes from the tight per-turn WAV plus
    //     `sync_mode=cut_off`, which matches the public Sync.so schema.
    const firstTurn = pass.segments[0];
    const turnStartSec = firstTurn ? Math.max(0, firstTurn.startTime) : 0;
    const turnEndSec = firstTurn ? Math.min(totalSec, firstTurn.endTime) : totalSec;
    const startFrame = Math.max(0, Math.floor(turnStartSec * ASSUMED_FPS));
    const referenceFrameNumber = Number.isFinite(pass.reference_frame_number)
      ? Math.max(0, Math.round(Number(pass.reference_frame_number)))
      : startFrame;
    // Union of all turn windows for THIS speaker (a speaker may have multiple
    // turns; each becomes its own [start, end] entry inside segments_secs).
    // v90: asymmetric padding — 0.08s onset (consonant safety) but only
    // 0.02s on the tail to prevent lips from twitching after the script ends.
    // v91: dynamic tail floor — short turns (< 0.6s of raw speech) fall back to
    // 0.08s tail, otherwise Sync.so sees a near-empty window and returns
    // `provider_unknown_error`, which silently kills speakers 3/4 in N≥3 scenes.
    const SEG_PAD_START = 0.08;
    const SEG_PAD_END_TIGHT = 0.02;
    const SEG_PAD_END_SHORT = 0.08;
    const SHORT_TURN_THRESHOLD_SEC = 0.6;
    const speakerWindowsSecs: Array<[number, number]> = (pass.segments ?? [])
      .map((t) => {
        const rawDur = Math.max(0, Number(t.endTime) - Number(t.startTime));
        const tailPad = rawDur < SHORT_TURN_THRESHOLD_SEC ? SEG_PAD_END_SHORT : SEG_PAD_END_TIGHT;
        const s = Math.max(0, Number(t.startTime) - SEG_PAD_START);
        const e = Math.min(totalSec, Number(t.endTime) + tailPad);
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
    // v64 — Tight-slice now also runs for N=1. Sync.so reproducibly throws
    // `provider_unknown_error` when the per-speaker WAV is mostly trailing
    // silence (the 1-speaker case where speech is e.g. 0–2.2s on a 10s plate).
    // Slicing to the voiced window matches the N≥2 success path; the silent
    // tail of the scene is filled back in by the audio-mux Lambda (see
    // render-sync-segments-audio-mux, useOverlay branch).
    if (speakerWindowsSecs.length > 0) {
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
        // v90 — per-turn offsets inside the tight WAV. Mirrors sliceWavToWindows
        // layout: each window is concatenated in sorted order, separated by
        // gapSec (0.05s) of silence. Used by the mux to set sourceStartSec so
        // turn N plays its own slice of the Sync.so output instead of always
        // restarting at output-t=0 (which would replay turn-1 lips for turn-2).
        const GAP_SEC = 0.05;
        const sortedWindows = [...speakerWindowsSecs].sort((a, b) => a[0] - b[0]);
        const outputOffsetsSec: number[] = [];
        let cursor = 0;
        for (let i = 0; i < sortedWindows.length; i++) {
          outputOffsetsSec.push(Number(cursor.toFixed(3)));
          const [s, e] = sortedWindows[i];
          cursor += Math.max(0, e - s);
          if (i < sortedWindows.length - 1) cursor += GAP_SEC;
        }
        (pass as any).audio_tight = {
          url: pub.publicUrl,
          dur_sec: Number(sliced.durSec.toFixed(3)),
          windows_secs: speakerWindowsSecs,
          output_offsets_sec: outputOffsetsSec,
        };
        tightAudioInfo = { url: pub.publicUrl, durSec: sliced.durSec };
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v90_tight_audio dur=${sliced.durSec.toFixed(2)}s windows=${JSON.stringify(speakerWindowsSecs)} offsets=${JSON.stringify(outputOffsetsSec)} url=${pub.publicUrl.slice(0, 80)}`,
        );
      } catch (sliceErr) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v39_tight_audio_failed: ${(sliceErr as Error)?.message} — failing safely; undocumented segments_secs fallback disabled`,
        );
        (pass as any).tight_audio_error = (sliceErr as Error)?.message ?? String(sliceErr);
      }
    }

    // ── Plan B Hebel B — Batch preclip prefetch (Juni 2026) ──────────────
    // On the FIRST dispatch only (currentPassIdx===0 && !isAdvance && !isRetry),
    // render the v69 single-face preclip for ALL passes (1..N-1) IN PARALLEL
    // alongside this pass. Each result is persisted into passes[i].preclip_url
    // and the per-pass preclip block below becomes a no-op for them on the
    // chained webhook re-invocations (idempotent via !preclip_url guard).
    //
    // Why: today each pass's preclip is rendered serially as the v60 chain
    // walks pass 0..N-1, costing ~5–15s per pass × (N-1) extra wall time.
    // Parallelizing collapses that to ~5–15s once. Sync.so serial chain is
    // UNCHANGED — only the prep step parallelizes.
    //
    // Behind system_config.composer.batch_preclip_render flag (default OFF).
    // Mirrors per-pass logic EXACTLY (edge-speaker skip, bbox from plateBbox
    // or faceMap, sibling coords, face-gate validation). On any failure for
    // a given pass, that pass falls back to the existing per-pass block on
    // its chain turn — full backward compatibility.
    const batchPreclipFlagOn = await (async () => {
      try {
        const { data } = await supabase
          .from("system_config")
          .select("value")
          .eq("key", "composer.batch_preclip_render")
          .maybeSingle();
        return data?.value === true || data?.value === "true";
      } catch { return false; }
    })();
    const canBatchPrefetch =
      batchPreclipFlagOn &&
      !isAdvance &&
      !isRetry &&
      currentPassIdx === 0 &&
      speakers.length >= 2 &&
      !!plateDims &&
      passes.length > 1 &&
      passes.every((p) => !(p as any).preclip_url);
    if (canBatchPrefetch) {
      const tBatchStart = Date.now();
      console.log(
        `[compose-dialog-segments] scene=${sceneId} plan_b_B_batch_preclip_start passes=${passes.length}`,
      );
      // Compute the same edge-speaker constants as the per-pass block.
      const _EDGE_X = 0.25;
      const _EDGE_Y = 0.15;
      const _haveBboxUrlPath =
        !!plateIdentityMap && (plateIdentityMap.resolvedCount ?? 0) > 0;
      const _fmFaces: any[] = Array.isArray((faceMap as any)?.faces)
        ? (faceMap as any).faces
        : [];
      const _fmW = Number((faceMap as any)?.width) || plateDims!.width;
      const _fmH = Number((faceMap as any)?.height) || plateDims!.height;

      const renderOnePassPreclip = async (p: PassState, idx: number) => {
        try {
          if ((p as any).preclip_url) return { idx, status: "already" as const };
          // Edge-speaker skip (mirrors per-pass v88 guard).
          if (Array.isArray(p.coords) && p.coords.length === 2) {
            const cx = Number(p.coords[0]);
            const cy = Number(p.coords[1]);
            if (Number.isFinite(cx) && Number.isFinite(cy)) {
              const xFrac = cx / plateDims!.width;
              const yFrac = cy / plateDims!.height;
              const edge =
                xFrac < _EDGE_X || xFrac > 1 - _EDGE_X ||
                yFrac < _EDGE_Y || yFrac > 1 - _EDGE_Y;
              if (edge && _haveBboxUrlPath) {
                return { idx, status: "skip_edge" as const };
              }
            }
          } else {
            return { idx, status: "skip_no_coords" as const };
          }
          const firstTurn = p.segments?.[0];
          if (!firstTurn) return { idx, status: "skip_no_turn" as const };
          const winStartSec = Math.max(0, Number(firstTurn.startTime) - 0.08);
          const winEndSec = Math.min(totalSec, Number(firstTurn.endTime) + 0.08);
          if (!(winEndSec > winStartSec + 0.05)) {
            return { idx, status: "skip_bad_window" as const };
          }
          // bbox: prefer plate-native (v77), else rescaled faceMap.
          let bboxForCrop: [number, number, number, number] | null = null;
          const matched =
            _fmFaces.find((f) => f?.characterId && f.characterId === p.character_id) ??
            _fmFaces.find((f) => Number(f?.slotIndex) === Number(p.speaker_idx)) ??
            null;
          if (matched && Array.isArray(matched.bbox) && matched.bbox.length === 4) {
            const [bx1, by1, bx2, by2] = matched.bbox.map((n: any) => Number(n));
            const sx = plateDims!.width / _fmW;
            const sy = plateDims!.height / _fmH;
            bboxForCrop = [
              Math.round(bx1 * sx), Math.round(by1 * sy),
              Math.round(bx2 * sx), Math.round(by2 * sy),
            ];
          }
          const platePassBbox = speakerPlateBboxes[p.speaker_idx] ?? null;
          if (platePassBbox) bboxForCrop = platePassBbox;
          const siblingCoords: Array<[number, number]> = passes
            .filter((other, oi) =>
              oi !== idx &&
              Array.isArray(other?.coords) &&
              other.coords.length === 2 &&
              Number.isFinite(Number(other.coords[0])) &&
              Number.isFinite(Number(other.coords[1])),
            )
            .map((other) => [Number(other.coords[0]), Number(other.coords[1])] as [number, number]);
          const preclip = await renderPassFacePreclip(
            supabase,
            serviceKey,
            supabaseUrl,
            {
              sceneId,
              projectId: (scene as any).project_id,
              userId,
              passIdx: idx,
              masterVideoUrl: sourceClipUrl,
              srcWidth: plateDims!.width,
              srcHeight: plateDims!.height,
              coords: p.coords as [number, number],
              bbox: bboxForCrop,
              siblingCoords,
              startSec: winStartSec,
              endSec: winEndSec,
            },
            90_000,
          );
          if (!preclip.ok || !preclip.preclipUrl || !preclip.crop) {
            (p as any).preclip_error = preclip.error ?? "unknown";
            return { idx, status: "render_failed" as const, err: preclip.error };
          }
          // Mirror per-pass face-gate (validates exactly 1 face in preclip mid-frame).
          let faceOk = true;
          let faceCount: number | null = null;
          try {
            const midFrame = Math.max(1, Math.round(((preclip.durationSec ?? 1) / 2) * 30));
            const v = await validateFrameFace({
              supabaseUrl, serviceKey,
              videoUrl: preclip.preclipUrl,
              frameNumber: midFrame, fps: 30,
              targetCoords: null,
            });
            if (v.ok) {
              faceCount = Number(v.faceCount ?? 0);
              if (faceCount === 0 || faceCount > 1) faceOk = false;
            }
          } catch (_) { /* validation soft-fail → trust the preclip */ }
          if (!faceOk) {
            (p as any).preclip_error = `face_gate_failed:count=${faceCount}`;
            (p as any).preclip_face_count = faceCount;
            return { idx, status: "face_gate_blocked" as const, faceCount };
          }
          (p as any).preclip_url = preclip.preclipUrl;
          (p as any).preclip_render_id = preclip.preclipRenderId ?? null;
          (p as any).preclip_crop = {
            x: preclip.crop.x, y: preclip.crop.y,
            size: preclip.crop.size, outputSize: preclip.crop.outputSize,
          };
          (p as any).preclip_error = null;
          (p as any).preclip_face_count = faceCount;
          return { idx, status: "ok" as const, faceCount };
        } catch (e) {
          (p as any).preclip_error = `batch_exception:${(e as Error)?.message ?? e}`;
          return { idx, status: "exception" as const, err: (e as Error)?.message };
        }
      };

      const results = await Promise.allSettled(
        passes.map((p, i) => renderOnePassPreclip(p, i)),
      );
      const summary = results.map((r, i) =>
        r.status === "fulfilled" ? `${i}:${(r.value as any).status}` : `${i}:rej`,
      ).join(",");
      const okCount = results.filter(
        (r) => r.status === "fulfilled" && (r.value as any).status === "ok",
      ).length;
      console.log(
        `[compose-dialog-segments] scene=${sceneId} plan_b_B_batch_preclip_complete ` +
        `ms_total=${Date.now() - tBatchStart} ok=${okCount}/${passes.length} results=[${summary}]`,
      );
    }


    // ── v69 — Single-Face PRECLIP for ALL speaker counts (1..4) ─────────
    // Unified pipeline: regardless of N, we render a tight SINGLE-FACE
    // SQUARE CROP per pass via Remotion Lambda (DialogTurnFaceCropVideo)
    // and send THAT to Sync.so. Sync.so always sees exactly ONE face,
    // `auto_detect:true` is unambiguous, no more `provider_unknown_error`
    // on the full multi-face plate.
    //
    // v68 proved this pattern stable for N≥3. v69 extends it to N=1/2,
    // where the legacy full-plate + `coords-pro`/`active_speaker_detection`
    // path had been an ongoing source of provider_unknown_error.
    //
    // The lipsynced crop is overlaid back at (cropX, cropY, cropSize) in
    // render-sync-segments-audio-mux via DialogStitchVideo's `crop` shot
    // type. Fallback to full-plate dispatch is preserved if the preclip
    // Lambda fails (no regression risk).
    //
    // Idempotent: once a pass has `preclip_url`, reuse it on retries.
    // v88 — Edge-Speaker Guard. When the speaker's coords sit within the
    // outer 25 % of the plate width (or 15 % of the height), the 512x512
    // preclip crop is forced against the plate boundary and Sync.so's
    // `auto_detect:true` on the resulting cropped frame routinely fails
    // to find an active speaker → output is the unchanged preclip and
    // the muxed scene shows a closed mouth during the speaker's voice
    // window. DB-confirmed on scene ec22e048… (June 2026): center speakers
    // at 41 % and 63 % width animated correctly, edge speakers at 22 %
    // and 84 % width came back static. For edge speakers we skip the
    // preclip entirely so `freshDefaultVariant` selects `bbox-url-pro`
    // and Sync.so receives a per-frame deterministic target box on the
    // FULL multi-face plate (which sync-3 handles natively).
    const EDGE_X_FRAC = 0.25;
    const EDGE_Y_FRAC = 0.15;
    const speakerIsEdgePositioned = (() => {
      if (!plateDims || !Array.isArray(pass.coords) || pass.coords.length !== 2) return false;
      const cx = Number(pass.coords[0]);
      const cy = Number(pass.coords[1]);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false;
      const xFrac = cx / plateDims.width;
      const yFrac = cy / plateDims.height;
      return (
        xFrac < EDGE_X_FRAC ||
        xFrac > 1 - EDGE_X_FRAC ||
        yFrac < EDGE_Y_FRAC ||
        yFrac > 1 - EDGE_Y_FRAC
      );
    })();
    const haveBboxUrlPathForEdge =
      speakers.length >= 2 &&
      !!plateDims &&
      !!plateIdentityMap &&
      (plateIdentityMap.resolvedCount ?? 0) > 0;
    const skipPreclipForEdgeSpeaker =
      speakerIsEdgePositioned && haveBboxUrlPathForEdge;
    if (skipPreclipForEdgeSpeaker) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v88_edge_speaker_skip_preclip coords=${JSON.stringify(pass.coords)} plate=${plateDims!.width}x${plateDims!.height} → full-plate bbox-url-pro dispatch`,
      );
    }
    const wantPassPreclip =
      speakers.length >= 1 &&
      !!plateDims &&
      Array.isArray(pass.coords) &&
      Number.isFinite(pass.coords[0]) &&
      Number.isFinite(pass.coords[1]) &&
      !!tightAudioInfo &&
      !skipPreclipForEdgeSpeaker;
    if (wantPassPreclip && !(pass as any).preclip_url) {
      // Window: use the first turn for this speaker as the preclip render
      // window. Per-pass tight audio is sliced to the same window union, so
      // a single-turn preclip matches the lipsync output the audio-mux
      // Lambda overlays back on top.
      const firstTurnForPreclip = pass.segments[0];
      const winStartSec = firstTurnForPreclip ? Math.max(0, Number(firstTurnForPreclip.startTime) - 0.08) : 0;
      const winEndSec = firstTurnForPreclip ? Math.min(totalSec, Number(firstTurnForPreclip.endTime) + 0.08) : totalSec;
      // Extract bbox from faceMap if available so the crop wraps the face cleanly.
      const fmFaces2: any[] = Array.isArray((faceMap as any)?.faces) ? (faceMap as any).faces : [];
      const fmW2 = Number((faceMap as any)?.width) || plateDims!.width;
      const fmH2 = Number((faceMap as any)?.height) || plateDims!.height;
      const matchedFace2 =
        fmFaces2.find((f) => f?.characterId && f.characterId === pass.character_id) ??
        fmFaces2.find((f) => Number(f?.slotIndex) === Number(pass.speaker_idx)) ??
        null;
      let bboxForCrop: [number, number, number, number] | null = null;
      if (matchedFace2 && Array.isArray(matchedFace2.bbox) && matchedFace2.bbox.length === 4) {
        const [bx1, by1, bx2, by2] = matchedFace2.bbox.map((n: any) => Number(n));
        const sx = plateDims!.width / fmW2;
        const sy = plateDims!.height / fmH2;
        bboxForCrop = [
          Math.round(bx1 * sx),
          Math.round(by1 * sy),
          Math.round(bx2 * sx),
          Math.round(by2 * sy),
        ];
      }
      // v77 — When plate-identity gave us a real plate-pixel bbox for this
      // speaker, prefer it over the anchor-rescaled box (anchor often
      // drifts 5–15 % vs the Hailuo plate).
      const platePassBbox = speakerPlateBboxes[pass.speaker_idx] ?? null;
      if (platePassBbox) {
        bboxForCrop = platePassBbox;
      }
      // v76 — Collect coords of the OTHER passes (same plate) so the
      // single-face preclip crop never includes a neighbor's face.
      const siblingCoordsForPass: Array<[number, number]> = passes
        .filter((other, idx) =>
          idx !== currentPassIdx &&
          Array.isArray(other?.coords) &&
          other.coords.length === 2 &&
          Number.isFinite(Number(other.coords[0])) &&
          Number.isFinite(Number(other.coords[1])),
        )
        .map((other) => [Number(other.coords[0]), Number(other.coords[1])] as [number, number]);
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v69_preclip_unified dispatching coords=${JSON.stringify(pass.coords)} bbox=${JSON.stringify(bboxForCrop)} siblings=${siblingCoordsForPass.length} window=[${winStartSec.toFixed(2)},${winEndSec.toFixed(2)}]`,
      );
      const preclip = await renderPassFacePreclip(
        supabase,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        Deno.env.get("SUPABASE_URL") ?? "",
        {
          sceneId,
          projectId: (scene as any).project_id,
          userId,
          passIdx: currentPassIdx,
          masterVideoUrl: sourceClipUrl,
          srcWidth: plateDims!.width,
          srcHeight: plateDims!.height,
          coords: pass.coords as [number, number],
          bbox: bboxForCrop,
          siblingCoords: siblingCoordsForPass,
          startSec: winStartSec,
          endSec: winEndSec,
        },
        90_000,
      );
      if (preclip.ok && preclip.preclipUrl && preclip.crop) {
        // v77 — Validate the preclip actually shows EXACTLY one face before
        // shipping to Sync.so. If the crop is empty (wrong coords) or
        // contains two heads (sibling cap failed), Sync.so would happily
        // animate the wrong region, producing the "Lip-Sync hit no avatar"
        // failure mode the user reported.
        let preclipFaceOk = true;
        let preclipFaceCount: number | null = null;
        if (speakers.length >= 2) {
          try {
            const midFrame = Math.max(1, Math.round(((preclip.durationSec ?? 1) / 2) * 30));
            const v = await validateFrameFace({
              supabaseUrl, serviceKey,
              videoUrl: preclip.preclipUrl,
              frameNumber: midFrame, fps: 30,
              targetCoords: null,
            });
            if (v.ok) {
              preclipFaceCount = Number(v.faceCount ?? 0);
              if (preclipFaceCount === 0) preclipFaceOk = false;
              if (preclipFaceCount > 1) preclipFaceOk = false;
            }
          } catch (e) {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} preclip_face_gate threw: ${(e as Error)?.message}`,
            );
          }
        }
        if (preclipFaceOk) {
          (pass as any).preclip_url = preclip.preclipUrl;
          (pass as any).preclip_render_id = preclip.preclipRenderId ?? null;
          (pass as any).preclip_crop = {
            x: preclip.crop.x,
            y: preclip.crop.y,
            size: preclip.crop.size,
            outputSize: preclip.crop.outputSize,
          };
          (pass as any).preclip_error = null;
          (pass as any).preclip_face_count = preclipFaceCount;
          console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v77_preclip_ready faces=${preclipFaceCount ?? "skip"} url=${preclip.preclipUrl.slice(0, 100)} crop={x:${preclip.crop.x},y:${preclip.crop.y},size:${preclip.crop.size}}`,
          );
        } else {
          (pass as any).preclip_error = `face_gate_failed:count=${preclipFaceCount}`;
          (pass as any).preclip_face_count = preclipFaceCount;
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v77_preclip_face_gate_BLOCK faces=${preclipFaceCount} — falling back to full-plate dispatch with plate coords`,
          );
        }

      } else {
        (pass as any).preclip_error = preclip.error ?? "unknown";
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v69_preclip_unified_failed ${preclip.errorClass ?? "?"}: ${preclip.error ?? "?"} — falling back to full-plate dispatch`,
        );
      }
    }

    // When preclip is available, swap the Sync.so video input + force
    // auto_detect (the cropped 512x512 frame has exactly ONE face).
    const passPreclipUrl: string | null = (pass as any).preclip_url ?? null;
    const usePassPreclip = !!passPreclipUrl;



    // v66 — sync_mode is TIGHT-GATED, not count-gated:
    //   • tightAudioInfo set (per-pass tight audio, N=1 OR N≥2) → `cut_off`.
    //     The WAV equals the speaker's voiced window (~1.5–2.5s); Sync.so
    //     returns exactly that length and the audio-mux Lambda overlays the
    //     short lipsync clip onto the pristine full-length plate at the
    //     turn's absolute timeline. Using `loop` here made Sync.so try to
    //     loop a 1.6s clip ~5× across a 9s plate → `provider_unknown_error`
    //     reproducibly on 4-speaker scenes (and intermittently on 2-speaker).
    //   • no tight (v56 official segments / force_v56 with master VO) → `loop`
    //     (v63). The master VO may outrun the plate; loop keeps the locked
    //     plate playing for the full audio duration so no freeze.
    const payloadSyncMode = tightAudioInfo ? "cut_off" : "loop";
    const syncOptions: Record<string, unknown> = {
      sync_mode: payloadSyncMode,
      // Welle D / Hebel 2 — Sync.so docs recommend explicit temperature bump
      // when input plates are near-static (locked-camera Hailuo i2v); the
      // default 0.7 routinely produced "frozen" outputs on speakers 2+3 of
      // multi-speaker chained passes. 1.0 keeps the model in its documented
      // range and gives the mouth-motion estimator more headroom.
      temperature: 1.0,
      // sync-3 + lipsync-2-pro both honor this flag per
      // https://sync.so/docs/models/lipsync — explicitly enable so partial
      // hand-over-mouth / mic-bump frames don't silently collapse to a copy.
      occlusion_detection_enabled: true,
    };
    if (usePassPreclip) {
      // v68 — Preclip is a tight single-face 512x512 crop. Sync.so sees
      // ONE face → auto_detect is unambiguous and the most reliable mode.
      // Welle D — keep auto_detect (the safer mode for a single-face crop)
      // but the temperature+occlusion bumps above now apply to the
      // dispatched payload, addressing the static-frozen Pass 2/3 outputs.
      syncOptions.active_speaker_detection = { auto_detect: true };

    } else if (retryVariant === "coords-pro" || retryVariant === "sync3-coords" || retryVariant === "coords-pro-lp2pro") {
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
    } else if (retryVariant === "coords-pro-box" || retryVariant === "bbox-url-pro") {
      // v31 / v82 — Build the same plate-space face box from faceMap; for
      // `bbox-url-pro` we upload it as a per-frame JSON and hand Sync.so
      // a `bounding_boxes_url` (preferred for multi-speaker / long clips);
      // for the legacy `coords-pro-box` we inline `bounding_boxes`.
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

      let usedUrl: string | null = null;
      if (retryVariant === "bbox-url-pro") {
        usedUrl = await uploadBoundingBoxesJson(supabase, {
          userId,
          projectId: String((scene as any).project_id ?? ""),
          sceneId,
          passIdx: currentPassIdx,
          box,
          frameCount,
        });
      }

      if (usedUrl) {
        syncOptions.active_speaker_detection = {
          auto_detect: false,
          bounding_boxes_url: usedUrl,
        };
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} BBOX_URL_ASD speaker=${pass.speaker_name} box=${JSON.stringify(box)} source=${bboxSource} frames=${frameCount} url=…${usedUrl.slice(-60)}`,
        );
      } else {
        // graceful degrade — inline bounding_boxes (legacy coords-pro-box path)
        const boundingBoxes: (number[] | null)[] = new Array(frameCount).fill(box);
        syncOptions.active_speaker_detection = {
          auto_detect: false,
          bounding_boxes: boundingBoxes,
        };
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} BBOX_ASD variant=${retryVariant} speaker=${pass.speaker_name} box=${JSON.stringify(box)} source=${bboxSource} frames=${frameCount}${retryVariant === "bbox-url-pro" ? " (url-upload-failed → inline-bbox-fallback)" : ""}`,
        );
      }



    } else {
      syncOptions.active_speaker_detection = { auto_detect: true };
    }

    const diagnosticWebhookUrl = `${webhookUrl}&diagnostic_id=${encodeURIComponent(diagnosticId)}`;
    // v61 — Multi-speaker default flipped to sync-3 (Sync.so's recommended
    // model for static / locked-camera / occluded plates per
    // https://sync.so/docs/models/lipsync "Still Frame Limitation").
    // The chained per-speaker pipeline feeds Sync.so a LOCKED Hailuo plate
    // where the mouth never moves until lip-sync paints it — exactly the
    // class of input lipsync-2-pro silently rejects with `unknown error`.
    // sync-3 has built-in obstruction detection and can open closed lips.
    //
    // For single-speaker (N=1) we keep lipsync-2-pro first: those plates
    // typically already carry natural speaking motion (HeyGen / avatar /
    // user upload) and lipsync-2-pro has the higher fidelity ceiling.
    //
    // `coords-pro-lp2pro` (v61) is the new "force lipsync-2-pro on the
    // proven coords-pro shape" retry variant — final fallback in the
    // multi-speaker ladder before refunding.
    // FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.10)
    // v62: sync-3 is now the universal default for ALL speaker counts (N>=1).
    // Rationale: even single-speaker plates from Hailuo/Composer are locked-cam
    // stills where lipsync-2-pro's "Still Frame Limitation" silently fails.
    // sync-3 handles both static and motion plates natively. lipsync-2-pro
    // remains reachable only via the explicit `coords-pro-lp2pro` fallback.
    const payloadModel =
      retryVariant === "sync3-coords"
        ? SYNC3_MODEL
        : retryVariant === "auto-standard"
          ? LIPSYNC_FALLBACK_MODEL
          : retryVariant === "coords-pro-lp2pro"
            ? LIPSYNC_MODEL
            : (retryVariant === "coords-pro" || retryVariant === "coords-pro-box")
              ? SYNC3_MODEL
              : SYNC3_MODEL;

    const failBeforeProviderDispatch = async (
      reason: string,
      errorClass: string,
      message: string,
      status = 422,
      meta: Record<string, unknown> = {},
    ) => {
      const costCredits = Number(prevState?.cost_credits ?? totalCost);
      const alreadyRefunded = !!(prevState as any)?.refunded;
      if (!alreadyRefunded) {
        const { data: w2 } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({
            balance: Number(w2?.balance ?? 0) + costCredits,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
      pass.status = "failed";
      pass.error = reason;
      (pass as any).last_error = reason;
      (pass as any).last_error_class = errorClass;
      (pass as any).sync_error_bucket = errorClass;
      passes[currentPassIdx] = pass;
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
            cost_credits: costCredits,
            refunded: !alreadyRefunded,
            error: reason,
            finished_at: new Date().toISOString(),
          },
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: reason,
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_source_kind: "segments", video_url: passInputUrl,
        sync_status: "PRE_DISPATCH_FAILED", error_class: errorClass,
        error_message: message,
        meta: { diagnostic_id: diagnosticId, retry_variant: retryVariant, pass_idx: currentPassIdx, total_passes: passes.length, ...meta },
      });
      return json({ error: reason, message, refunded: alreadyRefunded ? 0 : costCredits, ...meta }, status);
    };

    if (speakerWindowsSecs.length > 0 && !tightAudioInfo) {
      return await failBeforeProviderDispatch(
        "prepare_failed_no_tight_audio",
        "input_audio_prepare_failed",
        `Tight per-turn audio could not be prepared; undocumented Sync.so segments_secs fallback is disabled. ${(pass as any).tight_audio_error ?? ""}`.trim(),
        422,
        { tight_audio_error: (pass as any).tight_audio_error ?? null, windows_secs: speakerWindowsSecs },
      );
    }

    const finalAudioDiag = await inspectSpeakerAudioWithRetry(pass.audio_url, 3).catch((audioErr) => {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} SILENT_AUDIO_GATE inspect_failed: ${(audioErr as Error)?.message ?? audioErr}`,
      );
      return null;
    });
    const finalPeakDbFs = Number(finalAudioDiag?.wav?.peakDbFs);
    const finalVoicedSec = Number(finalAudioDiag?.vad?.voicedSec ?? 0);
    const finalLongestRun = Number(finalAudioDiag?.vad?.longestVoicedRun ?? 0);
    const audioSilentOrInvalid =
      !finalAudioDiag ||
      !Number.isFinite(finalPeakDbFs) ||
      finalPeakDbFs <= -50 ||
      finalVoicedSec <= 0.04 ||
      finalLongestRun <= 0.04;
    if (audioSilentOrInvalid) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} SILENT_AUDIO_GATE peak_dbfs=${Number.isFinite(finalPeakDbFs) ? finalPeakDbFs.toFixed(2) : "invalid"} voiced=${finalVoicedSec.toFixed(3)}s longest=${finalLongestRun.toFixed(3)}s url=${pass.audio_url.slice(0, 120)}`,
      );
      (pass as any).audio_gate = {
        peak_dbfs: Number.isFinite(finalPeakDbFs) ? finalPeakDbFs : null,
        voiced_sec: Number.isFinite(finalVoicedSec) ? finalVoicedSec : 0,
        longest_voiced_run: Number.isFinite(finalLongestRun) ? finalLongestRun : 0,
        inspected_url: pass.audio_url,
      };
      return await failBeforeProviderDispatch(
        "speaker_audio_silent_or_invalid",
        "input_audio_silent",
        "Speaker audio is silent or contains no detectable voiced frames; skipped Sync.so dispatch to avoid provider_unknown_error.",
        422,
        { audio_gate: (pass as any).audio_gate, audio_tight: (pass as any).audio_tight ?? null, audio_repair: (pass as any).audio_repair ?? null },
      );
    }

    // v53 — Keep Sync.so payload doc-strict. `segments_secs` is not in the
    // public Sync.so schema and broke sync-3 jobs with provider_unknown_error.
    // Per-turn timing is now represented only by the tight audio WAV plus
    // `sync_mode=cut_off`.
    // v68 — when a per-pass single-face preclip exists, send IT to Sync.so
    // instead of the full multi-face plate. Sync.so sees one face only →
    // no `provider_unknown_error` ambiguity. The audio-mux Lambda overlays
    // the lipsynced crop back at preclip_crop on the original plate.
    const dispatchVideoUrl = usePassPreclip ? (passPreclipUrl as string) : passInputUrl;
    const videoInput: Record<string, unknown> = { type: "video", url: dispatchVideoUrl };
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
      `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v53_doc_strict tight=${tightAudioInfo ? `${tightAudioInfo.durSec.toFixed(2)}s` : "none"} segments_secs=disabled windows=${JSON.stringify(speakerWindowsSecs)} turnStartFrame=${startFrame}`,
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
      `frame=${referenceFrameNumber} sync_mode=${payloadSyncMode} input=${passInputUrl.slice(0, 80)} audio=${pass.audio_url.slice(0, 80)}`,
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
    // v59 — Preserve v58 multipass markers across every state write so a
    // pass-level retry cannot accidentally fall back into the broken
    // sync-3 segments[] path. Source of truth is the body flag OR any
    // previously-stored marker on the scene state.
    // FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.3)
    const prevForceMultipass =
      (prevState as any)?.force_multipass === true ||
      (existing as any)?.force_multipass === true;
    const prevMultipassAttempted =
      (prevState as any)?.multipass_fallback_attempted === true ||
      (existing as any)?.multipass_fallback_attempted === true;
    // v60 — For every multi-speaker scene (N≥2) the chained per-speaker
    // pipeline is the canonical path. Set the sticky markers from the
    // very first state write so any later retry (pass-level, scene-level,
    // webhook-triggered) cannot accidentally route back into the v56
    // segments[] dispatch. FROZEN — see FROZEN-INVARIANTS.md (I.1, I.3)
    const isMultiSpeakerV60 = speakers.length >= 2;
    const carryForceMultipass = forceMultipass || prevForceMultipass || isMultiSpeakerV60;
    const carryMultipassAttempted = forceMultipass || prevMultipassAttempted || isMultiSpeakerV60;
    // Soft-log invariant guard: if prev state had a marker but neither the
    // carry nor the body flag would re-emit it, that is a regression.
    if (
      (prevForceMultipass && !carryForceMultipass) ||
      (prevMultipassAttempted && !carryMultipassAttempted)
    ) {
      console.error(
        `INVARIANT_VIOLATION_v59_state_carryover scene=${sceneId} prevForce=${prevForceMultipass} prevAttempted=${prevMultipassAttempted} carryForce=${carryForceMultipass} carryAttempted=${carryMultipassAttempted} — see FROZEN-INVARIANTS.md I.3`,
      );
    }
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
      // v59 carry-over: keep multipass markers across retries.
      ...(carryForceMultipass ? { force_multipass: true } : {}),
      ...(carryMultipassAttempted ? { multipass_fallback_attempted: true } : {}),
      ...((prevState as any)?.multipass_fallback_reason
        ? { multipass_fallback_reason: (prevState as any).multipass_fallback_reason }
        : {}),
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
        sync_mode: payloadSyncMode,
        audio_approx_sec: audioApproxSec,
        expected_total_sec: totalSec,
        length_mismatch: lengthMismatch,
        audio_probe: audioProbes[audioProbeIdx] ?? null,
        final_audio_gate: {
          peak_dbfs: Number.isFinite(finalPeakDbFs) ? finalPeakDbFs : null,
          voiced_sec: Number.isFinite(finalVoicedSec) ? finalVoicedSec : 0,
          longest_voiced_run: Number.isFinite(finalLongestRun) ? finalLongestRun : 0,
        },
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

    // ── v60: NO parallel fan-out for any speaker count. The webhook chains
    //    Pass 1..N-1 serially via `pendingIdxs[0]` on COMPLETE events. This
    //    eliminates the 2-speaker dispatch-race that v33 already removed for
    //    N≥3 and gives every multi-speaker scene a single, uniform pipeline.
    //    FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.9)
    // ── v25 Fan-Out (DISABLED in v60): on fresh dispatch, kick off all remaining passes in
    //    parallel via background self-invokes. Each runs as an independent
    //    Sync.so job against the SAME original plate (no chaining). The
    //    Sync.so 3-slot concurrency guard upstream handles back-pressure.
    // v33: For 3+ speaker scenes, do NOT fan out passes in parallel. v60
    // extends this to 2-speaker scenes for the same race-elimination reasons.
    const fanOutAllowed = false;
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
    } else if (!isAdvance && !isRetry && passes.length > 1) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} SERIAL mode (${passes.length} speakers, v60 unified) — webhook will chain pass 2..N as pass 1..N-1 complete`,
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

