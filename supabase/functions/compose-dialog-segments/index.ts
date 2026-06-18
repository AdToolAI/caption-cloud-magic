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
 *   2. NOTE (v121, Juni 2026): The Sync.so docs DO document per-segment
 *      ASD via `segments[].optionsOverride.active_speaker_detection` today.
 *      Migrating the chained-pass dispatcher to that single-call route is
 *      tracked in plan v121 (compose-dialog-segments doc-current route);
 *      this comment block is retained to explain the historic chain.

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
  detectVoicedRange,
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
import { assertSafeDispatchEntry } from "../_shared/dialogPassTransition.ts";
import { verifyFaceBeforeDispatch } from "../_shared/syncso-face-gate.ts";





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
 * v124 — Sync-3 doc-strict whitelist sanitizer + ASD mutex.
 *
 * Per https://sync.so/docs/models/sync-3 the ONLY accepted `options` keys
 * for `model: "sync-3"` are `sync_mode` and `active_speaker_detection`.
 * `temperature`, `reasoning_enabled`, `occlusion_detection_enabled` are
 * explicitly NOT applicable and reproducibly trigger `provider_unknown_error`
 * on the provider job (validator returns 201, then the job dies).
 *
 * Per https://sync.so/docs/developer-guides/speaker-selection the ASD DTO
 * has three mutually exclusive shapes:
 *   (a) `{ auto_detect: true }` — video only
 *   (b) `{ auto_detect: false, frame_number, coordinates }`
 *   (c) `{ auto_detect: false, bounding_boxes }` OR `{ ..., bounding_boxes_url }`
 *       — when boxes are provided, `frame_number`/`coordinates` are dropped.
 *
 * Logs `v124_sync3_sanitize` with the stripped keys so any future doc-drift
 * is visible at dispatch time.
 */
function sanitizeSync3Options(
  model: string,
  options: Record<string, unknown>,
  ctx: { scene: string; pass: number; speaker: string },
): { options: Record<string, unknown>; strippedOpts: string[]; strippedAsd: string[] } {
  const strippedOpts: string[] = [];
  const strippedAsd: string[] = [];
  if (model !== SYNC3_MODEL) {
    return { options, strippedOpts, strippedAsd };
  }
  const allowedTop = new Set(["sync_mode", "active_speaker_detection"]);
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(options ?? {})) {
    if (allowedTop.has(k)) {
      cleaned[k] = v;
    } else {
      strippedOpts.push(k);
    }
  }
  const asd: any = cleaned.active_speaker_detection;
  if (asd && typeof asd === "object") {
    const hasBoxes =
      Array.isArray(asd.bounding_boxes) ||
      typeof asd.bounding_boxes_url === "string";
    if (hasBoxes) {
      if ("frame_number" in asd) { delete asd.frame_number; strippedAsd.push("frame_number"); }
      if ("coordinates" in asd) { delete asd.coordinates; strippedAsd.push("coordinates"); }
    }
    if (asd.auto_detect === true) {
      // auto_detect must be alone — no coordinates/boxes
      if ("frame_number" in asd) { delete asd.frame_number; strippedAsd.push("frame_number_with_auto_detect"); }
      if ("coordinates" in asd) { delete asd.coordinates; strippedAsd.push("coordinates_with_auto_detect"); }
      if ("bounding_boxes" in asd) { delete asd.bounding_boxes; strippedAsd.push("bounding_boxes_with_auto_detect"); }
      if ("bounding_boxes_url" in asd) { delete asd.bounding_boxes_url; strippedAsd.push("bounding_boxes_url_with_auto_detect"); }
    }
    // unknown ASD keys
    const allowedAsd = new Set([
      "auto_detect", "v3", "frame_number", "coordinates",
      "bounding_boxes", "bounding_boxes_url",
    ]);
    for (const k of Object.keys(asd)) {
      if (!allowedAsd.has(k)) {
        strippedAsd.push(k);
        delete asd[k];
      }
    }
  }
  if (strippedOpts.length > 0 || strippedAsd.length > 0) {
    console.log(
      `[compose-dialog-segments] scene=${ctx.scene} pass=${ctx.pass} speaker=${ctx.speaker} v124_sync3_sanitize stripped_opts=${JSON.stringify(strippedOpts)} stripped_asd=${JSON.stringify(strippedAsd)}`,
    );
  }
  return { options: cleaned, strippedOpts, strippedAsd };
}

/**
 * v124 — Build per-frame `bounding_boxes` array honoring the speaker's
 * voiced windows. Frames inside any voiced window get the speaker's plate
 * box; frames outside get `null`. Per Sync.so docs (Speaker Selection,
 * "null where no box is present"), this prevents sync-3 from animating
 * neighbour faces during turns the speaker is silent — the root cause
 * of "pixelated overlay on other speakers' mouths" in multi-speaker scenes.
 */
function buildPerFrameBoxes(params: {
  box: [number, number, number, number];
  frameCount: number;
  fps: number;
  voicedWindowsSec: Array<[number, number]>;
  padFrames?: number; // small padding to be safe at boundaries
}): Array<[number, number, number, number] | null> {
  const pad = Math.max(0, Math.floor(params.padFrames ?? 2));
  const windows = (params.voicedWindowsSec ?? [])
    .map(([s, e]) => {
      const fs = Math.max(0, Math.floor(s * params.fps) - pad);
      const fe = Math.min(params.frameCount - 1, Math.ceil(e * params.fps) + pad);
      return [fs, fe] as [number, number];
    })
    .filter(([fs, fe]) => Number.isFinite(fs) && Number.isFinite(fe) && fe >= fs);
  const out: Array<[number, number, number, number] | null> =
    new Array(Math.max(1, params.frameCount)).fill(null);
  if (windows.length === 0) {
    // No voiced windows known → preserve legacy behaviour (full-fill) so
    // we don't accidentally produce an all-null array that would silently
    // disable lip-sync entirely.
    return out.map(() => params.box);
  }
  for (const [fs, fe] of windows) {
    for (let i = fs; i <= fe; i++) out[i] = params.box;
  }
  return out;
}

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
    // v124 — when provided, build per-frame array with `null` outside the
    // speaker's voiced windows. Sync.so requires this to avoid animating
    // neighbour faces during turns this speaker is silent.
    voicedWindowsSec?: Array<[number, number]>;
    fps?: number;
  },
): Promise<{ url: string | null; nonNullFrames: number; totalFrames: number }> {
  try {
    const sub = params.projectId || "shared";
    const ts = Date.now();
    const path = `${params.userId}/${sub}/asd/${params.sceneId}-p${params.passIdx + 1}-${ts}.json`;
    const totalFrames = Math.max(1, params.frameCount);
    const boxes = params.voicedWindowsSec && params.voicedWindowsSec.length > 0 && params.fps
      ? buildPerFrameBoxes({
          box: params.box,
          frameCount: totalFrames,
          fps: params.fps,
          voicedWindowsSec: params.voicedWindowsSec,
        })
      : new Array(totalFrames).fill(params.box);
    const nonNullFrames = boxes.reduce((acc, v) => acc + (v ? 1 : 0), 0);
    const payload = { bounding_boxes: boxes };
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
      return { url: null, nonNullFrames, totalFrames };
    }
    const { data: pub } = supabase.storage.from("composer-frames").getPublicUrl(path);
    return { url: pub?.publicUrl ?? null, nonNullFrames, totalFrames };
  } catch (e) {
    console.warn(`[compose-dialog-segments] bbox-url upload threw: ${(e as Error).message}`);
    return { url: null, nonNullFrames: 0, totalFrames: Math.max(1, params.frameCount) };
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
  probe_frame_url?: string;
  coords_snapped_at?: string;
  coords_snap_origin?: [number, number] | null;
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
  // v100 — crash-safe envelope: keep sceneId/userId/syncApiKey reachable from
  // the outer catch so an uncaught throw before/after dispatch can immediately
  // mark the scene `failed` (with refund) instead of leaving it `pending` until
  // lipsync-watchdog wakes 4 min later and calls failLipSync("preflight_aborted").
  let crashSceneId: string | null = null;
  let crashUserId: string | null = null;
  let crashSupabase: any = null;
  let crashSyncApiKey: string | null = null;

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

    // v100 — register sceneId/userId/supabase/syncApiKey for the crash-safe
    // outer catch (line ~3107). From this point on, any uncaught throw will
    // mark the scene `failed` + refund immediately so the user does not have
    // to wait for lipsync-watchdog.
    crashSceneId = sceneId;
    crashUserId = userId;
    crashSupabase = supabase;
    crashSyncApiKey = syncApiKey || null;

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

    // ── v128 Phase B1 — Terminal-Transition Guard at dispatch entry ──────
    // Alpha-Plan v3.1 §1.9: a pass that is currently terminal (done /
    // done_suspect / failed / canceled_by_scene_failure) cannot leave
    // terminal unless the caller passes `user_retry_flag=true` + a fresh
    // `new_attempt_id` (and credits were re-debited externally). The
    // automatic webhook retry ladder + Plan-D fan-out used to call us with
    // `advance:true` / `retry:true` on already-terminal passes; the guard
    // logs Sentry-P1 `ILLEGAL_TERMINAL_TRANSITION_BLOCKED` and returns
    // without re-dispatch so the pass stays terminal.
    if ((isAdvance || isRetry) && typeof body?.pass_idx === "number") {
      const guard = await assertSafeDispatchEntry(
        supabase,
        {
          scene_id: sceneId,
          pass_idx: Number(body.pass_idx),
          source: isAdvance ? "compose-dialog-segments:advance" : "compose-dialog-segments:retry",
          user_retry_flag: body?.user_retry_flag === true,
          new_attempt_id: typeof body?.new_attempt_id === "string" ? body.new_attempt_id : null,
          credit_charge_result: body?.user_retry_flag === true ? "success" : "skip",
        },
        isRetry ? "retrying" : "dispatched",
      );
      if (!guard.ok && guard.blocked) {
        return json(
          {
            ok: false,
            status: "terminal_transition_blocked",
            scene_id: sceneId,
            pass_idx: Number(body.pass_idx),
            current_status: guard.currentStatus,
            reason: guard.reason,
            hint: "pass is terminal; only an explicit user-retry with a fresh attempt_id may re-dispatch",
          },
          409,
        );
      }
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
      // v100 — Self-heal stale watchdog-killed terminal state on auto-trigger.
      // When the watchdog (or any prior failure) refunded credits and parked
      // dialog_shots in {status:failed, refunded:true}, the previous
      // behaviour returned 409 reset_required, forcing the user to click
      // "Sauber neu starten" manually. For auto-trigger calls we now clear
      // the stale state in-line and continue with a clean dispatch. Manual
      // invocations (auto !== true) still get the 409 so the explicit reset
      // button remains the user's eskalation path.
      const isAutoTrigger = body?.auto === true || body?.recovery === true;
      const existingPasses = Array.isArray((existing as any)?.passes)
        ? ((existing as any).passes as Array<{ status?: string }>)
        : [];
      const hasActivePass = existingPasses.some((p) =>
        ["queued", "rendering", "retrying"].includes(String(p?.status ?? "")),
      );
      const isCleanlyRefunded =
        (existing as any)?.refunded === true && !hasActivePass;
      const canAutoReset =
        isAutoTrigger &&
        existingStatus === "failed" &&
        isCleanlyRefunded;

      if (canAutoReset) {
        console.log(
          `[compose-dialog-segments] v100 auto-reset-stale-failed scene=${sceneId} prev_error=${existingError.slice(0, 120)}`,
        );
        const { error: resetErr } = await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: null,
            lip_sync_status: "pending",
            clip_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
        if (resetErr) {
          console.warn(
            `[compose-dialog-segments] v100 auto-reset write_failed scene=${sceneId} err=${resetErr.message} — falling back to 409`,
          );
          return json(
            {
              error: "reset_required",
              message: "Stale lip-sync failure state detected. Use reset-lipsync-scene before dispatch.",
            },
            409,
          );
        }
        // Continue with a clean slate — `existing` is now logically null.
        (scene as any).dialog_shots = null;
      } else {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} reset_required — refusing stale failed state status=${existingStatus} error=${existingError.slice(0, 160)} auto=${isAutoTrigger} refunded=${(existing as any)?.refunded === true} hasActivePass=${hasActivePass}`,
        );
        return json(
          {
            error: "reset_required",
            message: "Stale lip-sync failure state detected. Use reset-lipsync-scene before v69 dispatch.",
          },
          409,
        );
      }
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

    // ── Plate-native identity override (v77, v129.20) ────────────────────
    // Anchor coords drift 5–15 % vs the rendered Hailuo plate. For multi-
    // speaker scenes that drift routinely lands the Sync.so target on the
    // WRONG face. v129.20: also run for SINGLE-speaker scenes — anchor
    // rescale alone produced coords that miss the face (e.g. [204,171] on
    // a plate where the face actually sits upper-right), which then trips
    // our pre-dispatch face-gate. Plate-native detection is now mandatory
    // for every speaker count ≥ 1.
    const speakerPlateBboxes: Array<[number, number, number, number] | null> =
      new Array(speakers.length).fill(null);
    let plateIdentityMap: Awaited<ReturnType<typeof resolvePlateFaceIdentities>> | null = null;
    if (!isAdvance && speakers.length >= 1 && plateDims && sourceClipUrl) {
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
      // v129.20: for single-speaker scenes sort unlabeled faces by bbox
      // area (largest first) so spurious detections (mirror, background
      // person) lose to the actual subject.
      const unlabeled = plateIdentityMap.faces.filter((f) => !f.characterId);
      if (speakers.length === 1 && unlabeled.length > 1) {
        unlabeled.sort((a, b) => {
          const areaA = (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]);
          const areaB = (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]);
          return areaB - areaA;
        });
      }
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

    // ── v129.20 — Single-speaker no-face hard refund ─────────────────────
    // If Hailuo rendered a plate with zero detectable faces (e.g. subject
    // walked out of frame, extreme back-shot), anchor-rescale would just
    // hand Sync.so a coordinate pointing at empty pixels. Refund and ask
    // the user to re-render the plate instead.
    if (
      !isAdvance &&
      !isRetry &&
      speakers.length === 1 &&
      plateIdentityMap &&
      plateIdentityMap.faces.length === 0
    ) {
      const reason = "plate_face_missing_single_speaker";
      console.error(
        `[compose-dialog-segments] scene=${sceneId} v129.20_single_speaker_no_face — refunding ${totalCost} credits`,
      );
      await failLipSync({
        supabase,
        sceneId,
        reason,
        userId,
        refundCredits: totalCost,
        syncApiKey,
      });
      return json(
        {
          error: "plate_face_missing_single_speaker",
          message: "Plate enthält kein erkennbares Gesicht. Bitte Szene neu rendern.",
          refunded: totalCost,
        },
        422,
      );
    }

    // ── v117 — Plate-Quality Gate (soft) for N≥3 ─────────────────────────
    // v116 blocked whenever Gemini Vision failed to *resolve* identities
    // even when all faces were physically present, producing false-positive
    // "plate is bad" refunds on perfectly fine 4-person plates. v117 narrows
    // the block to the only failure mode where Sync.so genuinely cannot
    // recover: fewer detected faces than expected speakers (e.g. Sora
    // out-of-frame bug). When face *count* matches but identity assignment
    // is shaky, the slot-order fallback in resolvePlateFaceIdentities
    // (also v117) already injects a deterministic mapping, so dispatch is
    // safe to proceed.
    //
    // Gate fires only on the FIRST dispatch attempt (not advance/retry) so
    // re-tries that webhook chains in carry forward.
    const PLATE_GATE_DISABLED = (Deno.env.get("FORCE_SKIP_PLATE_GATE") ?? "").toLowerCase() === "true";
    if (
      !PLATE_GATE_DISABLED &&
      !isAdvance &&
      !isRetry &&
      !isV41Retry &&
      speakers.length >= 3 &&
      plateDims
    ) {
      const detectedFaces = plateIdentityMap?.faces?.length ?? 0;
      const resolvedFaces = plateIdentityMap?.resolvedCount ?? 0;
      // v117: only hard-block when faces are physically missing or the
      // plate-side detection failed entirely. Identity-resolution shortfall
      // alone is NOT a block (slot-order fallback covers it).
      const gateFails =
        !plateIdentityMap ||
        detectedFaces < speakers.length;
      if (resolvedFaces < speakers.length && detectedFaces >= speakers.length) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v117_plate_quality_gate_SOFT_WARN detected=${detectedFaces}/${speakers.length} resolved=${resolvedFaces}/${speakers.length} — dispatch proceeds with slot-order coords`,
        );
      }
      if (gateFails) {
        const reason = !plateIdentityMap
          ? "plate_identity_unavailable"
          : `plate_faces_missing(detected=${detectedFaces}, expected=${speakers.length})`;
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v117_plate_quality_gate_BLOCK ${reason} — refunding ${totalCost} credits and forcing plate re-render`,
        );
        // Refund the wallet debit (line ~824 already deducted totalCost).
        try {
          const { data: w } = await supabase
            .from("wallets").select("balance").eq("user_id", userId).single();
          await supabase
            .from("wallets")
            .update({
              balance: Number(w?.balance ?? 0) + Number(totalCost ?? 0),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        } catch (refundErr) {
          console.error(
            `[compose-dialog-segments] scene=${sceneId} v117_plate_quality_gate refund failed: ${(refundErr as Error)?.message}`,
          );
        }
        // Reset clip so the user / Composer re-renders the plate.
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: {
              ...(existing ?? {}),
              version: 5,
              engine: "sync-segments",
              status: "failed",
              cost_credits: 0,
              refunded: true,
              error: `v117_plate_quality_gate:${reason}`,
              finished_at: new Date().toISOString(),
            },
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_status: "pending",
            clip_url: null,
            lip_sync_source_clip_url: null,
            clip_error: `Plate-Quality-Gate (v117): Auf dem aktuellen Scene-Clip sind nicht alle ${speakers.length} Charaktere als Gesichter erkennbar (erkannt: ${detectedFaces} von ${speakers.length}). Sync.so kann fehlende Personen nicht animieren. Bitte die Szene neu rendern — alle ${speakers.length} Personen müssen frontal sichtbar im Bild sein, keine angeschnittenen Köpfe. Credits wurden zurückerstattet.`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
        try {
          await logSyncDispatch(supabase, {
            scene_id: sceneId, user_id: userId, engine: "sync-segments",
            sync_status: "PREFLIGHT_BLOCKED",
            error_class: "v117_plate_quality_gate",
            error_message: reason,
            meta: {
              speakers: speakers.length,
              detected_faces: detectedFaces,
              resolved_faces: resolvedFaces,
              plate_url: sourceClipUrl,
              plate_dims: plateDims,
              refunded_credits: totalCost,
            },
          });
        } catch (_) { /* best-effort */ }
        return json(
          {
            error: "v117_plate_quality_gate",
            message: `Plate enthält ${detectedFaces} Gesichter, erwartet ${speakers.length}. Bitte Szene neu rendern.`,
            detected_faces: detectedFaces,
            resolved_faces: resolvedFaces,
            expected: speakers.length,
            refunded: totalCost,
          },
          422,
        );
      }
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

    // ── v110 — Soft Coords-Close Warning (no longer a blocker) ───────────
    // v107 used to hard-fail the entire scene when two speaker face coords
    // were closer than max(120 px, plate.width × 0.08). That guard was
    // written for the legacy v69 single-face-preclip pipeline where a close
    // sibling collapsed the crop to a useless tiny square. With v109
    // native-resolution preclip a smaller crop is no longer destructive —
    // Sync.so either lip-syncs cleanly or returns a per-pass closed-mouth
    // no-op for that single speaker. The remaining N-1 speakers must not be
    // killed alongside. We keep the measurement as a warning only.
    if (speakers.length >= 2 && plateDims && !isAdvance && !isRetry) {
      const pts: Array<[number, number, number]> = speakerCoords
        .map((c, i) => (c ? [Number(c[0]), Number(c[1]), i] as [number, number, number] : null))
        .filter((p): p is [number, number, number] => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      let minDist = Infinity;
      let collisionPair: [number, number] | null = null;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
          if (d < minDist) {
            minDist = d;
            collisionPair = [pts[i][2], pts[j][2]];
          }
        }
      }
      const softThreshold = Math.max(120, Math.round(plateDims.width * 0.08));
      if (collisionPair && minDist < softThreshold) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v110_coords_close ` +
          `speakers=${speakers.length} minDist=${Math.round(minDist)}px ` +
          `threshold=${softThreshold}px pair=${collisionPair[0]}_${collisionPair[1]} — proceeding (no block)`,
        );
      }
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

    // v95 — Per-Turn Pass Split (flag-gated, default ON).
    // Background: v94 made the per-pass preclip span the union of all turns
    // of the speaker so Sync.so (sync_mode=cut_off) wouldn't truncate the
    // output below the tight-WAV length. That fixed length but exposed a
    // second problem: the preclip now also covers the PLATE-SILENT region
    // between turn 1 and turn 2. Sync.so tries to animate turn-2 audio onto
    // plate frames with a closed/idle mouth → minimal lip movement.
    // Fix: split each multi-turn pass into N single-turn passes. Each pass
    // gets a short preclip covering only that turn's mouth-active plate
    // region and a short tight-WAV covering only that turn's audio →
    // Sync.so animates the full output. v94 union-window logic still runs
    // but becomes a no-op (min=max=turn window).
    const splitMultiTurnFlagOn = await (async () => {
      try {
        const { data } = await supabase
          .from("system_config")
          .select("value")
          .eq("key", "composer.split_multi_turn_passes")
          .maybeSingle();
        // Default ON when row missing or value not explicitly false.
        if (data?.value === false || data?.value === "false") return false;
        return true;
      } catch { return true; }
    })();

    const builtPassesRaw: PassState[] = passSpeakers.map(({ sp, originalIdx }, passIdx) => {
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

    const builtPasses: PassState[] = splitMultiTurnFlagOn
      ? builtPassesRaw.flatMap((p) => {
          if (!Array.isArray(p.segments) || p.segments.length <= 1) return [p];
          // Expand into N single-turn passes; preserves all identity fields.
          return p.segments.map((seg) => ({
            ...p,
            segments: [seg],
          }));
        }).map((p, i) => ({ ...p, idx: i }))
      : builtPassesRaw;

    if (splitMultiTurnFlagOn && builtPasses.length !== builtPassesRaw.length) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v95_per_turn_split raw=${builtPassesRaw.length} → expanded=${builtPasses.length} ` +
        `(${builtPassesRaw.map((p) => `${p.speaker_name}:${p.segments.length}t`).join(", ")})`,
      );
    }

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

      // v97 (Juni 10 2026) — Face-Gate-Repair PARALLEL statt seriell.
      // Vorher: 4 Sprecher × ~12 s Gemini-Frame-Detect = ~50 s wallclock.
      // Jetzt: alle Passes laufen via Promise.all (frame_face_cache dedupliziert
      // identische Frames automatisch) → ~12-15 s wallclock.
      type GateOutcome =
        | { ok: true; pass: any }
        | { ok: false; pass: any; reason: string; strict: boolean; hadFaces: boolean; frames: number[]; lastValidationFrame?: number };

      const gateOne = async (pass: any): Promise<GateOutcome> => {
        const firstTurn = pass.segments[0];
        if (!firstTurn) return { ok: true, pass };
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

          const faceBoxes = Array.isArray(v.faceBoxes) ? [...v.faceBoxes] : [];
          const sortedBoxes = faceBoxes
            .filter((b: any) => Number(b?.w) > 0.02 && Number(b?.h) > 0.02)
            .sort((a: any, b: any) => Number(a.x) - Number(b.x));
          const enoughFaces = sortedBoxes.length >= Math.max(1, speakers.length);
          const speakerHasOwnSlot = pass.speaker_idx < sortedBoxes.length;
          const canRepair = speakerHasOwnSlot && (speakers.length < 3 || enoughFaces);
          const slot = canRepair ? pass.speaker_idx : -1;
          const box = slot >= 0 ? sortedBoxes[slot] : null;

          // v96 — Multi-speaker: prefer plate-derived coords over anchor rescale.
          const shouldForceRepair =
            speakers.length >= 3 && !!plateDims && !!box && enoughFaces;

          if (!shouldForceRepair && (!strictTargetCheck || v.coordsMatch !== false)) {
            pass.reference_frame_number = frame;
            accepted = true;
            break;
          }
          if (box && plateDims) {
            const repaired: [number, number] = [
              Math.round((Number(box.x) + Number(box.w) / 2) * plateDims.width),
              Math.round((Number(box.y) + Number(box.h) * 0.45) * plateDims.height),
            ];
            const original = pass.coords;
            pass.coords = clampSyncCoords(repaired);
            pass.reference_frame_number = frame;
            pass.face_repair = {
              source: shouldForceRepair
                ? "v96_plate_frame_force_repair"
                : "plate_frame_left_to_right",
              frame_number: frame,
              original_coords: original,
              repaired_coords: pass.coords,
              face_count: sortedBoxes.length,
              slot,
              strict_gate: strictTargetCheck,
            };
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} FACE-GATE REPAIR (${shouldForceRepair ? "v96-force" : "strict"}) pass=${pass.idx} speaker=${pass.speaker_name} frame=${frame} original=${JSON.stringify(original)} repaired=${JSON.stringify(pass.coords)} faces=${sortedBoxes.length}`,
            );
            accepted = true;
            break;
          }
          if (!strictTargetCheck) {
            pass.reference_frame_number = frame;
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
          return {
            ok: false, pass, reason,
            strict: strictTargetCheck, hadFaces, frames,
            lastValidationFrame: lastValidation?.frame,
          };
        }
        return { ok: true, pass };
      };

      const gateResults = await Promise.all(builtPasses.map((p: any) => gateOne(p)));

      // ── v119 — Soft-pass when plate-identity is already authoritative ──
      // If `plateIdentityMap` already resolved >= speakers.length faces, the
      // pass already carries plate-pixel-space coords + bbox from the real
      // rendered plate (see plate-face-identity block above). The strict
      // mid-turn Gemini frame check is then only a diagnostic. Hard-failing
      // here (e.g. because the speaker briefly turned their head on the
      // probed frame) blocks a perfectly dispatchable Sync.so call with
      // `bounding_boxes_url` — the exact false positive the user is hitting
      // on scene 90116518…  Demote it to a soft warning and dispatch on.
      const plateIdentityAuthoritative =
        !!plateIdentityMap &&
        (plateIdentityMap.resolvedCount ?? 0) >= speakers.length;
      const firstReject = gateResults.find((r) => !r.ok) as Extract<GateOutcome, { ok: false }> | undefined;
      if (firstReject && plateIdentityAuthoritative) {
        const blockedNames = gateResults
          .filter((r) => !r.ok)
          .map((r) => (r as Extract<GateOutcome, { ok: false }>).pass.speaker_name);
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v119_face_gate_SOFT_WARN strict_blocks=${blockedNames.join(",")} plate_identity_resolved=${plateIdentityMap?.resolvedCount}/${speakers.length} — proceeding with plate-identity coords + bbox-url dispatch`,
        );
        for (const r of gateResults) {
          if (!r.ok) {
            const rr = r as Extract<GateOutcome, { ok: false }>;
            if (rr.pass && rr.pass.reference_frame_number == null) {
              rr.pass.reference_frame_number = rr.lastValidationFrame ?? rr.frames?.[0] ?? 0;
            }
          }
        }
      } else if (firstReject) {
        const { pass, reason, strict, hadFaces } = firstReject;
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
            error: strict && hadFaces ? "plate_target_face_missing" : "face_validation_failed",
            details: strict && hadFaces
              ? `target face for ${pass.speaker_name} is not reliably visible on the final scene plate — re-render with all faces in frame`
              : `no face for ${pass.speaker_name} in tested frames`,
            refunded: totalCost,
            hint: strict && hadFaces ? "re_render_scene_clip" : "switch_to_cinematic_sync_engine",
          },
          422,
        );
      }
    }



    // ── Concurrency guard ────────────────────────────────────────────────
    const MAX_INFLIGHT = 4; // v98: raised from 3 so 4-speaker scenes dispatch in one wave
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
          // v128 — Alpha-Plan v3.1 §1.8: terminal coord-refresh guard.
          // For terminal passes (done/failed) the v123 reset logic would
          // silently flip status back to `pending`, violating the
          // "terminal means terminal" invariant. We now record the new
          // coord as a `candidate_coords` debug field, log a warning event,
          // and leave the terminal pass UNTOUCHED. Only non-terminal
          // passes get the legacy preclip-invalidate + coord-update.
          const isTerminal = p.status === "done" || p.status === "failed";
          if (isTerminal) {
            (p as any).candidate_coords = [freshCoord[0], freshCoord[1]];
            (p as any).candidate_coords_at = new Date().toISOString();
            (p as any).candidate_coords_source = freshSource;
            try {
              await logSyncDispatch(supabase, {
                scene_id: sceneId,
                user_id: userId,
                engine: "sync-segments",
                sync_status: "COORD_REFRESH_SKIPPED",
                error_class: "coord_refresh_terminal_blocked",
                meta: {
                  v128_guard: true,
                  pass_idx: p.idx,
                  speaker_idx: idx,
                  speaker_name: p.speaker_name,
                  old_coord: oldCoord,
                  new_coord: [freshCoord[0], freshCoord[1]],
                  source: freshSource,
                  terminal_status: p.status,
                  dispatch_source: "coord-refresh-skipped",
                },
              });
            } catch { /* best-effort */ }
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} v128 COORD-REFRESH-SKIPPED ` +
              `pass=${p.idx} speaker=${p.speaker_name} status=${p.status} (terminal, candidate stored)`,
            );
            continue;
          }
          // Non-terminal: legacy v123 stale-preclip invalidation path.
          (p as any).preclip_url = null;
          (p as any).preclip_crop = null;
          (p as any).preclip_render_id = null;
          (p as any).preclip_bbox_drift_rejected = false;
          (p as any).preclip_error = null;
          (p as any).preclip_face_count = null;
          p.coords = [freshCoord[0], freshCoord[1]];
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v128 ADVANCE COORDS REFRESH (non-terminal) + PRECLIP INVALIDATE ` +
            `pass=${p.idx} speaker=${p.speaker_name} old=${JSON.stringify(oldCoord)} new=${JSON.stringify(p.coords)} source=${freshSource}`,
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

    // ── v120 — Pass-4 / silent-bbox-url-pro Preclip-Forcing ──────────────
    // Root cause for the ec4290f2… zombie: Sarah's Pass 4 reproducibly
    // failed on `bbox-url-pro` with `provider_unknown_error` (no error_code)
    // while Passes 2/3 succeeded via the preclip path. After 2 silent
    // bbox-url-pro fails for this pass, force the dispatch onto the
    // single-face preclip path that works on this exact plate.
    let v120ForcePreclip = false;
    try {
      const { count: silentBboxFails } = await supabase
        .from("syncso_dispatch_log")
        .select("id", { count: "exact", head: true })
        .eq("scene_id", sceneId)
        .eq("sync_status", "FAILED")
        .eq("error_class", "provider_unknown_error")
        .filter("meta->>pass_idx", "eq", String(currentPassIdx))
        .filter("meta->>retry_variant", "eq", "bbox-url-pro");
      if ((silentBboxFails ?? 0) >= 2) {
        v120ForcePreclip = true;
        // Drop any cached preclip so the renderer rebuilds fresh below
        // (also dodges expired-signed-URL traps).
        (pass as any).preclip_url = null;
        (pass as any).preclip_render_id = null;
        (pass as any).preclip_crop = null;
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v120_pass4_preclip_forced silent_bbox_url_pro_fails=${silentBboxFails} — switching to single-face preclip path`,
        );
      }
    } catch (e) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v120 preclip-force probe failed: ${(e as Error)?.message}`,
      );
    }

    // ── v118 — Pass-level Sync.so circuit breaker ────────────────────────
    // Stop the silent dispatch→FAILED→dispatch loop that previously ran
    // until the user manually reset the scene. Cap each (scene, pass) at
    // 5 FAILED Sync.so dispatches; after that refund credits idempotently,
    // mark the scene `failed`, and bail. The Composer UI surfaces
    // `clip_error` automatically and the user can hit "Sauber neu starten".
    try {
      const PASS_FAIL_CAP = 5;
      const { count: passFailCount } = await supabase
        .from("syncso_dispatch_log")
        .select("id", { count: "exact", head: true })
        .eq("scene_id", sceneId)
        .eq("sync_status", "FAILED")
        .filter("meta->>pass_idx", "eq", String(currentPassIdx));
      if ((passFailCount ?? 0) >= PASS_FAIL_CAP) {
        const reason = `lipsync_exhausted_pass_${currentPassIdx + 1}_speaker_${pass.speaker_name ?? "?"}_after_${passFailCount}_failures`;
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v118_circuit_breaker pass=${currentPassIdx + 1} fails=${passFailCount} — refunding ${totalCost} and marking scene failed`,
        );
        const alreadyRefundedCB = !!(existing as any)?.refunded;
        if (!alreadyRefundedCB) {
          try {
            const { data: wCB } = await supabase
              .from("wallets").select("balance").eq("user_id", userId).single();
            await supabase
              .from("wallets")
              .update({
                balance: Number(wCB?.balance ?? 0) + Number(totalCost ?? 0),
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
          } catch (refundErr) {
            console.error(
              `[compose-dialog-segments] scene=${sceneId} v118_circuit_breaker refund failed: ${(refundErr as Error)?.message}`,
            );
          }
        }
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: {
              ...(existing ?? {}),
              version: 5,
              engine: "sync-segments",
              status: "failed",
              cost_credits: 0,
              refunded: true,
              error: `v118_circuit_breaker:${reason}`,
              finished_at: new Date().toISOString(),
            },
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_status: "failed",
            clip_error: `Lip-Sync abgebrochen: Sync.so hat für Sprecher „${pass.speaker_name ?? `Pass ${currentPassIdx + 1}`}" ${passFailCount}× hintereinander mit „provider_unknown_error" abgebrochen. Credits wurden zurückerstattet. Bitte drücke „Sauber neu starten" oder render die Plate neu, falls das Gesicht nicht klar erkennbar ist.`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
        try {
          await logSyncDispatch(supabase, {
            scene_id: sceneId, user_id: userId, engine: "sync-segments",
            sync_status: "CIRCUIT_BREAKER_OPEN",
            error_class: "v118_pass_circuit_breaker",
            error_message: reason,
            meta: {
              pass_idx: currentPassIdx,
              total_passes: passes.length,
              speaker: pass.speaker_name,
              failures_observed: passFailCount,
              cap: PASS_FAIL_CAP,
              refunded_credits: alreadyRefundedCB ? 0 : totalCost,
            },
          });
        } catch (_) { /* best-effort */ }
        return json(
          {
            error: "v118_pass_circuit_breaker",
            reason,
            refunded: alreadyRefundedCB ? 0 : totalCost,
          },
          422,
        );
      }
    } catch (cbErr) {
      // Circuit-breaker failure must NEVER block dispatch — just log.
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v118_circuit_breaker probe failed: ${(cbErr as Error)?.message}`,
      );
    }


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
    // v126 — Unified single-face preclip pipeline for ALL N (1..4).
    // Variant is diagnostic-only now: dispatch payload is ALWAYS
    // preclip + sync-3 + auto_detect + cut_off (see usePassPreclip block).
    // Full-plate `bbox-url-pro` is removed as a first-dispatch option — it
    // was the root cause of Samuel's `provider_unknown_error` on scene
    // cba18767 (DB-verified June 15 2026). If a preclip cannot be produced
    // we fail clean + refund, never silently fall back to full-plate.
    void v120ForcePreclip;
    void havePlateIdentityForDispatch;
    void hasPassPreclipForDispatch;
    const freshDefaultVariant: RetryVariant = "coords-pro";
    let retryVariant: RetryVariant = isRetry
      ? (requestedRetryVariant ?? (prevState?.passes?.[currentPassIdx]?.retry_variant as RetryVariant | undefined) ?? "coords-pro")
      : freshDefaultVariant;
    // v126 — Normalize legacy full-plate variants from older retries back to
    // the unified preclip path. Webhook may still hand us "bbox-url-pro" etc.
    if (retryVariant === "bbox-url-pro" || retryVariant === "coords-pro-box" || retryVariant === "auto-pro" || retryVariant === "auto-standard") {
      retryVariant = "coords-pro";
    }

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
          // v126 — Edge-speaker skip REMOVED. Every speaker, regardless of
          // position on the plate, gets a single-face preclip. The full-plate
          // bbox-url-pro path is no longer used as a first-dispatch option.
          if (!Array.isArray(p.coords) || p.coords.length !== 2) {
            return { idx, status: "skip_no_coords" as const };
          }
          // v94: span ALL turns of this speaker (union of segments) so the
          // preclip is long enough to cover the full Tight-WAV. Otherwise
          // Sync.so (sync_mode=cut_off) caps the output at preclip length and
          // turns 2..N of the same speaker render as a frozen last frame.
          const passSegs = Array.isArray(p.segments) ? p.segments : [];
          if (passSegs.length === 0) return { idx, status: "skip_no_turn" as const };
          const segStarts = passSegs.map((t: any) => Number(t.startTime)).filter((n) => Number.isFinite(n));
          const segEnds = passSegs.map((t: any) => Number(t.endTime)).filter((n) => Number.isFinite(n));
          if (segStarts.length === 0 || segEnds.length === 0) return { idx, status: "skip_no_turn" as const };
          const winStartSec = Math.max(0, Math.min(...segStarts) - 0.08);
          const winEndSec = Math.min(totalSec, Math.max(...segEnds) + 0.08);
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
          // v122 — Coords-as-Truth: render once, verify `coords` is inside
          // the returned crop. If a drifted `bbox` placed the crop on a
          // neighbor, re-render once with `bbox=null` (forces coords-centered
          // square crop in computeFaceCrop). Without this guard Sync.so
          // animates the wrong face and the audio-mux overlays it back at
          // the wrong screen position → "speaker N's mouth never moves".
          const cx = Number((p.coords as any)?.[0]);
          const cy = Number((p.coords as any)?.[1]);
          const coordsInsideCrop = (crop: { x: number; y: number; size: number }) => {
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return true;
            const cxc = crop.x + crop.size / 2;
            const cyc = crop.y + crop.size / 2;
            const dx = Math.abs(cx - cxc);
            const dy = Math.abs(cy - cyc);
            const halfMargin = crop.size * 0.35; // 70% inner band
            return dx <= halfMargin && dy <= halfMargin;
          };
          let preclip = await renderPassFacePreclip(
            supabase, serviceKey, supabaseUrl,
            {
              sceneId, projectId: (scene as any).project_id, userId, passIdx: idx,
              masterVideoUrl: sourceClipUrl,
              srcWidth: plateDims!.width, srcHeight: plateDims!.height,
              coords: p.coords as [number, number],
              bbox: bboxForCrop,
              siblingCoords,
              startSec: winStartSec, endSec: winEndSec,
            },
            90_000,
          );
          if (preclip.ok && preclip.crop && !coordsInsideCrop(preclip.crop)) {
            const cropCx = preclip.crop.x + preclip.crop.size / 2;
            const cropCy = preclip.crop.y + preclip.crop.size / 2;
            console.log(
              `[compose-dialog-segments] scene=${sceneId} pass=${idx + 1} v122_bbox_drift_rejected ` +
              `speaker=${p.speaker_idx} coords=[${cx},${cy}] crop_center=[${Math.round(cropCx)},${Math.round(cropCy)}] ` +
              `delta_px=[${Math.round(Math.abs(cx - cropCx))},${Math.round(Math.abs(cy - cropCy))}] size=${preclip.crop.size} — re-rendering bbox=null`,
            );
            (p as any).preclip_bbox_drift_rejected = true;
            preclip = await renderPassFacePreclip(
              supabase, serviceKey, supabaseUrl,
              {
                sceneId, projectId: (scene as any).project_id, userId, passIdx: idx,
                masterVideoUrl: sourceClipUrl,
                srcWidth: plateDims!.width, srcHeight: plateDims!.height,
                coords: p.coords as [number, number],
                bbox: null,
                siblingCoords,
                startSec: winStartSec, endSec: winEndSec,
              },
              90_000,
            );
          }
          if (!preclip.ok || !preclip.preclipUrl || !preclip.crop) {
            (p as any).preclip_error = preclip.error ?? "unknown";
            return { idx, status: "render_failed" as const, err: preclip.error };
          }
          // Mirror per-pass face-gate (validates exactly 1 face in preclip mid-frame).
          // v122 — pass preclip-local normalized coords as targetCoords so the
          // detector can flag wrong-speaker preclips via `coordsMatch=false`.
          // v129.18 — check FIRST + MID + LAST frame so a face entering/leaving
          // the crop mid-turn is caught before dispatch (root cause of the
          // "frame 35 coords below face" generation_unknown_error).
          let faceOk = true;
          let faceCount: number | null = null;
          let coordsMatch: boolean | null = null;
          let failedGateFrame: "first" | "mid" | "last" | null = null;
          const localTargetCoords = (() => {
            if (!Number.isFinite(cx) || !Number.isFinite(cy) || !preclip.crop) return null;
            const lx = (cx - preclip.crop.x) / preclip.crop.size;
            const ly = (cy - preclip.crop.y) / preclip.crop.size;
            if (lx < 0 || lx > 1 || ly < 0 || ly > 1) return null;
            return [lx, ly] as [number, number];
          })();
          try {
            const totalFrames = Math.max(2, Math.round((preclip.durationSec ?? 1) * 30));
            const frameSet: Array<{ tag: "first" | "mid" | "last"; n: number }> = [
              { tag: "first", n: 1 },
              { tag: "mid", n: Math.max(1, Math.round(totalFrames / 2)) },
              { tag: "last", n: Math.max(1, totalFrames - 1) },
            ];
            for (const f of frameSet) {
              const v = await validateFrameFace({
                supabaseUrl, serviceKey,
                videoUrl: preclip.preclipUrl,
                frameNumber: f.n, fps: 30,
                targetCoords: localTargetCoords,
              });
              if (!v.ok) continue;
              const c = Number(v.faceCount ?? 0);
              if (f.tag === "mid") {
                faceCount = c;
                coordsMatch = v.coordsMatch;
              }
              if (c === 0 || c > 1 || v.coordsMatch === false) {
                faceOk = false;
                failedGateFrame = f.tag;
                if (faceCount === null) faceCount = c;
                if (coordsMatch === null) coordsMatch = v.coordsMatch;
                break;
              }
            }
          } catch (_) { /* validation soft-fail → trust the preclip */ }
          if (!faceOk) {
            (p as any).preclip_error = `face_gate_failed:frame=${failedGateFrame}:count=${faceCount}:coordsMatch=${coordsMatch}`;
            (p as any).preclip_face_count = faceCount;
            (p as any).preclip_face_gate_failed_frame = failedGateFrame;
            return { idx, status: "face_gate_blocked" as const, faceCount };
          }
          (p as any).preclip_url = preclip.preclipUrl;
          (p as any).preclip_render_id = preclip.preclipRenderId ?? null;
          (p as any).preclip_crop = {
            x: preclip.crop.x, y: preclip.crop.y,
            size: preclip.crop.size, outputSize: preclip.crop.outputSize,
          };
          // v102 Step A — persist preclip duration so the dispatch builder can
          // log the real video frame count vs. the bbox-array length and the
          // audio duration. This lets us prove/disprove the "bbox count != video
          // frames" root-cause for the sync-3 `provider_unknown_error` loop.
          (p as any).preclip_duration_sec = typeof preclip.durationSec === "number"
            ? preclip.durationSec
            : null;
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
    // v97 (Pipeline-Vergleich mit Sync.so Docs, Juni 10 2026) —
    // Generalisierung des v88 Edge-Speaker-Skips auf ALLE Multi-Speaker-Szenen.
    // Sync.so sync-3 verarbeitet die volle Plate nativ mit Multi-Face,
    // Profile & Occlusion-Support, wenn wir `bounding_boxes_url` setzen
    // (siehe docs/developer-guides/speaker-selection). Unsere 512×512
    // Single-Face-Preclips sind eine ~67 s teure Workaround-Pipeline gegen
    // ein Problem, das sync-3 nativ löst, und sind die Hauptquelle der
    // "An unknown error occurred."-Fehler (preclip face-gate fails →
    // Fallback auf full-plate-with-plate-coords → Sync.so frame_number
    // zeigt auf den preclip-zugehörigen Frame im echten Plate-Video).
    // Wir routen jeden Multi-Speaker-Pass auf den bbox-url-pro Pfad,
    // wenn er verfügbar ist. Single-Speaker und Szenen ohne plate-identity
    // fallen weiterhin auf den preclip-Pfad zurück (unverändert).
    // v125 (June 15 2026) — Edge-speaker preclip skip DISABLED.
    // Root cause for scene 34757e6a… (DB-verified): Samuel sat at x≈306 on
    // a 1376px-wide plate (xFrac ≈ 0.22 < 0.25), so v88 routed him to the
    // full-plate `bbox-url-pro` path. Both attempts returned
    // `provider_unknown_error` while the other 3 speakers (preclip path)
    // succeeded → scene died as `multi_speaker_incomplete_3_of_4`.
    // The v116 face-gate self-repair (expansion ladder 1.0/1.4/1.8) handles
    // edge crops correctly, so there is no reason to skip the preclip just
    // because the speaker sits near the rim. We keep `speakerIsEdgePositioned`
    // as a diagnostic but force `skipPreclipForEdgeSpeaker` to false so v107
    // (hard preclip enforcement) is the only gate.
    // v120's preclip-forcing branch is preserved (silentBboxFails detector
    // still clears any cached preclip when bbox-url-pro had two silent fails).
    const skipPreclipForEdgeSpeaker = false;
    void speakerIsEdgePositioned;
    void haveBboxUrlPathForEdge;
    // v107 — Hard-preclip enforcement: every multi-speaker pass MUST go
    // through the single-face preclip path. v105 force-fullplate was the
    // root cause of the "2 mouths closed, 2 mouths speak everyone's lines"
    // failure on 4-speaker scenes (DB-verified 89db58ca on 2026-06-11):
    // coords 838 px and 901 px (Δ 63 px on 1376 px wide plate) collided so
    // sync-3 routed two audios onto the same face and morphed neighbours
    // together. Only exception: edge-speaker bbox-url-pro path (v88), which
    // is doc-compliant on the full multi-face plate. If a preclip can't be
    // produced for an N>=2 pass we MUST hard-fail with refund — no silent
    // full-plate fallback. See mem/architecture/lipsync/v107-hard-preclip-enforcement.md.
    if (skipPreclipForEdgeSpeaker) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v88_edge_speaker_skip_preclip coords=${JSON.stringify(pass.coords)} plate=${plateDims!.width}x${plateDims!.height} → full-plate deterministic ASD (bbox-url-pro)`,
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

    // v114 — On retry the cached preclip_url may be a Supabase signed URL
    // that has expired (24h TTL). If Sync.so can't fetch it we get
    // `generation_input_video_download_error` and the pass silently dies.
    // HEAD-probe the cached URL on retry; clear it so we re-render fresh.
    if (isRetry && (pass as any).preclip_url) {
      try {
        const head = await fetch(String((pass as any).preclip_url), { method: "HEAD" });
        if (!head.ok) {
          console.log(`[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v114_preclip_url_stale status=${head.status} → re-render`);
          (pass as any).preclip_url = null;
          (pass as any).preclip_render_id = null;
          (pass as any).preclip_crop = null;
        }
      } catch (_) {
        (pass as any).preclip_url = null;
        (pass as any).preclip_render_id = null;
        (pass as any).preclip_crop = null;
      }
    }

    if (wantPassPreclip && !(pass as any).preclip_url) {
      // v94: Window spans the UNION of all turns for this speaker, not just
      // the first turn. Sync.so with sync_mode=cut_off caps output at
      // min(video, audio); if the preclip only covers turn 1, turns 2..N of
      // the same speaker freeze on the last preclip frame and lose lipsync.
      const passSegsForPreclip = Array.isArray(pass.segments) ? pass.segments : [];
      const psStarts = passSegsForPreclip.map((t: any) => Number(t.startTime)).filter((n) => Number.isFinite(n));
      const psEnds = passSegsForPreclip.map((t: any) => Number(t.endTime)).filter((n) => Number.isFinite(n));
      const winStartSec = psStarts.length > 0 ? Math.max(0, Math.min(...psStarts) - 0.08) : 0;
      const winEndSec = psEnds.length > 0 ? Math.min(totalSec, Math.max(...psEnds) + 0.08) : totalSec;
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

      // v116 (Fix B) — Face-Gate Self-Repair: render preclip; if the
      // face-gate finds 0 faces (coords/bbox missed the actual face on
      // the moving plate), re-render with an expanded crop (×1.4, then
      // ×1.8) and re-validate. This rescues the multi-speaker failure
      // mode where Sarah / late-pass speakers came back with faces=0
      // and the chain hard-failed. We DO NOT retry on faces>1 (that's
      // a real "two heads in crop" condition — bigger crop would only
      // make it worse). Total worst-case = 3 Lambda renders / ~3 min.
      const EXPANSION_LADDER = [1.0, 1.4, 1.8];
      let preclip: Awaited<ReturnType<typeof renderPassFacePreclip>> | null = null;
      let preclipDims: Awaited<ReturnType<typeof probeMp4Dims>> | null = null;
      let preclipFaceOk = true;
      let preclipFaceCount: number | null = null;
      let repairAttempts = 0;
      let resolutionBlocked = false;

      for (let attempt = 0; attempt < EXPANSION_LADDER.length; attempt++) {
        const factor = EXPANSION_LADDER[attempt];
        if (attempt > 0) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v116_face_gate_repair attempt=${attempt + 1}/${EXPANSION_LADDER.length} factor=${factor.toFixed(2)} (prev faces=${preclipFaceCount})`,
          );
          repairAttempts = attempt;
        }
        preclip = await renderPassFacePreclip(
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
            cropExpansionFactor: factor,
          },
          90_000,
        );
        if (!preclip.ok || !preclip.preclipUrl || !preclip.crop) {
          // Render-level failure — no point expanding the crop; abort the loop.
          break;
        }
        preclipDims = await probeMp4Dims(preclip.preclipUrl).catch(() => null);
        const minPreclipAxis = Math.min(Number(preclipDims?.width ?? 0), Number(preclipDims?.height ?? 0));
        if (!preclipDims || minPreclipAxis < 720) {
          resolutionBlocked = true;
          break;
        }
        // Face-gate (v77 / v129.21): require exactly 1 face — now also
        // active for SINGLE-speaker preclips (v129.21 removed the
        // `speakers.length >= 2` guard, since MediaPipe-backed detection
        // is reliable enough for N=1 and catches subject-walk-off-frame).
        // v129.18 — validate FIRST + MID + LAST frame, not just mid; a face
        // entering/leaving the crop mid-turn was the actual root cause of
        // the Sync.so `generation_unknown_error` (ASD frame N coords below
        // the face → Sync.so sees pullover, not face).
        preclipFaceOk = true;
        preclipFaceCount = null;
        if (speakers.length >= 1) {
          try {
            const totalFrames = Math.max(2, Math.round((preclip.durationSec ?? 1) * 30));
            const frameSet: Array<{ tag: "first" | "mid" | "last"; n: number }> = [
              { tag: "first", n: 1 },
              { tag: "mid", n: Math.max(1, Math.round(totalFrames / 2)) },
              { tag: "last", n: Math.max(1, totalFrames - 1) },
            ];
            for (const f of frameSet) {
              const v = await validateFrameFace({
                supabaseUrl, serviceKey,
                videoUrl: preclip.preclipUrl,
                frameNumber: f.n, fps: 30,
                targetCoords: null,
              });
              if (!v.ok) continue;
              const c = Number(v.faceCount ?? 0);
              if (f.tag === "mid") preclipFaceCount = c;
              if (c === 0 || c > 1) {
                preclipFaceOk = false;
                if (preclipFaceCount === null) preclipFaceCount = c;
                (pass as any).preclip_face_gate_failed_frame = f.tag;
                break;
              }
            }
          } catch (e) {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} preclip_face_gate threw: ${(e as Error)?.message}`,
            );
          }
        }
        if (preclipFaceOk) break;
        // Only retry-with-expansion when face was missed entirely (count 0).
        // count>1 → bigger crop won't help, drop straight through.
        if (preclipFaceCount !== 0) break;
      }

      if (resolutionBlocked) {
        (pass as any).preclip_dims = preclipDims ?? null;
        (pass as any).preclip_error = `preclip_resolution_too_small:${preclipDims?.width ?? "?"}x${preclipDims?.height ?? "?"}`;
        console.error(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v113_preclip_resolution_BLOCK actual=${preclipDims?.width ?? "?"}x${preclipDims?.height ?? "?"} expected>=720`,
        );
      } else if (preclip && preclip.ok && preclip.preclipUrl && preclip.crop) {
        (pass as any).preclip_dims = preclipDims ?? null;
        (pass as any).preclip_repair_attempts = repairAttempts;
        if (preclipFaceOk) {
          (pass as any).preclip_url = preclip.preclipUrl;
          (pass as any).preclip_render_id = preclip.preclipRenderId ?? null;
          (pass as any).preclip_crop = {
            x: preclip.crop.x,
            y: preclip.crop.y,
            size: preclip.crop.size,
            outputSize: preclip.crop.outputSize,
          };
          (pass as any).preclip_duration_sec = typeof preclip.durationSec === "number"
            ? preclip.durationSec
            : null;
          (pass as any).preclip_error = null;
          (pass as any).preclip_face_count = preclipFaceCount;
          console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v77_preclip_ready faces=${preclipFaceCount ?? "skip"} repair_attempts=${repairAttempts} url=${preclip.preclipUrl.slice(0, 100)} crop={x:${preclip.crop.x},y:${preclip.crop.y},size:${preclip.crop.size}}`,
          );
        } else {
          (pass as any).preclip_error = `face_gate_failed:count=${preclipFaceCount} (after ${repairAttempts} v116 repair attempts)`;
          (pass as any).preclip_face_count = preclipFaceCount;
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v116_preclip_face_gate_BLOCK faces=${preclipFaceCount} repair_attempts=${repairAttempts} — full-plate fallback`,
          );
        }
      } else {
        (pass as any).preclip_error = (preclip?.error ?? "unknown");
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v69_preclip_unified_failed ${preclip?.errorClass ?? "?"}: ${preclip?.error ?? "?"} — falling back to full-plate dispatch`,
        );
      }
    }

    // When preclip is available, swap the Sync.so video input + force
    // auto_detect (the cropped 512x512 frame has exactly ONE face).
    const passPreclipUrl: string | null = (pass as any).preclip_url ?? null;
    // v118 — mutable; the face-gate bypass below can disable the preclip
    // dispatch path when the cropped frame validated 0 or >1 faces.
    let usePassPreclip = !!passPreclipUrl;

    // ── v126 — Hard-fail when preclip is required but missing ─────────────
    // Unified pipeline: every pass (N=1..4) that has tight audio + coords
    // MUST go through single-face preclip. Full-plate dispatch is removed.
    // If preclip render or face-gate blocked, refund cleanly — never
    // silently dispatch the full multi-face plate (that path is what
    // produced the opaque `provider_unknown_error` loop).
    const v126PreclipExpected =
      Array.isArray(pass.coords) &&
      Number.isFinite(Number(pass.coords?.[0])) &&
      Number.isFinite(Number(pass.coords?.[1])) &&
      !!tightAudioInfo;
    if (
      v126PreclipExpected &&
      !usePassPreclip
    ) {
      const failReason = (pass as any).preclip_error ?? "preclip_prerequisites_missing";
      console.error(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v126_preclip_required_BLOCK speakers=${speakers.length} reason=${failReason} — refusing full-plate dispatch`,
      );
      const existingDsLocal: any = (scene as any)?.dialog_shots ?? existing ?? {};
      const alreadyRefunded107 = !!existingDsLocal?.refunded;
      if (!alreadyRefunded107) {
        const { data: wV } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({
            balance: Number(wV?.balance ?? 0) + Number(totalCost ?? 0),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
      const passesPatched = passes.map((p, i) =>
        i === currentPassIdx
          ? { ...p, status: "failed" as const, last_error: failReason, last_error_class: "v107_preclip_required" }
          : p,
      );
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...existingDsLocal,
            version: 5,
            engine: "sync-segments",
            passes: passesPatched,
            status: "failed",
            cost_credits: Number(existingDsLocal?.cost_credits ?? totalCost ?? 0),
            refunded: !alreadyRefunded107,
            error: `v107_preclip_required_pass_${currentPassIdx + 1}:${failReason}`,
            finished_at: new Date().toISOString(),
          },
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `v107_preclip_required_for_multispeaker:${failReason}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "PREFLIGHT_BLOCKED",
        error_class: "v107_preclip_required",
        error_message: failReason,
        meta: {
          pass_idx: currentPassIdx,
          speakers: speakers.length,
          plate_dims: plateDims ?? null,
          preclip_error: (pass as any).preclip_error ?? null,
          preclip_face_count: (pass as any).preclip_face_count ?? null,
          have_tight_audio: !!tightAudioInfo,
          have_coords:
            Array.isArray(pass.coords) &&
            Number.isFinite(Number(pass.coords?.[0])) &&
            Number.isFinite(Number(pass.coords?.[1])),
        },
      });
      return json(
        {
          error: "v107_preclip_required_for_multispeaker",
          reason: failReason,
          refunded: alreadyRefunded107 ? 0 : Number(totalCost ?? 0),
        },
        422,
      );
    }




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
      // v100 — back to Sync.so doc default (0.5, range 0–1). v99's hard-coded
      // 1.0 combined with static per-frame bounding_boxes on a single-face
      // preclip reproducibly triggered `provider_unknown_error` on every
      // pass of multi-speaker scenes (DB-verified for scene 720fd0b1…).
      temperature: 0.5,
    };
    // ── v126 — Preclip-bypass blocks REMOVED ────────────────────────────
    // Previously v118 routed `face_count !== 1` (incl. null) or variant
    // escalation back to full-plate `bbox-url-pro`. That re-introduced the
    // exact `provider_unknown_error` Sync.so returns on full multi-face
    // plates. Under v126 we never drop a valid preclip. If preclip is
    // missing the v107/v126 hard-fail block below refunds cleanly — no
    // silent full-plate dispatch.
    void usePassPreclip;
    // Occlusion detection is only meaningful on multi-face / hand-over-mouth
    // plates. For the 512×512 single-face preclip path we leave it OFF — it
    // slows sync-3 measurably and adds no quality on a clean head-and-shoulders
    // crop. The full-plate bbox-url-pro path below re-enables it.
    if (!usePassPreclip) {
      syncOptions.occlusion_detection_enabled = true;
    }
    if (usePassPreclip) {
      // v129.1 — Payload-contract enforcement for Multi-Speaker preclip passes.
      // v129.0 forensics (docs/lipsync/v129-syncso-output-authenticity.md)
      // proved 16/17 dispatched passes used auto_detect:true on a multi-face
      // preclip context, so Sync.so silently selected the wrong / no face and
      // returned visually no-op output. v106 doc-strict forbids
      // `auto_detect:true` for Multi-Speaker passes — we must transform the
      // persisted plate-space coords into preclip-space and send
      // `{ auto_detect:false, frame_number, coordinates:[x',y'] }`.
      //
      // Single-Speaker (N=1) keeps the v115 auto_detect path: exactly one face
      // in the preclip means there is nothing to disambiguate.
      const rawPassFc = (pass as any).preclip_face_count;
      const passFaceCount: number | null =
        rawPassFc === null || rawPassFc === undefined || !Number.isFinite(Number(rawPassFc))
          ? null
          : Number(rawPassFc);
      const crop = (pass as any).preclip_crop;
      const outSize = Number(crop?.outputSize) || Number(crop?.size) || 720;
      const isMultiSpeaker = speakers.length >= 2;
      const plateCoords = Array.isArray(pass.coords) && pass.coords.length === 2
        && Number.isFinite(Number(pass.coords[0])) && Number.isFinite(Number(pass.coords[1]))
        ? [Number(pass.coords[0]), Number(pass.coords[1])] as [number, number]
        : null;
      const cropOk = !!crop
        && Number.isFinite(Number(crop.x))
        && Number.isFinite(Number(crop.y))
        && Number.isFinite(Number(crop.size))
        && Number(crop.size) > 0;
      const refFrame = Number.isFinite(Number(referenceFrameNumber))
        ? Number(referenceFrameNumber)
        : 0;

      // v129.2.1 — Preclip Ambiguity Diagnostic.
      // For every Multi-Speaker preclip pass, project each *other* face-map
      // face center into plate-space and test whether it falls inside the
      // preclip crop rect. If yes, the crop is ambiguous: Sync.so with
      // `auto_detect:true` will routinely select the wrong face. We persist
      // this diagnostic and use it in the v129.1 payload-contract preflight
      // as an additional hard-block trigger (auto_detect_with_ambiguous_crop)
      // so we never burn a Sync.so call on a crop we already know is unsafe.
      let v1291Ambiguity: any = null;
      if (cropOk) {
        const cx0 = Number(crop.x);
        const cy0 = Number(crop.y);
        const cS = Number(crop.size);
        const cx1 = cx0 + cS;
        const cy1 = cy0 + cS;
        const fmFacesAmb: any[] = Array.isArray((faceMap as any)?.faces)
          ? (faceMap as any).faces
          : [];
        const fmWAmb = Number((faceMap as any)?.width) || (plateDims?.width ?? 0);
        const fmHAmb = Number((faceMap as any)?.height) || (plateDims?.height ?? 0);
        const dimsWAmb = plateDims?.width ?? fmWAmb;
        const dimsHAmb = plateDims?.height ?? fmHAmb;
        const selfId = (pass as any).character_id ?? null;
        const selfSlot = Number((pass as any).speaker_idx);
        const siblingsInside: any[] = [];
        let nearest = Infinity;
        if (fmWAmb > 0 && fmHAmb > 0 && dimsWAmb > 0 && dimsHAmb > 0) {
          const sx = dimsWAmb / fmWAmb;
          const sy = dimsHAmb / fmHAmb;
          for (const f of fmFacesAmb) {
            if (!f || !Array.isArray(f.bbox) || f.bbox.length !== 4) continue;
            const isSelf =
              (f.characterId && selfId && f.characterId === selfId) ||
              (Number.isFinite(Number(f.slotIndex)) && Number(f.slotIndex) === selfSlot);
            if (isSelf) continue;
            const fcx = ((Number(f.bbox[0]) + Number(f.bbox[2])) / 2) * sx;
            const fcy = ((Number(f.bbox[1]) + Number(f.bbox[3])) / 2) * sy;
            const inside = fcx >= cx0 && fcx < cx1 && fcy >= cy0 && fcy < cy1;
            if (inside) {
              siblingsInside.push({
                slotIndex: Number.isFinite(Number(f.slotIndex)) ? Number(f.slotIndex) : null,
                characterId: f.characterId ?? null,
                center: [Math.round(fcx), Math.round(fcy)],
              });
            }
            if (plateCoords) {
              const d = Math.hypot(fcx - plateCoords[0], fcy - plateCoords[1]);
              if (d < nearest) nearest = d;
            }
          }
        }
        v1291Ambiguity = {
          sibling_centers_inside_crop: siblingsInside.length > 0,
          siblings_inside: siblingsInside,
          min_neighbor_dist:
            nearest === Infinity ? null : Number(nearest.toFixed(2)),
          crop_size: cS,
          crop_x: cx0,
          crop_y: cy0,
          preclip_face_count: passFaceCount,
          risk: siblingsInside.length > 0 ? "neighbor_inside_crop" : "clean",
        };
        (pass as any)._v1291_ambiguity = v1291Ambiguity;
      }

      let asdMode: string;
      let v1291Diag: any = null;



      if (isMultiSpeaker && plateCoords && cropOk) {
        // Plate → Preclip transform.
        const cx = Number(crop.x);
        const cy = Number(crop.y);
        const cSize = Number(crop.size);
        const scale = outSize / cSize;
        const xFloat = (plateCoords[0] - cx) * scale;
        const yFloat = (plateCoords[1] - cy) * scale;
        const xInt = Math.round(xFloat);
        const yInt = Math.round(yFloat);
        const inBounds = xInt >= 0 && xInt < outSize && yInt >= 0 && yInt < outSize;
        v1291Diag = {
          enabled: true,
          source_space: "plate",
          target_space: "preclip",
          plate_coords: plateCoords,
          preclip_crop: { x: cx, y: cy, size: cSize, outputSize: outSize },
          scale: Number(scale.toFixed(4)),
          transformed_coords_float: [Number(xFloat.toFixed(2)), Number(yFloat.toFixed(2))],
          transformed_coords_int: [xInt, yInt],
          in_bounds: inBounds,
          frame_number: refFrame,
        };
        (pass as any)._v1291 = v1291Diag;
        if (!inBounds) {
          // v129.1 — Do NOT silently clamp. Mark for preflight block.
          (pass as any)._v1291_block = {
            reason: "transformed_coords_out_of_bounds",
            details: v1291Diag,
          };
          // Set a doc-strict payload anyway so log evidence is consistent;
          // the preflight assertion will refuse to dispatch.
          syncOptions.active_speaker_detection = {
            auto_detect: false,
            frame_number: refFrame,
            coordinates: [xInt, yInt],
          };
          asdMode = "preclip_coords_oob_blocked";
        } else {
          syncOptions.active_speaker_detection = {
            auto_detect: false,
            frame_number: refFrame,
            coordinates: [xInt, yInt],
          };
          asdMode = "preclip_coords_doc_strict";
        }
      } else if (isMultiSpeaker && (!plateCoords || !cropOk)) {
        // v129.1 — Multi-Speaker without persisted coords/crop is an internal
        // contract violation: upstream MUST have persisted them. Mark for
        // preflight block; do not fall back to auto_detect.
        (pass as any)._v1291_block = {
          reason: "multi_speaker_missing_coords_or_crop",
          has_plate_coords: !!plateCoords,
          has_preclip_crop: !!cropOk,
        };
        syncOptions.active_speaker_detection = { auto_detect: true };
        asdMode = "v1291_missing_inputs_blocked";
      } else if (passFaceCount === 1 || passFaceCount === null) {
        // Single-Speaker preclip — auto_detect remains doc-correct (v115).
        syncOptions.active_speaker_detection = { auto_detect: true };
        asdMode = "auto_detect";
      } else {
        // Single-Speaker fallback: face-gate saw 0 or >1 faces. Center coords.
        const center = Math.max(8, Math.floor(outSize / 2));
        syncOptions.active_speaker_detection = {
          auto_detect: false,
          frame_number: 0,
          coordinates: [center, center],
        };
        asdMode = "coords_center_fallback";
      }

      delete syncOptions.temperature;
      delete syncOptions.occlusion_detection_enabled;
      syncOptions.sync_mode = "cut_off";
      const videoDurSec = typeof (pass as any).preclip_duration_sec === "number"
        ? Number((pass as any).preclip_duration_sec)
        : null;
      const audioFullSec = (() => {
        const diag = audioDiagnostics.find((d) => d.pass === pass.idx);
        const wavDur = (diag as any)?.wav?.durSec;
        return typeof wavDur === "number" ? wavDur : null;
      })();
      (pass as any)._v102_probe = {
        stage: "preclip-sync3-v1291",
        model_intent: "sync-3",
        payload_model: "sync-3",
        asd_mode: asdMode,
        preclip_face_count: passFaceCount,
        sync_mode: syncOptions.sync_mode,
        bbox_count: 0,
        audio_voiced_sec: tightAudioInfo?.durSec ?? null,
        audio_full_sec: audioFullSec,
        video_dur_sec: videoDurSec,
        preclip_crop_size: (pass as any).preclip_crop?.size ?? null,
        preclip_output_size: (pass as any).preclip_crop?.outputSize ?? null,
        preclip_dims: (pass as any).preclip_dims ?? null,
        video_frames_expected: videoDurSec != null
          ? Math.max(1, Math.ceil(videoDurSec * 30))
          : null,
        audio_vs_video_delta_sec: audioFullSec != null && videoDurSec != null
          ? Number((audioFullSec - videoDurSec).toFixed(3))
          : null,
        v1291: v1291Diag,
        preclip_ambiguity: v1291Ambiguity,
      };
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v1291_preclip_sync3 speaker=${pass.speaker_name} asd_mode=${asdMode} face_count=${passFaceCount} multi_speaker=${isMultiSpeaker} ambiguity=${JSON.stringify(v1291Ambiguity)} v1291=${JSON.stringify(v1291Diag)} block=${JSON.stringify((pass as any)._v1291_block ?? null)}`,
      );

    }

    else if (retryVariant === "coords-pro" || retryVariant === "sync3-coords" || retryVariant === "coords-pro-lp2pro") {
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

      // v124 — Per-frame array honoring this speaker's voiced windows.
      // Frames outside the windows become `null` so sync-3 cannot animate
      // a neighbour face during turns the speaker is silent.
      const v124VoicedWindows = speakerWindowsSecs.slice();

      let usedUrl: string | null = null;
      let nonNullFrames = frameCount;
      if (retryVariant === "bbox-url-pro") {
        const up = await uploadBoundingBoxesJson(supabase, {
          userId,
          projectId: String((scene as any).project_id ?? ""),
          sceneId,
          passIdx: currentPassIdx,
          box,
          frameCount,
          voicedWindowsSec: v124VoicedWindows,
          fps: ASSUMED_FPS,
        });
        usedUrl = up.url;
        nonNullFrames = up.nonNullFrames;
      }

      if (usedUrl) {
        syncOptions.active_speaker_detection = {
          auto_detect: false,
          bounding_boxes_url: usedUrl,
        };
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v124_BBOX_URL_ASD speaker=${pass.speaker_name} box=${JSON.stringify(box)} source=${bboxSource} frames=${frameCount} voiced_frames=${nonNullFrames} windows=${JSON.stringify(v124VoicedWindows)} url=…${usedUrl.slice(-60)}`,
        );
      } else {
        // graceful degrade — inline bounding_boxes (legacy coords-pro-box path)
        const boundingBoxes: ([number, number, number, number] | null)[] =
          v124VoicedWindows.length > 0
            ? buildPerFrameBoxes({
                box,
                frameCount,
                fps: ASSUMED_FPS,
                voicedWindowsSec: v124VoicedWindows,
              })
            : new Array(frameCount).fill(box);
        const inlineNonNull = boundingBoxes.reduce((a, v) => a + (v ? 1 : 0), 0);
        syncOptions.active_speaker_detection = {
          auto_detect: false,
          bounding_boxes: boundingBoxes,
        };
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v124_BBOX_INLINE variant=${retryVariant} speaker=${pass.speaker_name} box=${JSON.stringify(box)} source=${bboxSource} frames=${frameCount} voiced_frames=${inlineNonNull} windows=${JSON.stringify(v124VoicedWindows)}${retryVariant === "bbox-url-pro" ? " (url-upload-failed → inline-fallback)" : ""}`,
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
    const payloadModel = usePassPreclip
      ? SYNC3_MODEL
      : retryVariant === "sync3-coords"
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

    // ── v129.3 — Sync-Audio Normalization (provider input only) ─────────
    // Root cause for scene `7aed09f4-…` (Sarah pass-4 → terminal
    // `provider_unknown_error`): the per-turn WAV upstream of this dispatch
    // still carried 6.7s of leading silence relative to a 1.78s preclip.
    // Sync.so sync-3 with `cut_off` rejects that input.
    //
    // We DO NOT mutate `pass.audio_url` (audio-mux Lambda needs the
    // original timeline-aligned WAV for the final mux). Instead we build a
    // dedicated `sync_audio_url`, scoped to the Sync.so payload only.
    //
    // Strategy: voiced-window trim with 150ms pre-roll + 200ms post-roll.
    // If the trimmed audio still doesn't fit the preclip, the post-trim
    // preflight gate (below) blocks the dispatch terminal with refund.
    try {
      const preclipDurForGate = typeof (pass as any).preclip_duration_sec === "number"
        && Number.isFinite((pass as any).preclip_duration_sec)
        && (pass as any).preclip_duration_sec > 0
        ? Number((pass as any).preclip_duration_sec)
        : null;
      const syncAudioWavResp = await fetch(pass.audio_url, { signal: AbortSignal.timeout(30_000) });
      if (!syncAudioWavResp.ok) throw new Error(`sync_audio_fetch_${syncAudioWavResp.status}`);
      const syncAudioBytes = new Uint8Array(await syncAudioWavResp.arrayBuffer());
      const preInfo = inspectWav(syncAudioBytes);
      const preRange = detectVoicedRange(syncAudioBytes);
      const preLeadIn = preRange.firstVoicedSec >= 0 ? preRange.firstVoicedSec : preInfo.leadInSec;
      const preVoicedEnd = preRange.lastVoicedSec >= 0
        ? preRange.lastVoicedSec
        : preInfo.durSec;
      const preFullSec = preInfo.durSec;

      // Heuristic trigger: trim ONLY when we have a useful gain. If the
      // file is already tight (leadIn < 0.5s AND voicedEnd within preclip),
      // skip the slice/upload roundtrip entirely.
      const needsTrim =
        preRange.firstVoicedSec >= 0 &&
        preRange.lastVoicedSec >= 0 &&
        (preLeadIn > 0.5 ||
          (preclipDurForGate != null && preVoicedEnd > preclipDurForGate + 0.25) ||
          (preFullSec - (preVoicedEnd - preLeadIn) > 0.6));

      let normMeta: Record<string, unknown> = {
        mode: "skipped",
        original_full_sec: Number(preFullSec.toFixed(3)),
        original_lead_in_sec: Number(Math.max(0, preLeadIn).toFixed(3)),
        original_voiced_end_sec: Number(Math.max(0, preVoicedEnd).toFixed(3)),
        original_tail_silence_sec: Number(preRange.tailSilenceSec.toFixed(3)),
        pre_roll_sec: 0,
        post_roll_sec: 0,
        removed_lead_sec: 0,
        removed_tail_sec: 0,
        trimmed_full_sec: Number(preFullSec.toFixed(3)),
        first_voiced_sec_after_trim: Number(Math.max(0, preLeadIn).toFixed(3)),
        last_voiced_sec_after_trim: Number(Math.max(0, preVoicedEnd).toFixed(3)),
        used_for: "syncso_input_only",
        preclip_duration_sec: preclipDurForGate,
      };

      if (needsTrim) {
        const preRoll = 0.15;
        const postRoll = 0.20;
        const startSec = Math.max(0, preRange.firstVoicedSec - preRoll);
        const endSec = Math.min(preFullSec, preRange.lastVoicedSec + postRoll);
        let slicedBytes: Uint8Array;
        let slicedDurSec: number;
        try {
          const sliced = sliceWavToWindows(
            syncAudioBytes,
            [{ startSec, endSec }],
            { gapSec: 0 },
          );
          slicedBytes = sliced.bytes;
          slicedDurSec = sliced.durSec;
        } catch (sliceErr) {
          // Fail-safe: unsupported WAV format / slice math problem →
          // terminal, refund, no provider call. Never ship half-corrupt WAV.
          return await failBeforeProviderDispatch(
            "sync_audio_trim_failed",
            "unsupported_wav_format_for_trim",
            `v129.3 sync-audio normalization failed to slice WAV: ${(sliceErr as Error)?.message ?? sliceErr}`,
            422,
            {
              v1293: true,
              audio_normalization: { ...normMeta, error: (sliceErr as Error)?.message ?? String(sliceErr) },
              attempt_id: (pass as any).attempt_id ?? null,
              pass_idx: currentPassIdx,
              speaker_name: pass.speaker_name,
            },
          );
        }

        // Deterministic filename hash so user-retries with identical inputs
        // upsert the same object (avoids storage bloat). Resolution rounded
        // to 50ms — finer than human-perceivable, coarser than fp jitter.
        const hashKey = `${sceneId}:${currentPassIdx}:${Math.round(startSec * 20)}:${Math.round(endSec * 20)}`;
        const hashBuf = await crypto.subtle.digest(
          "SHA-1",
          new TextEncoder().encode(hashKey),
        );
        const hashHex = Array.from(new Uint8Array(hashBuf))
          .slice(0, 6)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const syncPath = `${userId}/twoshot-vo/${sceneId}-pass-${currentPassIdx + 1}-sync-${hashHex}.wav`;
        const up = await supabase.storage.from("voiceover-audio").upload(
          syncPath,
          slicedBytes,
          { contentType: "audio/wav", upsert: true },
        );
        if (up.error && !/already exists|duplicate/i.test(up.error.message)) {
          return await failBeforeProviderDispatch(
            "sync_audio_upload_failed",
            "sync_audio_upload_failed",
            `v129.3 sync-audio upload failed: ${up.error.message}`,
            500,
            {
              v1293: true,
              audio_normalization: normMeta,
              attempt_id: (pass as any).attempt_id ?? null,
            },
          );
        }
        const { data: pub } = supabase.storage.from("voiceover-audio").getPublicUrl(syncPath);
        if (!pub?.publicUrl) {
          return await failBeforeProviderDispatch(
            "sync_audio_publicurl_missing",
            "sync_audio_upload_failed",
            "v129.3 sync-audio public URL missing after upload",
            500,
            { v1293: true, audio_normalization: normMeta },
          );
        }

        // Re-inspect the trimmed bytes so the gate runs on POST-trim
        // diagnostics, never on stale pre-trim values.
        const postInfo = inspectWav(slicedBytes);
        const postRange = detectVoicedRange(slicedBytes);
        const postLeadIn = postRange.firstVoicedSec >= 0 ? postRange.firstVoicedSec : postInfo.leadInSec;
        const postVoicedEnd = postRange.lastVoicedSec >= 0 ? postRange.lastVoicedSec : postInfo.durSec;

        normMeta = {
          ...normMeta,
          mode: "voiced_window",
          pre_roll_sec: preRoll,
          post_roll_sec: postRoll,
          removed_lead_sec: Number((preRange.firstVoicedSec - startSec >= 0
            ? startSec
            : 0).toFixed(3)),
          removed_tail_sec: Number(Math.max(0, preFullSec - endSec).toFixed(3)),
          trimmed_full_sec: Number(slicedDurSec.toFixed(3)),
          first_voiced_sec_after_trim: Number(Math.max(0, postLeadIn).toFixed(3)),
          last_voiced_sec_after_trim: Number(Math.max(0, postVoicedEnd).toFixed(3)),
          trimmed_tail_silence_sec: Number(postRange.tailSilenceSec.toFixed(3)),
          sync_audio_url: pub.publicUrl,
        };
        (pass as any).sync_audio_url = pub.publicUrl;
        (pass as any).audio_normalization = normMeta;
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v1293_sync_audio_normalized ` +
          `original=${preFullSec.toFixed(2)}s leadIn=${preLeadIn.toFixed(2)}s → trimmed=${slicedDurSec.toFixed(2)}s ` +
          `voiced=${(postVoicedEnd - postLeadIn).toFixed(2)}s preclipDur=${preclipDurForGate ?? "?"}s`,
        );
      } else {
        (pass as any).audio_normalization = normMeta;
      }

      // ── v129.3 Change C — Post-trim preflight gate ──────────────────
      const gateAudioBytes = needsTrim
        ? await fetch(((pass as any).sync_audio_url as string), { signal: AbortSignal.timeout(20_000) })
            .then((r) => r.arrayBuffer())
            .then((b) => new Uint8Array(b))
        : syncAudioBytes;
      const gateRange = detectVoicedRange(gateAudioBytes);
      const gateInfo = inspectWav(gateAudioBytes);
      const gateFirst = gateRange.firstVoicedSec >= 0 ? gateRange.firstVoicedSec : gateInfo.leadInSec;
      const gateLast = gateRange.lastVoicedSec >= 0 ? gateRange.lastVoicedSec : gateInfo.durSec;
      const gateVoicedSec = gateRange.voicedSec;
      const gateFull = gateInfo.durSec;

      if (gateVoicedSec < 0.15) {
        return await failBeforeProviderDispatch(
          "audio_too_silent_post_trim",
          "audio_too_silent",
          `v129.3 post-trim audio has only ${gateVoicedSec.toFixed(3)}s of voiced content (<0.15s); skipping Sync.so to avoid provider_unknown_error.`,
          422,
          {
            v1293: true,
            preflight: "audio_too_silent",
            audio_normalization: (pass as any).audio_normalization ?? normMeta,
            attempt_id: (pass as any).attempt_id ?? null,
            pass_idx: currentPassIdx,
            speaker_name: pass.speaker_name,
          },
        );
      }
      if (gateFirst > 0.5) {
        return await failBeforeProviderDispatch(
          "audio_leadin_too_long_after_trim",
          "audio_leadin_too_long_after_trim",
          `v129.3 post-trim audio still has ${gateFirst.toFixed(3)}s of leading silence (>0.5s); Sync.so would reject.`,
          422,
          {
            v1293: true,
            preflight: "audio_leadin_too_long_after_trim",
            audio_normalization: (pass as any).audio_normalization ?? normMeta,
            attempt_id: (pass as any).attempt_id ?? null,
            pass_idx: currentPassIdx,
            speaker_name: pass.speaker_name,
          },
        );
      }
      if (preclipDurForGate != null && gateLast > preclipDurForGate + 0.25) {
        return await failBeforeProviderDispatch(
          "audio_voiced_exceeds_video",
          "audio_voiced_exceeds_video",
          `v129.3 post-trim audio voiced-end ${gateLast.toFixed(2)}s exceeds preclip duration ${preclipDurForGate.toFixed(2)}s + 0.25s tolerance.`,
          422,
          {
            v1293: true,
            preflight: "audio_voiced_exceeds_video",
            gate_voiced_end_sec: Number(gateLast.toFixed(3)),
            preclip_duration_sec: preclipDurForGate,
            audio_normalization: (pass as any).audio_normalization ?? normMeta,
            attempt_id: (pass as any).attempt_id ?? null,
            pass_idx: currentPassIdx,
            speaker_name: pass.speaker_name,
          },
        );
      }
      if (preclipDurForGate != null && gateFull > preclipDurForGate + 0.5
          && gateRange.tailSilenceSec < 0.2) {
        return await failBeforeProviderDispatch(
          "audio_overflow_unverifiable_tail",
          "audio_overflow_unverifiable_tail",
          `v129.3 post-trim audio is ${gateFull.toFixed(2)}s but preclip is only ${preclipDurForGate.toFixed(2)}s and tail silence (${gateRange.tailSilenceSec.toFixed(2)}s) is too small to be safely cut off.`,
          422,
          {
            v1293: true,
            preflight: "audio_overflow_unverifiable_tail",
            gate_full_sec: Number(gateFull.toFixed(3)),
            gate_tail_silence_sec: Number(gateRange.tailSilenceSec.toFixed(3)),
            preclip_duration_sec: preclipDurForGate,
            audio_normalization: (pass as any).audio_normalization ?? normMeta,
            attempt_id: (pass as any).attempt_id ?? null,
            pass_idx: currentPassIdx,
            speaker_name: pass.speaker_name,
          },
        );
      }
    } catch (normErr) {
      // Best-effort. If normalization itself throws (network hiccup,
      // unparseable WAV) we fall through to the legacy SILENT_AUDIO_GATE
      // path which is the safe pre-v129.3 behaviour. We log so this is
      // visible in dispatch logs.
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v1293_normalization_skipped: ${(normErr as Error)?.message ?? normErr}`,
      );
      (pass as any).audio_normalization = {
        mode: "skipped_on_error",
        error: (normErr as Error)?.message ?? String(normErr),
        used_for: "syncso_input_only",
      };
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
    // v124 — Hard whitelist sanitizer + ASD mutex. Supersedes the partial
    // v106 blacklist scrub. For `model: "sync-3"` ONLY `sync_mode` and
    // `active_speaker_detection` survive the call. When ASD has
    // `bounding_boxes`/`bounding_boxes_url`, `frame_number`/`coordinates`
    // are dropped (mutex). Stripped keys are logged with `v124_sync3_sanitize`.
    const v124Sanitized = sanitizeSync3Options(payloadModel, syncOptions, {
      scene: sceneId,
      pass: currentPassIdx + 1,
      speaker: String(pass.speaker_name ?? ""),
    });
    const payloadOptions = v124Sanitized.options;
    const payload: Record<string, unknown> = {
      model: payloadModel,
      input: [
        videoInput,
        { type: "audio", url: (pass as any).sync_audio_url ?? pass.audio_url },
      ],
      options: payloadOptions,
      webhookUrl: diagnosticWebhookUrl,
      webhook_url: diagnosticWebhookUrl,
    };

    // v105 — Compliance probe of the ACTUAL outgoing Sync.so payload.
    // We previously persisted v102/v103 probes computed from the per-speaker
    // full-length WAV, which masked the real input. v105 reads back from
    // `payload.input[].audio.url` so the dispatch log proves auto_detect
    // is OFF for N>=2 and the ASD shape is the one Sync.so docs require.
    const asdForProbe = (syncOptions as any).active_speaker_detection ?? null;
    const v105Probe = {
      stage: usePassPreclip
        ? "preclip-sync3-autodetect-v105"
        : "fullplate-sync3-deterministic-v105",
      model_intent: "sync-3",
      payload_model: payloadModel,
      dispatch_video_kind: usePassPreclip ? "preclip" : "full_plate",
      retry_variant: retryVariant,
      asd_mode: asdForProbe?.auto_detect === true
        ? "auto_detect"
        : asdForProbe?.bounding_boxes_url
          ? "bounding_boxes_url"
          : Array.isArray(asdForProbe?.bounding_boxes)
            ? "bounding_boxes_inline"
            : asdForProbe?.frame_number != null
              ? "coordinates"
              : "unknown",
      asd_auto_detect: asdForProbe?.auto_detect === true,
      asd_has_bounding_boxes_url: !!asdForProbe?.bounding_boxes_url,
      asd_has_coordinates: Array.isArray(asdForProbe?.coordinates),
      asd_frame_number: asdForProbe?.frame_number ?? null,
      sync_mode: (syncOptions as any).sync_mode,
      speakers: speakers.length,
      payload_audio_url: (pass as any).sync_audio_url ?? pass.audio_url,
      payload_audio_normalized: !!(pass as any).sync_audio_url,
      audio_normalization: (pass as any).audio_normalization ?? null,
      payload_video_url: dispatchVideoUrl,
      // v106 — full options-key list so any future doc-drift (unsupported
      // field smuggled into sync-3) is visible in dispatch logs.
      options_keys: Object.keys(payloadOptions),
      v124_stripped_opts: v124Sanitized.strippedOpts,
      v124_stripped_asd: v124Sanitized.strippedAsd,
    };
    (pass as any)._v105_probe = v105Probe;
    (pass as any)._v106_probe = v105Probe;

    // v108 — Single-Face-Preclip hat per Definition exakt EIN Gesicht; auto_detect
    // ist dort die einzige doc-konforme Option (v103). Die v105-Guard zielt nur
    // auf den Full-Plate-Pfad mit mehreren Gesichtern — dort verursacht
    // auto_detect das "Animorph"-Routing. Auf Preclip wird sie ausgeschaltet.
    if (
      !usePassPreclip &&
      speakers.length >= 2 &&
      asdForProbe?.auto_detect === true
    ) {
      return await failBeforeProviderDispatch(
        "multi_speaker_auto_detect_blocked",
        "asd_auto_detect_on_multi_speaker_fullplate",
        "Refusing to dispatch sync-3 with auto_detect=true on a multi-speaker FULL-PLATE; preclip path required.",
        500,
        { v105_probe: v105Probe },
      );
    }

    // v129.1 — Payload-Contract Preflight (DISPATCH_BLOCKED_PAYLOAD_PRECHECK).
    // Refuses to call Sync.so when a Multi-Speaker preclip pass would either:
    //  (a) send auto_detect:true despite persisted plate-space coords + crop, or
    //  (b) carry transformed coordinates that fall outside the preclip canvas, or
    //  (c) be missing the coords/crop required for the v106 doc-strict transform.
    // No retry. Idempotent refund via failBeforeProviderDispatch.
    // See docs/lipsync/v129-implementation.md.
    const v1291Diag = (pass as any)._v1291 ?? null;
    const v1291Block = (pass as any)._v1291_block ?? null;
    const v1291Ambig = (pass as any)._v1291_ambiguity ?? null;
    if (usePassPreclip && speakers.length >= 2) {
      const hasCoords = !!v1291Diag && Array.isArray(v1291Diag.plate_coords);
      const wouldAutoDetect = asdForProbe?.auto_detect === true;
      // v129.2.1 — Belt-and-Suspenders Ambiguity Guard.
      // Even if the v1291 branch didn't classify this as a coords-bearing
      // multi-speaker pass, refuse to send auto_detect:true into a preclip
      // crop that we *know* contains a sibling face center. This is the
      // forensic root cause from v129.2.0 (Samuel/Sarah, Samuel/Kailee 2x2
      // stacks): the 220px floor in computeFaceCrop pulls the neighbour into
      // the crop, and Sync.so then animates the wrong face. Block + refund
      // before dispatch instead of burning the call.
      const ambiguousAutoDetect =
        wouldAutoDetect && !!v1291Ambig?.sibling_centers_inside_crop;
      if (v1291Block || (hasCoords && wouldAutoDetect) || ambiguousAutoDetect) {
        const reasonLabel = v1291Block
          ? v1291Block.reason
          : ambiguousAutoDetect
            ? "auto_detect_with_ambiguous_crop"
            : "auto_detect_with_persisted_coords";
        return await failBeforeProviderDispatch(
          "DISPATCH_BLOCKED_PAYLOAD_PRECHECK",
          "internal_payload_contract_violation",
          `v129.2.1 preflight blocked dispatch: ${reasonLabel}`,
          500,
          {
            v1291: v1291Diag,
            v1291_block: v1291Block,
            v1291_ambiguity: v1291Ambig,
            v105_probe: v105Probe,
            provider_call_made: false,
            refund_reason: "dispatch_blocked_payload_precheck",
          },
        );
      }
    }

    console.log(
      `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v105_doc_strict ${JSON.stringify(v105Probe)} tight=${tightAudioInfo ? `${tightAudioInfo.durSec.toFixed(2)}s` : "none"} windows=${JSON.stringify(speakerWindowsSecs)} turnStartFrame=${startFrame}`,
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
      `frame=${referenceFrameNumber} sync_mode=${String(syncOptions.sync_mode)} input=${dispatchVideoUrl.slice(0, 80)} audio=${pass.audio_url.slice(0, 80)}`,
    );

    // v129.9 — Live Face-Gate: run Gemini Vision on the EXACT video URL
    // + frame + coord we are about to send. If Gemini is confident the
    // promise won't hold (no_face / yes_but_not_at_coord / multi_face in
    // multi-speaker context) refund + fail BEFORE we burn a Sync.so credit.
    {
      const gateAsd: any = (syncOptions as any)?.active_speaker_detection ?? {};
      const gateFrame: number | null = Number.isFinite(gateAsd?.frame_number)
        ? Number(gateAsd.frame_number)
        : (Number.isFinite(referenceFrameNumber) ? Number(referenceFrameNumber) : null);
      const gateCoord: [number, number] | null = Array.isArray(gateAsd?.coordinates) && gateAsd.coordinates.length >= 2
        ? [Number(gateAsd.coordinates[0]), Number(gateAsd.coordinates[1])]
        : null;
      const gateMulti = speakers.length >= 2;
      const preclipDimsForGate = (pass as any).preclip_dims ?? null;
      const preclipCropForGate = (pass as any).preclip_crop ?? null;
      const gateWidth = usePassPreclip
        ? Number(preclipDimsForGate?.width ?? preclipCropForGate?.outputSize ?? 0)
        : Number(plateDims?.width ?? 0);
      const gateHeight = usePassPreclip
        ? Number(preclipDimsForGate?.height ?? preclipCropForGate?.outputSize ?? 0)
        : Number(plateDims?.height ?? 0);
      const preclipTrustedForGate = usePassPreclip &&
        Number((pass as any).preclip_face_count ?? 0) === 1 &&
        String((pass as any)._v1291_ambiguity?.risk ?? "clean") === "clean";
      const gate = await verifyFaceBeforeDispatch({
        videoUrl: dispatchVideoUrl,
        frameNumber: gateFrame,
        coord: gateCoord,
        isMultiSpeakerContext: gateMulti,
        // v129.22.3 — enable auto-snap on heuristic/inferred coords
        plateWidth: Number.isFinite(gateWidth) && gateWidth > 0 ? gateWidth : undefined,
        plateHeight: Number.isFinite(gateHeight) && gateHeight > 0 ? gateHeight : undefined,
        prebuiltFrameUrl: typeof (pass as any).probe_frame_url === "string" ? (pass as any).probe_frame_url : undefined,
        userId,
        projectId: String((scene as any).project_id ?? "shared"),
        sceneId,
        passIdx: currentPassIdx,
        preclipTrusted: preclipTrustedForGate,
      });
      if (gate.frame_jpeg_url) {
        (pass as any).probe_frame_url = gate.frame_jpeg_url;
        (pass as any).probe_frame_cached = !!gate.frame_cached;
      }
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v129.23.2_face_gate pass=${currentPassIdx + 1} source=${usePassPreclip ? "preclip" : "plate"} preclip_trusted=${preclipTrustedForGate} dims=${gateWidth || "?"}x${gateHeight || "?"} code=${gate.code} ok=${gate.ok} extract_ms=${gate.extract_ms ?? 0} gemini_ms=${gate.gemini_ms ?? 0} jpeg=${gate.frame_jpeg_url ? "yes" : "no"} snap=${gate.snapped_coord ? JSON.stringify(gate.snapped_coord) : "no"} reason=${gate.reason ?? ""} reply="${gate.raw_reply ?? ""}"`,
      );
      // v129.22.3 — Auto-snap path: rewrite ASD coords with the
      // Rekognition-derived center and proceed to dispatch.
      if (gate.ok && gate.code === "ok_after_snap" && Array.isArray(gate.snapped_coord)) {
        const newCoord: [number, number] = [
          Number(gate.snapped_coord[0]),
          Number(gate.snapped_coord[1]),
        ];
        try {
          if ((syncOptions as any)?.active_speaker_detection) {
            (syncOptions as any).active_speaker_detection.coordinates = newCoord;
          }
          const payloadAsd = (payload as any)?.options?.active_speaker_detection;
          if (payloadAsd) {
            payloadAsd.coordinates = newCoord;
          }
          // Persist on the pass so subsequent retries see the corrected coord.
          if (!usePassPreclip) {
            (pass as any).coords = newCoord;
          } else {
            (pass as any).dispatch_coords_snapped = newCoord;
          }
          (pass as any).coords_snapped_at = new Date().toISOString();
          (pass as any).coords_snap_origin = gate.original_coord ?? null;
          (pass as any).coords_snap_space = usePassPreclip ? "preclip" : "plate";
        } catch (mutErr) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v129.22.3 ASD coord mutation failed: ${(mutErr as Error)?.message}`,
          );
        }
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_source_kind: "segments", video_url: dispatchVideoUrl,
          coords: newCoord, frame_number: gateFrame,
          http_status: 0, sync_status: "COORD_AUTO_SNAPPED",
          error_class: "coord_auto_snap",
          error_message: (gate.reason ?? "auto_snapped").slice(0, 240),
          meta: {
            diagnostic_id: diagnosticId,
            retry_variant: retryVariant,
            pass_idx: currentPassIdx,
            total_passes: passes.length,
            face_gate: {
              version: "v129.22.3",
              code: gate.code,
              snapped_coord: newCoord,
              original_coord: gate.original_coord ?? gateCoord,
              snap_distance_px: gate.snap_distance_px ?? null,
              frame_jpeg_url: gate.frame_jpeg_url,
              extract_ms: gate.extract_ms,
              gemini_ms: gate.gemini_ms,
            },
            source: "preflight-snap",
          },
        });
      }
      // Honest non-blocking signal: when the Lovable AI gateway can't probe
      // (extract failure or transient 5xx), log it but let the dispatch
      // through. The Forensik UI surfaces this clearly so we don't silently
      // pretend the probe passed.
      if (gate.ok && gate.code === "probe_unavailable") {
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_source_kind: "segments", video_url: dispatchVideoUrl,
          coords: gateCoord, frame_number: gateFrame,
          http_status: gate.http_status ?? 0, sync_status: "FACE_GATE_PROBE_UNAVAILABLE",
          error_class: "face_probe_unavailable",
          error_message: (gate.reason ?? "face_probe_unavailable").slice(0, 240),
          meta: {
            diagnostic_id: diagnosticId,
            retry_variant: retryVariant,
            pass_idx: currentPassIdx,
            total_passes: passes.length,
            face_gate: {
              version: "v129.22.3",
              code: gate.code,
              reason: gate.reason,
              raw_reply: gate.raw_reply,
              raw_error: gate.raw_error,
              http_status: gate.http_status,
              frame_jpeg_url: gate.frame_jpeg_url,
              frame_cached: gate.frame_cached,
              extract_ms: gate.extract_ms,
              gemini_ms: gate.gemini_ms,
            },
            non_blocking: true,
          },
        });
      }
      if (!gate.ok) {
        const reason = `face_gate_${gate.code}:${(gate.reason ?? "").slice(0, 180)}`;
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_source_kind: "segments", video_url: dispatchVideoUrl,
          coords: gateCoord, frame_number: gateFrame,
          http_status: 0, sync_status: "FACE_GATE_BLOCKED",
          error_class: "face_validation_failed",
          error_message: reason,
          meta: {
            diagnostic_id: diagnosticId,
            retry_variant: retryVariant,
            pass_idx: currentPassIdx,
            total_passes: passes.length,
            face_gate: {
              version: "v129.11",
              code: gate.code,
              reason: gate.reason,
              raw_reply: gate.raw_reply,
              frame_jpeg_url: gate.frame_jpeg_url,
              frame_cached: gate.frame_cached,
              extract_ms: gate.extract_ms,
              gemini_ms: gate.gemini_ms,
            },
            outbound_payload_intent: { model: payload.model, options: payload.options },
          },
        });
        pass.status = "failed";
        pass.error = reason;
        await failLipSync({
          supabase,
          sceneId,
          reason,
          userId,
          refundCredits: totalCost,
          syncApiKey,
        });
        return json(
          { error: "face_gate_blocked", code: gate.code, reason: gate.reason ?? null, provider_error_code: "no_face_pre_sync" },
          422,
        );
      }
    }

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
        sync_source_kind: "segments", video_url: dispatchVideoUrl,
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

    // v129.4b — Provider Input Fingerprint (telemetry only).
    // Single structured block per dispatch so a future Sync.so support
    // bundle can be assembled from `syncso_dispatch_log` alone, without
    // grepping edge logs or replaying probes. No behaviour change.
    const hashUrl = async (u: string | null | undefined): Promise<string | null> => {
      if (!u || typeof u !== "string") return null;
      try {
        const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(u));
        return Array.from(new Uint8Array(buf)).slice(0, 6)
          .map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch { return null; }
    };
    const fpAudioDiag = audioDiagnostics.find((dx) => dx.pass === pass.idx) as any;
    const fpNorm = (pass as any).audio_normalization ?? null;
    const fpVideoUrl = dispatchVideoUrl;
    const fpAudioUrl = ((pass as any).sync_audio_url ?? pass.audio_url) as string;
    const fpAsd: any = (syncOptions as any).active_speaker_detection ?? {};
    const fpVideoDurSec = typeof (pass as any).preclip_duration_sec === "number"
      ? Number((pass as any).preclip_duration_sec)
      : null;
    const fpVideoDims = (pass as any).preclip_dims ?? plateDims ?? videoDims ?? null;
    const fpVideoFps = 30;
    const fpVideoFrameCount = fpVideoDurSec != null
      ? Math.max(1, Math.ceil(fpVideoDurSec * fpVideoFps))
      : null;
    const fpAsdCoords = Array.isArray(fpAsd.coordinates) ? fpAsd.coordinates : null;
    const fpAsdInBounds = (() => {
      if (!fpAsdCoords || !fpVideoDims) return null;
      const w = Number(fpVideoDims?.width ?? 0);
      const h = Number(fpVideoDims?.height ?? 0);
      if (!w || !h) return null;
      const [x, y] = fpAsdCoords;
      return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x < w && y >= 0 && y < h;
    })();
    const providerInputFingerprint = {
      model: payload.model,
      sync_mode: (syncOptions as any).sync_mode ?? null,
      dispatch_video_kind: usePassPreclip ? "preclip" : "full_plate",
      video: {
        url_hash: await hashUrl(fpVideoUrl),
        duration_sec: fpVideoDurSec,
        width: fpVideoDims?.width ?? null,
        height: fpVideoDims?.height ?? null,
        fps: fpVideoFps,
        frame_count: fpVideoFrameCount,
        bytes: videoProbe?.bytes ?? null,
        content_type: videoProbe?.contentType ?? null,
      },
      audio: {
        url_hash: await hashUrl(fpAudioUrl),
        normalized: !!(pass as any).sync_audio_url,
        duration_sec: fpAudioDiag?.wav?.durSec ?? null,
        lead_in_sec: fpAudioDiag?.wav?.leadInSec ?? null,
        voiced_end_sec: fpNorm?.last_voiced_sec_after_trim ?? null,
        peak_dbfs: fpAudioDiag?.wav?.peakDbFs ?? null,
        sample_rate: fpAudioDiag?.wav?.sampleRate ?? null,
        channels: fpAudioDiag?.wav?.channels ?? null,
        bits_per_sample: fpAudioDiag?.wav?.bitsPerSample ?? null,
        codec: "pcm_s16le",
        bytes: audioProbes[audioProbeIdx]?.bytes ?? null,
      },
      asd: {
        auto_detect: !!fpAsd.auto_detect,
        frame_number: fpAsd.frame_number ?? null,
        coordinates: fpAsdCoords,
        has_bounding_boxes_url: !!fpAsd.bounding_boxes_url,
        has_bounding_boxes_inline: Array.isArray(fpAsd.bounding_boxes),
        coord_in_bounds: fpAsdInBounds,
      },
      preclip_ambiguity: (pass as any)._v1291_ambiguity ?? null,
      speakers: speakers.length,
      retry_variant: retryVariant,
      v1294_fingerprint: true,
    };

    await logSyncDispatch(supabase, {
      scene_id: sceneId, user_id: userId, engine: "sync-segments",
      job_id: jobId, sync_source_kind: "segments",
      video_url: dispatchVideoUrl,
      video_bytes: videoProbe.bytes,
      video_content_type: videoProbe.contentType,
      // v129.9 — Persist final ASD top-level so syncso-preflight reads the
      // exact frame/coord we sent (not stale pass.coords).
      coords: Array.isArray((syncOptions as any)?.active_speaker_detection?.coordinates)
        ? (syncOptions as any).active_speaker_detection.coordinates as [number, number]
        : (Array.isArray(pass.coords) ? pass.coords as [number, number] : null),
      frame_number: Number.isFinite((syncOptions as any)?.active_speaker_detection?.frame_number)
        ? Number((syncOptions as any).active_speaker_detection.frame_number)
        : (Number.isFinite(referenceFrameNumber) ? Number(referenceFrameNumber) : null),
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
        sync_mode: syncOptions.sync_mode,
        audio_approx_sec: audioApproxSec,
        expected_total_sec: totalSec,
        length_mismatch: lengthMismatch,
        audio_probe: audioProbes[audioProbeIdx] ?? null,
        final_audio_gate: {
          peak_dbfs: Number.isFinite(finalPeakDbFs) ? finalPeakDbFs : null,
          voiced_sec: Number.isFinite(finalVoicedSec) ? finalVoicedSec : 0,
          longest_voiced_run: Number.isFinite(finalLongestRun) ? finalLongestRun : 0,
        },
        // v116 (Fix D) — per-pass identity/preclip diagnostics so a future
        // failure can be debugged in <5 min from syncso_dispatch_log alone.
        v116_diag: {
          // v129.1 — asd_mode now reflects doc-strict coordinate dispatch.
          // For multi-speaker preclip passes the value is
          // "preclip_coords_doc_strict" (was "preclip_auto_detect" in v116).
          asd_mode: (() => {
            const asd = (syncOptions as any).active_speaker_detection ?? {};
            if (usePassPreclip) {
              if (asd.auto_detect === false && Array.isArray(asd.coordinates)) {
                return "preclip_coords_doc_strict";
              }
              if (asd.bounding_boxes_url) return "preclip_bbox_url";
              if (Array.isArray(asd.bounding_boxes)) return "preclip_bbox_inline";
              return "preclip_auto_detect";
            }
            if (asd.bounding_boxes_url) return "bbox_url";
            if (asd.bounding_boxes) return "bbox_inline";
            if (asd.coordinates) return "coords_point";
            return "auto_detect";
          })(),
          coords_sent: syncOptions.active_speaker_detection?.coordinates ?? null,
          preclip_face_count: (pass as any).preclip_face_count ?? null,
          preclip_crop: (pass as any).preclip_crop ?? null,
          preclip_repair_attempts: (pass as any).preclip_repair_attempts ?? 0,
          coord_source: coordSources[Number(pass.speaker_idx ?? -1)] ?? "unknown",
          plate_identity_resolved: plateIdentityMap?.resolvedCount ?? 0,
          plate_identity_total: plateIdentityMap?.faces?.length ?? 0,
          plate_dims: plateDims ?? null,
        },
        // v129.1 — Outbound payload contract evidence. `outbound_payload`
        // captures the EXACT options dispatched to Sync.so (URLs intentionally
        // omitted — they are already on `video_url` / `payload_video_url`).
        // `coord_transform` proves the plate→preclip math per pass.
        v1291_payload_contract: true,
        outbound_payload: {
          model: payload.model,
          options: payload.options,
        },
        coord_transform: (pass as any)._v1291 ?? null,
        v1291_block: (pass as any)._v1291_block ?? null,
        video_probe: videoProbe,
        audio_diagnostics: audioDiagnostics.find((d) => d.pass === pass.idx) ?? null,
        // v102 Step A — alignment probe persisted on every DISPATCHED row so
        // we can query syncso_dispatch_log.meta->'v102_probe' across all
        // failing passes to verify the bbox/video/audio frame-count mismatch
        // hypothesis without grepping edge logs.
        v102_probe: (pass as any)._v102_probe ?? null,
        v103_probe: (pass as any)._v102_probe ?? null,
        v105_probe: (pass as any)._v105_probe ?? null,
        preclip_duration_sec: (pass as any).preclip_duration_sec ?? null,
        preclip_dims: (pass as any).preclip_dims ?? null,
        preclip_crop: (pass as any).preclip_crop ?? null,
        dispatch_video_kind: usePassPreclip ? "preclip" : "full_plate",
        payload_summary: {
          model: payload.model,
          input_video: dispatchVideoUrl,
          audio: pass.audio_url,
          frame_number: referenceFrameNumber,
          coordinates: pass.coords,
          options: payload.options,
        },
        // v129.4b — Provider input fingerprint (telemetry only, no behavior).
        provider_input_fingerprint: providerInputFingerprint,
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

    // ── Plan D (v93) — flag-gated parallel fan-out, supersedes hard `false`.
    //    Default flag composer.parallel_sync_so_passes = false → behaves as
    //    v60 unified serial chain (FROZEN I.9 v60 semantics preserved).
    //    When flag is ON, dispatch up to composer.sync_so_concurrency_cap
    //    additional passes in parallel via background self-invokes. Each
    //    pass is an independent Sync.so job against the SAME original plate
    //    (no chaining). Passes beyond the cap stay `pending` and are
    //    chained by the webhook's pendingIdxs[0] kick on each COMPLETE.
    //    Race-safety: per-pass state writes go through
    //    public.update_dialog_pass_slot() RPC (atomic per-slot jsonb_set).
    //    See mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.9) +
    //    mem/architecture/lipsync/v93-parallel-sync-so-passes.md
    let parallelFlagOn = false;
    let concurrencyCap = 2;
    try {
      const { data: pFlag } = await supabase
        .from("system_config").select("value")
        .eq("key", "composer.parallel_sync_so_passes").maybeSingle();
      parallelFlagOn = pFlag?.value === true || pFlag?.value === "true";
      const { data: cFlag } = await supabase
        .from("system_config").select("value")
        .eq("key", "composer.sync_so_concurrency_cap").maybeSingle();
      const rawCap = (cFlag as any)?.value;
      const parsedCap = typeof rawCap === "number" ? rawCap : Number(rawCap);
      if (Number.isFinite(parsedCap) && parsedCap >= 1) {
        concurrencyCap = Math.min(4, Math.max(1, Math.floor(parsedCap)));
      }
    } catch { /* defaults */ }
    // v128 Phase B4 — Plan-D fan-out is HARD-DISABLED by default per
    // Alpha-Plan v3.1 §1.2. The DB flag `composer.parallel_sync_so_passes`
    // alone is insufficient because Stage 0.5 found it can be flipped from
    // multiple admin paths without going through change review. The env
    // flag `FEATURE_PLAN_D_FANOUT` is the explicit kill-switch and must
    // also be `true` for fan-out to dispatch. When fan-out WOULD have run
    // (parallelFlagOn + multi-pass) but the env flag is off, log the
    // suppression so we can monitor the exit criterion (`0` Plan-D
    // dispatches over 24h observation window).
    const planDFanoutEnvOn = (Deno.env.get("FEATURE_PLAN_D_FANOUT") ?? "false")
      .toLowerCase() === "true";
    const fanOutAllowed = planDFanoutEnvOn && parallelFlagOn && passes.length >= 2;
    if (parallelFlagOn && passes.length >= 2 && !planDFanoutEnvOn && !isAdvance && !isRetry) {
      try {
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          user_id: userId,
          engine: "sync-segments",
          sync_status: "PLAN_D_FANOUT_BLOCKED_V128",
          meta: {
            v128_terminal: true,
            pass_idx: currentPassIdx,
            total_passes: passes.length,
            attempt_id: pass?.attempt_id ?? null,
            variant: pass?.retry_variant ?? null,
            model: pass?.retry_variant ?? null,
            dispatch_source: "compose-dialog-segments",
            reason: "FEATURE_PLAN_D_FANOUT=false",
          },
        });
      } catch { /* ignore log errors */ }
      console.log(
        `[compose-dialog-segments] scene=${sceneId} PLAN_D_FANOUT_BLOCKED_V128 ` +
          `(env flag off, ${passes.length} passes) — webhook will chain serially`,
      );
    }
    if (!isAdvance && !isRetry && fanOutAllowed) {
      // Pass 0 was just dispatched above. Fan out passes [1 .. cap-1] now;
      // any beyond cap remain `pending` and get kicked by the webhook.
      const fanOutEnd = Math.min(passes.length, concurrencyCap);
      for (let i = 1; i < fanOutEnd; i++) {
        const delayMs = i * 250; // small jitter prevents Sync.so burst spike
        setTimeout(() => {
          fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ scene_id: sceneId, advance: true, pass_idx: i }),
          }).catch((err) =>
            console.warn(`[compose-dialog-segments] plan_d fan-out pass=${i} dispatch threw: ${(err as Error).message}`),
          );
        }, delayMs);
      }
      console.log(
        `[compose-dialog-segments] scene=${sceneId} plan_d_parallel_dispatch_start N_passes=${passes.length} cap=${concurrencyCap} fanout_size=${fanOutEnd}`,
      );
    } else if (!isAdvance && !isRetry && passes.length > 1) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} SERIAL mode (${passes.length} speakers, v60 unified, parallel_flag=${parallelFlagOn}) — webhook will chain pass 2..N as pass 1..N-1 complete`,
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
    const errMsg = e instanceof Error ? e.message : String(e ?? "unknown");
    const errStack = e instanceof Error ? e.stack ?? "" : "";
    console.error(
      `[compose-dialog-segments] dispatch_crash scene=${crashSceneId ?? "n/a"} err=${errMsg}\n${errStack}`,
    );
    // v100 — Crash-safe envelope: if we already knew which scene we were
    // dispatching for, mark it failed+refund immediately so the user does not
    // see a phantom `pending` for 4 min until lipsync-watchdog fires
    // STALE_PREFLIGHT_MS. The Schicht A auto-reset above will then self-heal
    // on the next 30s auto-tick without manual intervention.
    if (crashSceneId && crashUserId && crashSupabase) {
      try {
        await logSyncDispatch(crashSupabase, {
          scene_id: crashSceneId,
          user_id: crashUserId,
          engine: "sync-segments",
          sync_status: "DISPATCH_CRASH",
          error_class: "dispatch_crash",
          error_message: errMsg.slice(0, 500),
          meta: { stack: errStack.slice(0, 1000) },
        });
      } catch (logErr) {
        console.warn(
          `[compose-dialog-segments] crash_log_failed scene=${crashSceneId} err=${(logErr as Error)?.message ?? logErr}`,
        );
      }
      try {
        await failLipSync({
          supabase: crashSupabase,
          sceneId: crashSceneId,
          userId: crashUserId,
          reason: `dispatch_crash: ${errMsg.slice(0, 160)}`,
          refundCredits: 0,
          syncApiKey: crashSyncApiKey,
        });
      } catch (failErr) {
        console.warn(
          `[compose-dialog-segments] crash_failLipSync_failed scene=${crashSceneId} err=${(failErr as Error)?.message ?? failErr}`,
        );
      }
    }
    return json({ error: errMsg }, 500);
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

