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
  reconcileStaleSyncJobs,
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
import { detectPlateFaces, validatePlateFacesGeometry } from "../_shared/plate-face-detect.ts";
import { resolvePlateFaceIdentities, PlateIdentityFace } from "../_shared/plate-face-identity.ts";
import { validateCast } from "../_shared/cast-validation.ts";
import { failLipSync } from "../_shared/lipsync-fail.ts";
import { withDialogLock } from "../_shared/dialog-lock.ts";
// v161 — renderPassFacePreclip re-enabled for the unified single-face
// bbox-url-pro pipeline (1..N speakers). v187 makes this fail-closed for
// multi-speaker: no full-plate fallback after a preclip timeout/failure.
import { renderPassFacePreclip } from "../_shared/pass-face-preclip.ts";
import { assertSafeDispatchEntry } from "../_shared/dialogPassTransition.ts";
import { verifyFaceBeforeDispatch } from "../_shared/syncso-face-gate.ts";
import { detectFacesMediaPipe } from "../_shared/face-detect-mediapipe.ts";
import {
  buildAsdStrategy,
  type PreflightFaceResult,
} from "../_shared/asd-strategy.ts";
import {
  ensureDialogTurnsForScene,
  orderedSpeakerIdsFromTurns,
  readIdOnlyEnabled,
} from "../_shared/scene-dialog-turns.ts";
import { rehostPlate } from "../_shared/rehostPlate.ts";






import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
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
// v131.5 — Version pin. Stamped into every syncso_dispatch_log.meta so
// we can prove which build dispatched any given pass in <5s of SQL.
// Bump on any dispatch-path change so production failures are
// trivially attributable to a specific deploy.
const COMPOSE_DIALOG_SEGMENTS_VERSION = "v222-bridge-recount-resolved";

// v153.8 — Sync.so spec (https://sync.so/docs/developer-guides/speaker-selection)
// requires the `bounding_boxes` array length to MATCH the actual video frame
// count. We were sending `Math.ceil(totalSec * 24)` where `totalSec` was the
// *requested* Hailuo duration (9s) — but Hailuo routinely returns 10.0–10.5s,
// so the JSON had ~216 entries against a 243-frame plate → provider rejected
// every pass with the opaque `generation_unknown_error`.
//
// Fix: probe the rehosted MP4 once per plate URL (cached by URL) by parsing
// the `mvhd` box for `duration / timescale`, then derive frameCount from the
// actual duration. Fallback to the legacy `totalSec * 24` if the probe fails.
const __plateMetaCache = new Map<string, { durationSec: number | null }>();
async function probePlateDurationSec(url: string): Promise<number | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const findBox = (start: number, end: number, name: string): { start: number; end: number } | null => {
      let p = start;
      while (p + 8 <= end) {
        const size = dv.getUint32(p);
        const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
        const boxEnd = size === 0 ? end : p + size;
        if (type === name) return { start: p + 8, end: boxEnd };
        if (size < 8) break;
        p = boxEnd;
      }
      return null;
    };
    const moov = findBox(0, buf.length, "moov");
    if (!moov) return null;
    const mvhd = findBox(moov.start, moov.end, "mvhd");
    if (!mvhd) return null;
    const version = buf[mvhd.start];
    let timescale: number, duration: number;
    if (version === 1) {
      // version(1) + flags(3) + creation(8) + mod(8) + timescale(4) + duration(8)
      timescale = dv.getUint32(mvhd.start + 4 + 8 + 8);
      const high = dv.getUint32(mvhd.start + 4 + 8 + 8 + 4);
      const low = dv.getUint32(mvhd.start + 4 + 8 + 8 + 8);
      duration = high * 2 ** 32 + low;
    } else {
      // version(1) + flags(3) + creation(4) + mod(4) + timescale(4) + duration(4)
      timescale = dv.getUint32(mvhd.start + 4 + 4 + 4);
      duration = dv.getUint32(mvhd.start + 4 + 4 + 4 + 4);
    }
    if (!timescale) return null;
    return duration / timescale;
  } catch {
    return null;
  }
}
async function getPlateDurationSecCached(url: string): Promise<number | null> {
  if (__plateMetaCache.has(url)) return __plateMetaCache.get(url)!.durationSec;
  const durationSec = await probePlateDurationSec(url);
  __plateMetaCache.set(url, { durationSec });
  return durationSec;
}
// v139.2 — Module-load boot marker. Proves which build is actually running
// inside Edge Runtime (vs a stale cached copy). Look for this exact string
// in logs immediately after any deploy to confirm the new code is live.
console.log(
  `[compose-dialog-segments] BOOT version=${COMPOSE_DIALOG_SEGMENTS_VERSION} deploy_marker=${Date.now()} pid=${(globalThis as any).Deno?.pid ?? "?"}`,
);
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
  // v201 — strict turn-scoped boxes. Older builds backfilled leading/trailing
  // silence with the target box to satisfy Sync.so's validator, but that let
  // the provider reproject inactive faces outside the spoken turn. Keep every
  // frame outside the voiced windows null; preclips shift most speaker windows
  // to t=0 so this remains provider-safe while eliminating morph bleed.
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

// Pricing: Sync.so lipsync-2-pro = 16 credits/s (raised from 9, 3.5× margin cap
// on ~€0.046/s raw cost). ONE pass over the full clip (regardless of speaker
// count), so cost = ceil(totalSec) * 16 (min 16). Mirrors frontend estimate
// in src/lib/composer/estimateSceneRenderCost.ts.
const LIPSYNC_CREDITS_PER_SEC = 16;
const LIPSYNC_MIN_CREDITS = 16;
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

type CanonicalAsd =
  | { auto_detect: true }
  | { auto_detect: false; frame_number: number; coordinates: [number, number] }
  | { auto_detect: false; bounding_boxes_url: string }
  | { auto_detect: false; bounding_boxes: ([number, number, number, number] | null)[] };

function normalizeCanonicalAsd(input: unknown): CanonicalAsd {
  const asd = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (typeof asd.bounding_boxes_url === "string" && asd.bounding_boxes_url.trim()) {
    return { auto_detect: false, bounding_boxes_url: asd.bounding_boxes_url };
  }
  if (Array.isArray(asd.bounding_boxes) && asd.bounding_boxes.length > 0) {
    return { auto_detect: false, bounding_boxes: asd.bounding_boxes as ([number, number, number, number] | null)[] };
  }
  if (asd.auto_detect === false) {
    const raw = Array.isArray(asd.coordinates) && Array.isArray(asd.coordinates[0])
      ? (asd.coordinates[0] as unknown[])
      : Array.isArray(asd.coordinates)
        ? asd.coordinates
        : [];
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`canonical_asd_missing_coordinates:${JSON.stringify(asd.coordinates ?? null)}`);
    }
    const frame = Number.isFinite(Number(asd.frame_number)) ? Math.max(0, Math.round(Number(asd.frame_number))) : 0;
    return { auto_detect: false, frame_number: frame, coordinates: [Math.round(x), Math.round(y)] };
  }
  return { auto_detect: true };
}

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
  status: "pending" | "rendering_preflight" | "rendering" | "done" | "failed";
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
  plate_identity?: {
    version: "v153.2" | "v160" | "v242";
    dims: { width: number; height: number } | null;
    bboxes: Array<[number, number, number, number] | null>;
    faces?: unknown[];
    mouths?: Array<[number, number] | null>;
    resolvedCount?: number;
    cached?: boolean;
    sourceClipUrl?: string | null;
    hydratedAt?: string;
    /**
     * v242 — Character Assignment Lock.
     * Persisted map speakerIdx (string) → characterId (stripped) written
     * once a plate-identity run resolved every speaker with match
     * confidence ≥ threshold. Subsequent renders read this lock BEFORE
     * consulting positional bboxes, guaranteeing the same speaker → face
     * assignment across every rerender.
     */
    assignmentLock?: Record<string, string>;
  };
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
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  // v33: strict per-scene single-flight lock. Released in `finally` below so
  // every return path (including early 202s, 422s, and thrown errors) frees it.
  let lockSupabase: any = null;
  let lockSceneId: string | null = null;
  let lockHolder: string | null = null;
  let lockPassIdx: number = 0; // v168 Phase 2 — per-pass-lock partition key (0 when flag OFF)
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
    //
    // v168 Phase 2 — Per-Pass-Lock. When FEATURE_PER_PASS_LOCK=true, the lock
    // is partitioned by (scene_id, pass_idx) so up to N parallel passes for
    // the same scene can each dispatch concurrently. When OFF, pass_idx
    // defaults to 0 → exact legacy single-flight-per-scene semantics.
    // Initial dispatch from the client has no body.pass_idx → 0.
    // Self-invoke / webhook advance calls carry pass_idx in body.
    {
      // v192 — Default flipped ON. Per-pass lock avoids scene-wide advance-webhook
      // collisions when two Sync.so passes finish nearly simultaneously. Set the
      // env var to "false" explicitly for emergency rollback to legacy scene-lock.
      const perPassLockEnabled = (Deno.env.get("FEATURE_PER_PASS_LOCK") ?? "true")
        .toLowerCase() === "true";
      const bodyPassIdx = Number(body?.pass_idx);
      const earlyPassIdx = perPassLockEnabled && Number.isFinite(bodyPassIdx) && bodyPassIdx >= 0
        ? Math.floor(bodyPassIdx)
        : 0;
      const holder = `compose-dialog-segments-${crypto.randomUUID()}`;
      const { data: acquired, error: lockErr } = await supabase.rpc(
        "try_acquire_dialog_lock",
        // v193 — preclip + provider preflight can legitimately exceed the old
        // 120s TTL. When it expired mid-flight, a webhook advance could acquire
        // the same pass lock and dispatch a duplicate Sync.so job. Keep stale
        // recovery possible, but long enough for one pass preflight.
        { _scene_id: sceneId, _holder: holder, _ttl_seconds: 420, _pass_idx: earlyPassIdx },
      );
      if (lockErr) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} pass=${earlyPassIdx} lock rpc error: ${lockErr.message} — proceeding without lock`);
      } else if (acquired !== true) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} pass=${earlyPassIdx} BUSY — another dispatcher holds the (scene,pass) lock; skipping`);
        return json({ ok: true, status: "scene_lock_busy", scene_id: sceneId, pass_idx: earlyPassIdx }, 202);
      } else {
        lockSupabase = supabase;
        lockSceneId = sceneId;
        lockHolder = holder;
        lockPassIdx = earlyPassIdx;
        if (perPassLockEnabled) {
          console.log(`[compose-dialog-segments] scene=${sceneId} v168_per_pass_lock ACQUIRED pass=${earlyPassIdx}`);
        }
      }
    }



    const { data: scene, error: sceneErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, audio_plan, dialog_script, dialog_turns, character_shots, dialog_shots, clip_url, lip_sync_source_clip_url, lip_sync_applied_at, lip_sync_status, reference_image_url, lock_reference_url, scene_assets",
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

    if (
      (scene as any).lip_sync_status === "canceled" ||
      (scene as any).dialog_shots?.status === "canceled"
    ) {
      return json({ ok: true, skipped: "canceled", scene_id: sceneId });
    }

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
      const entryTurnIdx = typeof body?.pass_idx === "number" && Number.isFinite(body.pass_idx)
        ? Number(body.pass_idx)
        : null;
      await logSyncDispatch(supabase, {
        scene_id: sceneId,
        user_id: userId,
        engine: "sync-segments",
        // v134 §3 — turn_idx populated whenever the caller knows which pass.
        turn_idx: entryTurnIdx,
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
          // v134 §3 — Forensik-friendly noop tracking
          noop_auto_escalation: body?.noop_auto_escalation === true,
          noop_escalation_step: typeof body?.noop_escalation_step === "number" ? body.noop_escalation_step : null,
          requested_retry_variant: typeof body?.retry_variant === "string" ? body.retry_variant : null,
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
    let canonicalDialogTurnsCount = 0;
    let canonicalSpeakerIds: string[] = [];
    let speakersSource = "audio_plan";

    if (await readIdOnlyEnabled(supabase)) {
      const ensuredTurns = await ensureDialogTurnsForScene(supabase, scene as any);
      if (ensuredTurns.ok) {
        canonicalDialogTurnsCount = ensuredTurns.turns.length;
        canonicalSpeakerIds = orderedSpeakerIdsFromTurns(ensuredTurns.turns);
        speakersSource = "dialog_turns";
        console.log(
          `[compose-dialog-segments] v201_id_only_cast scene=${sceneId} source=${ensuredTurns.source} turns=${canonicalDialogTurnsCount} cast=[${canonicalSpeakerIds.join(",")}]`,
        );

        // v202 — Cast & World ID-registry log marker. Verifies that every
        // canonical dialog speaker is present as an AssetRef(character)
        // in scene_assets. Observability only — never blocks dispatch here.
        try {
          const rawAssets = Array.isArray((scene as any).scene_assets)
            ? ((scene as any).scene_assets as Array<{ type?: string; id?: string }>)
            : [];
          const charSet = new Set(
            rawAssets.filter((a) => a?.type === "character" && typeof a.id === "string").map((a) => a.id as string),
          );
          const locCount = rawAssets.filter((a) => a?.type === "location").length;
          const missing = canonicalSpeakerIds.filter((id) => !charSet.has(id));
          console.log(
            `[compose-dialog-segments] v202_asset_registry_bound scene=${sceneId} assets_total=${rawAssets.length} characters=${charSet.size} locations=${locCount} missing=[${missing.join(",")}]`,
          );
        } catch (e) {
          console.warn(`[compose-dialog-segments] v202 log marker failed: ${(e as Error)?.message ?? e}`);
        }
      } else if (ensuredTurns.reason !== "no_dialog_lines") {
        const hasUuidSpeaker = speakers.some((sp: any) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sp?.character_id ?? "")),
        );
        const hasUuidShot = Array.isArray((scene as any).character_shots) &&
          (scene as any).character_shots.some((shot: any) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(shot?.characterId ?? shot?.character_id ?? "")),
          );
        if (hasUuidSpeaker || hasUuidShot) {
          console.error(
            `[compose-dialog-segments] v201_id_only_required_block scene=${sceneId} reason=${ensuredTurns.reason} details=${JSON.stringify(ensuredTurns.details ?? {})}`,
          );
          await supabase
            .from("composer_scenes")
            .update({
              lip_sync_status: "failed",
              twoshot_stage: "failed",
              clip_error: `id_only_dialog_turns_required:${ensuredTurns.reason}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sceneId);
          return json({ error: "id_only_dialog_turns_required", reason: ensuredTurns.reason, details: ensuredTurns.details ?? null }, 422);
        }
      }
    }

    if (!masterAudioUrl || speakers.length === 0 || totalSec <= 0) {
      // v172 self-heal: NICHT als hartes failed markieren — der Audio-Prep
      // (compose-twoshot-audio) ist hier einfach noch nicht durchgelaufen
      // oder hat keinen master geschrieben. twoshot_stage auf null setzen,
      // damit der Client-Trigger (useTwoShotAutoTrigger) im nächsten Tick
      // den Audio-Prep nachholt. Vorher blieb die Szene ewig auf
      // "Lip-Sync wird gestartet…" weil der Status pending blieb und
      // gleichzeitig twoshot_stage='master_clip' den Re-Try blockierte.
      await supabase
        .from("composer_scenes")
        .update({
          twoshot_stage: null,
          lip_sync_status: "pending",
          clip_error: "audio_plan_not_ready_self_heal",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return json(
        {
          ok: false,
          self_heal: true,
          error: "missing_audio_plan",
          message:
            "Audio-Plan ist noch nicht fertig — Stage wurde zurückgesetzt, Trigger holt compose-twoshot-audio im nächsten Tick nach.",
        },
        202,
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
    const persistedPlateIdentity = ((existing as any)?.plate_identity ?? null) as any;
    const persistedPlateDims = persistedPlateIdentity?.dims;
    if (
      !plateDims &&
      Number.isFinite(Number(persistedPlateDims?.width)) &&
      Number.isFinite(Number(persistedPlateDims?.height))
    ) {
      plateDims = {
        width: Math.round(Number(persistedPlateDims.width)),
        height: Math.round(Number(persistedPlateDims.height)),
      };
      plateDimsSource = "anchor_facemap_fallback";
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v153.2_plate_hydration source=persisted-dims dims=${plateDims.width}x${plateDims.height}`,
      );
    }

    const videoDims = plateDims ?? {
      width: Number((existing as any)?.video_width) || 1280,
      height: Number((existing as any)?.video_height) || 720,
    };
    const _clipSource = (scene as any)?.clip_source ?? "unknown";
    const _engineOverride = (scene as any)?.engine_override ?? "auto";
    console.log(
      `[compose-dialog-segments] scene=${sceneId} plateDims source=${plateDimsSource} dims=${videoDims.width}x${videoDims.height} clip_source=${_clipSource} engine=${_engineOverride} plate_url=${platePrimaryUrl ? platePrimaryUrl.slice(-60) : "null"}`,
    );
    // v184 quality-forensics: flag likely-720p sub-HD plates so we can decide
    // to bump provider resolution later. Pure logging — no behavior change.
    if (videoDims.width * videoDims.height < 1280 * 720) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v184_low_res_plate dims=${videoDims.width}x${videoDims.height} clip_source=${_clipSource} — final MP4 will look soft when scaled to preview`,
      );
    }

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
    // v185 — Anchor-First Truth Snapshot.
    // Freeze the anchor-derived speaker coordinates BEFORE the v183 plate-
    // identity mapping overwrites `speakerCoords`. Used at the end of the
    // mapping block to sanity-check that each assigned plate bbox actually
    // sits on the same face the anchor pipeline identified. If the plate
    // detector (AWS Rekognition on the Hailuo plate) returned a bogus box
    // (e.g. whiteboard scribbles false-positived as a face) and v183
    // Confidence-Ranking still labeled it with the speaker's character_id,
    // the resulting bbox is off-face and Sync.so rejects the dispatch with
    // `generation_input_face_selection_invalid`. Anchor coords never drift
    // more than 5–15 % vs the rendered plate (Hailuo i2v preserves the
    // anchor composition), so an anchor coord that lies OUTSIDE the assigned
    // plate bbox is a deterministic signal that the plate face is wrong.
    const anchorSpeakerCoords: Array<[number, number] | null> = speakerCoords.map(
      (c) => (Array.isArray(c) ? [c[0], c[1]] as [number, number] : null),
    );

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
    // v160 — Pro-Sprecher Mund-Landmark (AWS Rekognition). Der Landmark ist
    // nur noch der deterministische Identitäts-/Qualitätsanker. Sync.so
    // erwartet bei `bounding_boxes(_url)` eine echte Face-Detection-Box, keine
    // Mini-Lippenregion; zu kleine Mouth-Boxes führten zu No-Lipsync/Morphs.
    const speakerPlateMouths: Array<[number, number] | null> =
      new Array(speakers.length).fill(null);
    let plateIdentityMap: Awaited<ReturnType<typeof resolvePlateFaceIdentities>> | null = null;
    let plateHydrationSource: "persisted" | "live" | "missing" = "missing";
    const persistedBboxes = Array.isArray(persistedPlateIdentity?.bboxes)
      ? persistedPlateIdentity.bboxes
      : [];
    // v154 — Geometry sanity gate against the persisted bboxes. The pre-v154
    // detector path occasionally cached torso/upper-body boxes (center y >
    // 0.55 of plate height). If those got persisted into dialog_shots, they
    // would survive "Sauber neu starten" forever. Discard suspect persisted
    // identities so the live re-detect path (with the new gate) runs.
    let persistedGateOk = true;
    if (persistedBboxes.length >= speakers.length && plateDims) {
      const probeFaces = persistedBboxes
        .slice(0, speakers.length)
        .filter((b: unknown) => Array.isArray(b) && (b as unknown[]).length === 4)
        .map((b: number[]) => ({
          bbox: [
            Math.round(Number(b[0])),
            Math.round(Number(b[1])),
            Math.round(Number(b[2])),
            Math.round(Number(b[3])),
          ] as [number, number, number, number],
          center: [
            Math.round((Number(b[0]) + Number(b[2])) / 2),
            Math.round((Number(b[1]) + Number(b[3])) / 2),
          ] as [number, number],
          slot: 0,
        }));
      const gate = validatePlateFacesGeometry(probeFaces, plateDims.width, plateDims.height);
      if (!gate.ok) {
        persistedGateOk = false;
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v154_persisted_identity_evict reason=${gate.reason} ` +
          `detail=${gate.detail ?? "-"} — forcing live plate re-detection`,
        );
      }
    }
    // v242 — ID-first rehydration + Character-Assignment-Lock enforcement.
    //
    // Root cause of the "speaker 2 speaks line 3" bug (scene 53976949…):
    // the legacy code hydrated speakerPlateBboxes[i] from persistedBboxes[i]
    // positionally. persistedBboxes is written in speaker-index order, so
    // if the initial run assigned the wrong bbox to speaker i, the swap was
    // "frozen" and every rerender perpetuated it. persistedFaces[] DID
    // contain the correct characterId → bbox mapping — it just wasn't used.
    //
    // New order of precedence:
    //   (a) assignmentLock (locked characterId per speakerIdx, if present)
    //   (b) persistedFaces[] matched by characterId (with stripIdPrefix)
    //   (c) legacy positional fallback (persistedBboxes[i])
    //
    // Any of the above sets plateHydrationSource="persisted" and short-
    // circuits the live Gemini re-detect below. Consistency (>50 px drift)
    // is checked implicitly: if a locked characterId cannot be found in
    // persistedFaces[] we fall through to live detection.
    const stripIdPrefixLocal = (id?: string | null) =>
      String(id ?? "")
        .toLowerCase()
        .replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");
    if (persistedGateOk && persistedBboxes.length >= speakers.length) {
      const persistedMouths: any[] = Array.isArray(persistedPlateIdentity?.mouths)
        ? persistedPlateIdentity.mouths
        : [];
      const persistedFaces: any[] = Array.isArray(persistedPlateIdentity?.faces)
        ? persistedPlateIdentity.faces
        : [];
      const assignmentLock: Record<string, string> =
        (persistedPlateIdentity as any)?.assignmentLock &&
        typeof (persistedPlateIdentity as any).assignmentLock === "object"
          ? (persistedPlateIdentity as any).assignmentLock
          : {};
      const faceByCharId = new Map<string, any>();
      for (const pf of persistedFaces) {
        const cid = stripIdPrefixLocal((pf as any)?.characterId);
        if (cid && !faceByCharId.has(cid)) faceByCharId.set(cid, pf);
      }
      let mouthHydrated = 0;
      let idMatched = 0;
      let lockMatched = 0;
      let positionalFallback = 0;
      for (let i = 0; i < speakers.length; i++) {
        // (a) Lock: locked characterId for this speakerIdx wins.
        let matchedFace: any = null;
        let matchSource: string | null = null;
        const lockedCid = stripIdPrefixLocal(assignmentLock[String(i)]);
        if (lockedCid && faceByCharId.has(lockedCid)) {
          matchedFace = faceByCharId.get(lockedCid);
          matchSource = "lock";
          lockMatched++;
        }
        // (b) characterId from speakers[i] → persistedFaces[].characterId.
        if (!matchedFace) {
          const speakerCid = stripIdPrefixLocal(speakers[i]?.character_id);
          if (speakerCid && faceByCharId.has(speakerCid)) {
            matchedFace = faceByCharId.get(speakerCid);
            matchSource = "cid";
            idMatched++;
          }
        }
        // (c) Positional fallback (legacy behavior).
        let bboxSource: [number, number, number, number] | null = null;
        let mouthSource: [number, number] | null = null;
        if (matchedFace && Array.isArray(matchedFace.bbox) && matchedFace.bbox.length === 4) {
          bboxSource = [
            Math.round(Number(matchedFace.bbox[0])),
            Math.round(Number(matchedFace.bbox[1])),
            Math.round(Number(matchedFace.bbox[2])),
            Math.round(Number(matchedFace.bbox[3])),
          ];
          if (Array.isArray(matchedFace.mouth) && matchedFace.mouth.length === 2) {
            mouthSource = [
              Math.round(Number(matchedFace.mouth[0])),
              Math.round(Number(matchedFace.mouth[1])),
            ];
          }
        } else {
          const b = persistedBboxes[i];
          if (Array.isArray(b) && b.length === 4 && b.every((n: unknown) => Number.isFinite(Number(n)))) {
            bboxSource = [
              Math.round(Number(b[0])),
              Math.round(Number(b[1])),
              Math.round(Number(b[2])),
              Math.round(Number(b[3])),
            ];
            const snapM = persistedMouths[i];
            if (Array.isArray(snapM) && snapM.length === 2 &&
                Number.isFinite(Number(snapM[0])) && Number.isFinite(Number(snapM[1]))) {
              mouthSource = [Math.round(Number(snapM[0])), Math.round(Number(snapM[1]))];
            }
            matchSource = "positional";
            positionalFallback++;
          }
        }
        if (bboxSource) {
          speakerPlateBboxes[i] = bboxSource;
          const targetCx = Math.round((bboxSource[0] + bboxSource[2]) / 2);
          const targetCy = Math.round((bboxSource[1] + bboxSource[3]) / 2);
          if (mouthSource) {
            speakerPlateMouths[i] = mouthSource;
            speakerCoords[i] = clampSyncCoords([mouthSource[0], mouthSource[1]]);
            coordSources[i] = `plate-persisted-mouth-${matchSource ?? "positional"}`;
            mouthHydrated++;
          } else {
            speakerCoords[i] = clampSyncCoords([targetCx, targetCy]);
            coordSources[i] = `plate-persisted-${matchSource ?? "positional"}`;
          }
        }
      }
      plateHydrationSource = speakerPlateBboxes.every(Boolean) ? "persisted" : "missing";
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v242_persisted_id_first_hydration ` +
        `lock=${lockMatched}/${speakers.length} cid=${idMatched}/${speakers.length} ` +
        `positional=${positionalFallback}/${speakers.length} mouths=${mouthHydrated}/${speakers.length} ` +
        `bboxes=${speakerPlateBboxes.filter(Boolean).length}/${speakers.length} ` +
        `lock_present=${Object.keys(assignmentLock).length > 0}`,
      );
    }
    if (plateHydrationSource !== "persisted" && speakers.length >= 1 && plateDims && sourceClipUrl) {
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
          anchorUrl, // v156 — Anchor-First: AWS Rekognition runs on this image
          expectedFaceCount: speakers.length, // v184 — decouple from portrait resolver
        });
      } catch (err) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} plate-identity resolve threw: ${(err as Error)?.message}`,
        );
      }
    }
    if (plateIdentityMap && plateIdentityMap.faces.length > 0) {
      // v166 — Anchor-Identity Slot Bridge.
      // If the plate-identity step could not label faces (Gemini probe failed
      // or resolvedCount=0), but the anchor faceMap KNOWS the characterId of
      // every visual slot (sorted L→R), bridge anchor_slot → plate_slot by
      // position. Both detectors sort faces left→right; for N detected faces
      // matching N anchor slots, slot i on plate IS slot i on anchor.
      // Without this bridge, the legacy code falls back to
      // `unlabeled.find(f => f.slot === idx)` where `idx` is the SCRIPT order,
      // which has no relation to visual position → wrong speaker → wrong face
      // animated. (DB-confirmed root cause of "Sprecher 3 wurde von Sprecher 1
      // gesprochen" in scene 0b0b7f78… on 2026-06-21.)
      const anchorFaces = Array.isArray((faceMap as any)?.faces)
        ? ((faceMap as any).faces as Array<{ slotIndex?: number; characterId?: string | null }>)
        : [];
      const anchorHasIdentities =
        anchorFaces.length > 0 &&
        anchorFaces.every((f) => typeof f?.characterId === "string" && (f.characterId as string).length > 0);
      // v183 — Bridge auch bei Ungleichheit: greift solange der Anchor mindestens
      // so viele identifizierte Faces hat wie er Plate-Faces sieht. Damit greift
      // die Bridge auch wenn die HH/Hailuo-Plate mehr Gesichter zeigt als der
      // Anchor kannte (Statisten, Reflexionen). Zuweisung bleibt Visual-L→R,
      // begrenzt auf die Anzahl der Anchor-Slots — der Rest bleibt `unlabeled`.
      if (
        anchorHasIdentities &&
        anchorFaces.length >= 1 &&
        anchorFaces.length <= plateIdentityMap.faces.length &&
        plateIdentityMap.faces.some((f) => !f.characterId)
      ) {
        const platesByVisual = [...plateIdentityMap.faces].sort((a, b) => a.slot - b.slot);
        const anchorByVisual = [...anchorFaces].sort(
          (a, b) => Number(a.slotIndex ?? 0) - Number(b.slotIndex ?? 0),
        );
        const bridgeLimit = Math.min(anchorByVisual.length, platesByVisual.length);
        for (let visualIdx = 0; visualIdx < bridgeLimit; visualIdx++) {
          const pf = platesByVisual[visualIdx];
          if (!pf.characterId) {
            const cid = anchorByVisual[visualIdx]?.characterId ?? null;
            if (cid) {
              pf.characterId = String(cid);
              (pf as any).matchConfidence = 0.85;
            }
          }
        }
        // v222 — Bridge writes characterId onto faces but the original
        // resolvedCount was computed BEFORE the bridge ran. Recompute so
        // downstream guards (haveBboxUrlPathForEdge, preclip eligibility,
        // v107 hard-preclip enforcement, snapshot persistence) see the true
        // number of identified faces. Root cause of DB-verified scene
        // 7d45c852 (2026-07-10): 4 bridged faces, resolvedCount stuck at 0,
        // pipeline fell back to `bbox-url-pro` full-plate single job → only
        // speakers 1 & 2 (left half) lip-synced, 3 & 4 stayed silent.
        plateIdentityMap.resolvedCount = plateIdentityMap.faces.filter(
          (f) => !!f.characterId,
        ).length;
        const partial = anchorByVisual.length < platesByVisual.length ? "_partial" : "";
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v183_anchor_identity_slot_bridge${partial} bridged=${plateIdentityMap.faces.filter((f) => f.characterId).length}/${plateIdentityMap.faces.length} anchor_ids=${anchorByVisual.map((f) => f.characterId).join(",")} resolvedCount_after_bridge=${plateIdentityMap.resolvedCount}`,
        );
      }

      // v170 — Strip variant-id prefixes (outfit:/pose:/wardrobe:/vibe:/prop:/look:)
      // before matching. The Saved-Outfit-Look feature stores speakers with a
      // composite mention-key like `outfit:<base-uuid>`, but plate-face-identity
      // labels faces with the raw `brand_character.id`. Without normalization
      // every single-speaker scene with a saved outfit fell into the v166 hard-
      // fail and showed "kein eindeutiges Gesicht in der Szene".
      const stripIdPrefix = (id?: string | null) =>
        String(id ?? "")
          .toLowerCase()
          .replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");

      // v183 — Character-ID-First mit Confidence-Ranking.
      // Statt einer flachen Map<cid, PlateFace> (die Duplikate stillschweigend
      // überschreibt) sammeln wir pro stripped-cid ALLE Kandidaten-Faces,
      // absteigend sortiert nach matchConfidence. So kann bei einer Rekognition-
      // Kollision (zwei Faces mit demselben Char-Label — Reflexion, Statist)
      // der zweite Speaker auf den nächstbesten Kandidaten fallen statt auf
      // dieselbe Box wie Speaker 0.
      const byIdRanked = new Map<string, PlateIdentityFace[]>();
      for (const f of plateIdentityMap.faces) {
        if (!f.characterId) continue;
        const key = stripIdPrefix(f.characterId);
        if (!byIdRanked.has(key)) byIdRanked.set(key, []);
        byIdRanked.get(key)!.push(f);
      }
      for (const arr of byIdRanked.values()) {
        arr.sort((a, b) => {
          const ca = Number((a as any).matchConfidence ?? 0);
          const cb = Number((b as any).matchConfidence ?? 0);
          return cb - ca;
        });
      }

      // Slot-fallback for any face the identity step couldn't label.
      // v129.20: for single-speaker scenes sort unlabeled faces by bbox
      // area (largest first) so spurious detections (mirror, background
      // person) lose to the actual subject.
      const unlabeledPool = plateIdentityMap.faces.filter((f) => !f.characterId);
      if (speakers.length === 1 && unlabeledPool.length > 1) {
        unlabeledPool.sort((a, b) => {
          const areaA = (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]);
          const areaB = (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]);
          return areaB - areaA;
        });
      } else if (speakers.length >= 2 && unlabeledPool.length > 1) {
        // Multi-speaker unlabeled fallback läuft Visual-L→R (nach f.slot).
        unlabeledPool.sort((a, b) => a.slot - b.slot);
      }

      // v183 — Cast-Konfig-Guard: mehrere Speaker mit derselben stripped
      // character_id sind ein echter Konfig-Fehler (nicht auto-fixbar).
      // Wir loggen es hier laut; der Preflight-Block weiter unten refunded
      // dann mit der v183_cast_duplicate-Meldung.
      const cidToSpeakerIdxs = new Map<string, number[]>();
      speakers.forEach((sp, idx) => {
        const cid = stripIdPrefix(sp.character_id);
        if (!cid) return;
        if (!cidToSpeakerIdxs.has(cid)) cidToSpeakerIdxs.set(cid, []);
        cidToSpeakerIdxs.get(cid)!.push(idx);
      });
      const castDupCids: string[] = [];
      for (const [cid, idxs] of cidToSpeakerIdxs.entries()) {
        if (idxs.length >= 2) castDupCids.push(`${cid}=[${idxs.join(",")}]`);
      }
      if (castDupCids.length > 0) {
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v183_cast_duplicate_character_id ${castDupCids.join(" ")} — ` +
          `two or more speakers share the same base character; this cannot resolve to distinct plate faces`,
        );
      }

      // Uniqueness-Enforcement: dieselbe Plate-Face darf nie zwei Sprechern
      // zugewiesen werden. Wir tracken pro (Plate-Face) einen stabilen Key.
      const faceKey = (f: PlateIdentityFace): string =>
        `${f.slot}|${f.bbox[0]},${f.bbox[1]},${f.bbox[2]},${f.bbox[3]}`;
      const assignedFaceKeys = new Set<string>();
      const canFallbackUnlabeled =
        plateIdentityMap.faces.length >= speakers.length;

      speakers.forEach((sp, idx) => {
        const cid = stripIdPrefix(sp.character_id);
        let plateFace: PlateIdentityFace | undefined;
        let source = "plate-identity";

        // 1) Top-Ranked Face für cid nehmen, das noch nicht vergeben ist.
        if (cid) {
          const ranked = byIdRanked.get(cid);
          if (ranked && ranked.length > 0) {
            for (const cand of ranked) {
              const k = faceKey(cand);
              if (!assignedFaceKeys.has(k)) {
                plateFace = cand;
                source = ranked.indexOf(cand) === 0
                  ? "plate-identity-cid-primary"
                  : "plate-identity-cid-secondary";
                break;
              }
            }
            if (!plateFace) {
              console.warn(
                `[compose-dialog-segments] scene=${sceneId} v183_identity_collision ` +
                `speaker=${sp.speaker ?? `idx${idx}`} cid=${cid} ranked=${ranked.length} ` +
                `reason=all_ranked_already_assigned`,
              );
            }
          }
        }

        // 2) Unlabeled-Fallback per Visual-L→R (nur wenn genug Faces vorhanden).
        if (!plateFace) {
          if (speakers.length === 1 && unlabeledPool.length > 0) {
            for (const cand of unlabeledPool) {
              const k = faceKey(cand);
              if (!assignedFaceKeys.has(k)) {
                plateFace = cand;
                source = "single-speaker-largest-face";
                console.log(
                  `[compose-dialog-segments] scene=${sceneId} v170_single_speaker_largest_face ` +
                  `character_id=${cid || "?"} unlabeled_plate_faces=${unlabeledPool.length}`,
                );
                break;
              }
            }
          } else if (canFallbackUnlabeled && unlabeledPool.length > 0) {
            for (const cand of unlabeledPool) {
              const k = faceKey(cand);
              if (!assignedFaceKeys.has(k)) {
                plateFace = cand;
                source = "v183-unlabeled-fallback";
                console.log(
                  `[compose-dialog-segments] scene=${sceneId} v183_unlabeled_fallback ` +
                  `speaker=${sp.speaker ?? `idx${idx}`} cid=${cid || "?"} ` +
                  `plate_face_slot=${cand.slot}`,
                );
                break;
              }
            }
          }
          if (!plateFace) {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} v183_identity_collision ` +
              `speaker=${sp.speaker ?? `idx${idx}`} cid=${cid || "?"} ` +
              `plate_face_count=${plateIdentityMap.faces.length} speakers=${speakers.length} ` +
              `reason=exhausted — slot bleibt leer`,
            );
          }
        }

        if (plateFace) {
          assignedFaceKeys.add(faceKey(plateFace));
          // v155 — Prefer the Rekognition-derived mouth landmark over the
          // bbox center.
          const mouth = (plateFace as any).mouth as [number, number] | undefined;
          if (Array.isArray(mouth) && Number.isFinite(mouth[0]) && Number.isFinite(mouth[1])) {
            speakerCoords[idx] = [mouth[0], mouth[1]];
            const dy = mouth[1] - plateFace.center[1];
            console.log(
              `[compose-dialog-segments] v155_mouth_landmark_used speaker=${idx} ` +
              `mouth=[${mouth[0]},${mouth[1]}] bbox_center=[${plateFace.center[0]},${plateFace.center[1]}] dy=${dy}`,
            );
          } else {
            speakerCoords[idx] = [plateFace.center[0], plateFace.center[1]];
          }
          speakerPlateBboxes[idx] = plateFace.bbox;
          if (Array.isArray((plateFace as any).mouth)) {
            const mLm = (plateFace as any).mouth as [number, number];
            if (Number.isFinite(mLm[0]) && Number.isFinite(mLm[1])) {
              speakerPlateMouths[idx] = [mLm[0], mLm[1]];
            }
          }
          coordSources[idx] = source;
        }
      });
      plateHydrationSource = speakerPlateBboxes.every(Boolean) ? "live" : "missing";
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v183_plate_identity_mapping faces=${plateIdentityMap.faces.length} ` +
        `resolved=${plateIdentityMap.resolvedCount}/${speakers.length} assigned=${assignedFaceKeys.size}/${speakers.length} cast_dup=${castDupCids.length} cached=${plateIdentityMap.cached}`,
      );

      // ── v185 — Anchor-First Plate-Bbox Sanity Gate ──────────────────────
      // For each speaker: the assigned plate bbox MUST contain that
      // speaker's anchor coord (with a small in-frame tolerance). If the
      // anchor coord lies outside the bbox, the plate detector produced a
      // false-positive (spurious detection on background / non-face pixels)
      // that v183 confidence-ranking then confidently mislabeled as this
      // speaker. Repairing this here avoids sending Sync.so a bbox that
      // targets a whiteboard / hand / prop, which is what triggered the
      // `generation_input_face_selection_invalid` REJECTED responses on
      // real 3-speaker Hailuo plates.
      //
      // Repair strategy (no auto-detect, deterministic per v169 §5):
      //   1) Compute the median face bbox size (w, h) from the OTHER
      //      speakers whose plate bbox validly contains their anchor coord.
      //      Fallback to 8% width × 15% height of the plate when no valid
      //      sibling exists.
      //   2) Center that median box on the anchor coord for the bad slot.
      //   3) Rewrite `speakerPlateBboxes[i]`, `speakerCoords[i]`, and
      //      `speakerPlateMouths[i]` from the anchor. Log a clear repair.
      // The repaired bbox is anchor-native so it will always overlap the
      // real face in the Hailuo plate (i2v preserves anchor composition
      // within ±10 % drift). Sync.so's own detector will accept it.
      if (plateDims && speakers.length >= 1) {
        const contains = (
          box: [number, number, number, number],
          pt: [number, number],
          padPx: number,
        ) => {
          const [bx1, by1, bx2, by2] = box;
          const [px, py] = pt;
          return (
            px >= bx1 - padPx &&
            px <= bx2 + padPx &&
            py >= by1 - padPx &&
            py <= by2 + padPx
          );
        };
        // v189 — Widened default pad from 8% → 20% of min plate dim.
        // Hailuo i2v routinely drifts anchor composition by 10-15% vs the
        // rendered plate (DB-confirmed scene 11df951d: Samuel anchor
        // x=461, real plate x=652, drift 9.9% of 1924-wide plate). At
        // 8% pad the anchor coord fell OUTSIDE the correct plate bbox and
        // v185 repaired to the WRONG (anchor-space) coord, destroying
        // the correctly-detected plate-native mouth. 20% pad accepts
        // that natural drift while still catching truly bogus plate
        // detections (whiteboard/hand false-positives sit >30% off).
        const padPx = Math.round(Math.min(plateDims.width, plateDims.height) * 0.20);

        // v239 — Detector-First Trust Gate.
        //
        // Prior versions (v185/v189) only trusted a slot when AWS Rekognition
        // returned matchConfidence >= 0.60. Any slot with lower or missing
        // matchConfidence fell through to the anchor-in-bbox test and was
        // frequently overwritten by anchor-space repair coords — destroying
        // correctly detected plate bboxes for both N=1 (mouth-closed, wrong
        // region) and N>=2 (only low-confidence speakers kipped, high-conf
        // speakers stayed correct → "speakers 3+4 broken while 1+2 work").
        //
        // v239 makes the detector itself authoritative: a slot is trusted
        // when EITHER the native detector confidence is high (>= 0.70) OR
        // the AWS cross-check confidence is at least 0.55. Non-trusted
        // slots are no longer judged by anchor overlap — that test punishes
        // legitimate Hailuo drift. Instead we apply objective sanity
        // criteria on the bbox itself: in-plate, plausible area, plausible
        // aspect ratio. Only bboxes that fail those objective checks are
        // treated as repair candidates.
        const DETECTOR_TRUST_THRESHOLD = 0.70;
        const IDENTITY_TRUST_THRESHOLD = 0.55;
        const plateIdentityFaces = plateIdentityMap?.faces ?? [];
        const trustedSlots: number[] = [];
        const trustReasons: Record<number, string> = {};
        speakers.forEach((_sp, i) => {
          const box = speakerPlateBboxes[i];
          if (!box) return;
          const bx1 = box[0], by1 = box[1], bx2 = box[2], by2 = box[3];
          const match = plateIdentityFaces.find((f) => {
            if (!Array.isArray(f.bbox) || f.bbox.length !== 4) return false;
            return (
              Math.abs(f.bbox[0] - bx1) < 4 &&
              Math.abs(f.bbox[1] - by1) < 4 &&
              Math.abs(f.bbox[2] - bx2) < 4 &&
              Math.abs(f.bbox[3] - by2) < 4
            );
          });
          const detConf = Number((match as any)?.confidence);
          const idConf = Number((match as any)?.matchConfidence);
          if (Number.isFinite(detConf) && detConf >= DETECTOR_TRUST_THRESHOLD) {
            trustedSlots.push(i);
            trustReasons[i] = `detector=${detConf.toFixed(2)}`;
            return;
          }
          if (Number.isFinite(idConf) && idConf >= IDENTITY_TRUST_THRESHOLD) {
            trustedSlots.push(i);
            trustReasons[i] = `identity=${idConf.toFixed(2)}`;
            return;
          }
          // Legacy source-tag fallback — keep the previous whitelist so
          // slots that carry an explicit identity-assign tag stay trusted
          // even if the plate face record lacks a confidence field.
          const sourceTag = coordSources[i] ?? "";
          const identityAssigned =
            sourceTag === "identity" ||
            sourceTag.startsWith("v183-") ||
            sourceTag === "single-speaker-largest-face" ||
            sourceTag === "plate-persisted-mouth" ||
            sourceTag === "plate-persisted";
          if (identityAssigned && Number.isFinite(idConf) && idConf >= 0.60) {
            trustedSlots.push(i);
            trustReasons[i] = `legacy=${idConf.toFixed(2)}`;
          }
        });

        // v239 — Objective bbox sanity check. Replaces the anchor-in-bbox
        // test for non-trusted slots. A bbox is "sane" when it lies inside
        // the plate (with 5% tolerance), covers between 0.3% and 25% of
        // plate area, and has an aspect ratio between 0.4 and 2.5.
        const plateArea = Math.max(1, plateDims.width * plateDims.height);
        const inPlateTol = Math.max(
          8,
          Math.round(Math.min(plateDims.width, plateDims.height) * 0.05),
        );
        const bboxSanity = (
          box: [number, number, number, number],
        ): { ok: boolean; reason: string } => {
          const [bx1, by1, bx2, by2] = box;
          const w = bx2 - bx1;
          const h = by2 - by1;
          if (w <= 0 || h <= 0) return { ok: false, reason: "degenerate" };
          if (
            bx1 < -inPlateTol ||
            by1 < -inPlateTol ||
            bx2 > plateDims.width + inPlateTol ||
            by2 > plateDims.height + inPlateTol
          ) {
            return { ok: false, reason: "out_of_plate" };
          }
          const areaRatio = (w * h) / plateArea;
          if (areaRatio < 0.003) return { ok: false, reason: "area_too_small" };
          if (areaRatio > 0.25) return { ok: false, reason: "area_too_large" };
          const aspect = w / h;
          if (aspect < 0.4 || aspect > 2.5) {
            return { ok: false, reason: `aspect=${aspect.toFixed(2)}` };
          }
          return { ok: true, reason: "ok" };
        };

        const goodSlots: number[] = [];
        const badSlots: number[] = [];
        const badReasons: Record<number, string> = {};
        speakers.forEach((_sp, i) => {
          const box = speakerPlateBboxes[i];
          const anchor = anchorSpeakerCoords[i];
          if (!box || !anchor) return;
          if (trustedSlots.includes(i)) {
            goodSlots.push(i);
            return;
          }
          const sanity = bboxSanity(box);
          if (sanity.ok) {
            goodSlots.push(i);
          } else {
            badSlots.push(i);
            badReasons[i] = sanity.reason;
          }
        });

        console.log(
          `[compose-dialog-segments] scene=${sceneId} v239_repair_gate ` +
          `trusted=${trustedSlots.length}/${speakers.length} ` +
          `sanity_ok=${goodSlots.length - trustedSlots.length}/${speakers.length - trustedSlots.length} ` +
          `repaired=${badSlots.length}/${speakers.length} ` +
          `trust_reasons=${JSON.stringify(trustReasons)} ` +
          `bad_reasons=${JSON.stringify(badReasons)} ` +
          `det_threshold=${DETECTOR_TRUST_THRESHOLD} id_threshold=${IDENTITY_TRUST_THRESHOLD}`,
        );
        // Legacy log line kept for dashboards that grep on the old tag.
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v189_identity_trust_gate ` +
          `trusted=${trustedSlots.length}/${speakers.length} good=${goodSlots.length} bad=${badSlots.length} ` +
          `pad_pct=20 threshold=${IDENTITY_TRUST_THRESHOLD}`,
        );

        if (badSlots.length > 0) {
          const goodBoxes = goodSlots
            .map((i) => speakerPlateBboxes[i]!)
            .filter(Boolean);
          const median = (arr: number[]) => {
            const s = [...arr].sort((a, b) => a - b);
            const m = Math.floor(s.length / 2);
            return s.length === 0
              ? 0
              : s.length % 2
                ? s[m]
                : Math.round((s[m - 1] + s[m]) / 2);
          };
          const medW = goodBoxes.length > 0
            ? median(goodBoxes.map((b) => b[2] - b[0]))
            : Math.round(plateDims.width * 0.08);
          const medH = goodBoxes.length > 0
            ? median(goodBoxes.map((b) => b[3] - b[1]))
            : Math.round(plateDims.height * 0.15);
          const halfW = Math.max(24, Math.round(medW / 2));
          const halfH = Math.max(24, Math.round(medH / 2));

          for (const i of badSlots) {
            const anchor = anchorSpeakerCoords[i]!;
            const before = speakerPlateBboxes[i];
            const cx = Math.max(halfW, Math.min(plateDims.width - halfW, anchor[0]));
            const cy = Math.max(halfH, Math.min(plateDims.height - halfH, anchor[1]));
            const repaired: [number, number, number, number] = [
              cx - halfW,
              cy - halfH,
              cx + halfW,
              cy + halfH,
            ];
            speakerPlateBboxes[i] = repaired;
            speakerCoords[i] = [cx, cy];
            speakerPlateMouths[i] = [cx, cy];
            coordSources[i] = "v185-anchor-repair";
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} v185_anchor_plate_bbox_repair ` +
              `speaker=${speakers[i]?.speaker_name ?? `idx${i}`} anchor=[${anchor[0]},${anchor[1]}] ` +
              `bad_bbox=${JSON.stringify(before)} repaired=${JSON.stringify(repaired)} ` +
              `median_face=${medW}x${medH} good_slots=${goodSlots.length}/${speakers.length}`,
            );
          }
        } else {
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v185_anchor_plate_bbox_gate ok=${goodSlots.length}/${speakers.length} — all plate bboxes trusted or contain anchor`,
          );
        }
      }


      // v183 — Cast-Duplicate früh-refund. Wenn zwei Sprecher denselben
      // stripped character_id verwenden, kann die Pipeline das nicht auflösen.
      // Wir refunden hier bevor der generische Preflight-Block feuert, mit
      // einer klaren Meldung.
      if (
        castDupCids.length > 0 &&
        !isAdvance &&
        !isRetry &&
        speakers.length >= 2
      ) {
        const firstDup = castDupCids[0];
        const dupSpeakerIdxs = firstDup
          .split("=")[1]
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((s) => Number(s.trim()));
        const nameA =
          speakers[dupSpeakerIdxs[0]]?.speaker_name ??
          speakers[dupSpeakerIdxs[0]]?.speaker ??
          `Speaker ${dupSpeakerIdxs[0] + 1}`;
        const nameB =
          speakers[dupSpeakerIdxs[1]]?.speaker_name ??
          speakers[dupSpeakerIdxs[1]]?.speaker ??
          `Speaker ${dupSpeakerIdxs[1] + 1}`;
        const msg =
          `Lip-Sync abgebrochen: ${nameA} und ${nameB} verweisen auf denselben Basis-Charakter. ` +
          `Bitte einem der beiden einen anderen Character zuweisen (oder die Rollen zusammenfassen). ` +
          `Credits wurden zurückerstattet.`;
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v183_cast_duplicate_character_id_refund ${firstDup} — refunding ${totalCost} credits`,
        );
        const alreadyRefundedCD = !!(existing as any)?.refunded;
        if (!alreadyRefundedCD) {
          try {
            const { data: wCD } = await supabase
              .from("wallets").select("balance").eq("user_id", userId).single();
            await supabase
              .from("wallets")
              .update({
                balance: Number(wCD?.balance ?? 0) + Number(totalCost ?? 0),
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
          } catch (e) {
            console.error(
              `[compose-dialog-segments] scene=${sceneId} v183 cast-dup refund failed: ${(e as Error)?.message}`,
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
              cost_credits: Number((existing as any)?.cost_credits ?? totalCost),
              refunded: true,
              error: "v183_cast_duplicate_character_id",
              finished_at: new Date().toISOString(),
            },
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error: msg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_status: "PREFLIGHT_BLOCKED", error_class: "v183_cast_duplicate_character_id",
          error_message: firstDup,
          meta: {
            speakers: speakers.length,
            duplicate_cids: castDupCids,
            refunded_credits: alreadyRefundedCD ? 0 : totalCost,
            compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
          },
        });
        return json(
          {
            error: "v183_cast_duplicate_character_id",
            duplicates: castDupCids,
            refunded: alreadyRefundedCD ? 0 : totalCost,
          },
          422,
        );
      }
    } else if (speakers.length >= 2 && !isAdvance) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} plate-identity unavailable — using anchor-rescale coords (may drift)`,
      );
    }
    // v158 — Persist a per-speaker mouth array directly on the snapshot so
    // advance/retry passes can rehydrate Sync.so face-target boxes without
    // re-running plate-face detection. faces[].mouth still exists for the
    // diagnostic path, but the parallel `mouths[i]` array is the canonical
    // source on the persisted hydration branch above.
    // v242 — Build the Character-Assignment-Lock. When we have a live
    // plate-identity result AND every speaker got a plate-face by
    // characterId (source starts with "plate-identity-cid"), lock the
    // {speakerIdx → characterId} mapping so future rerenders read it
    // BEFORE any positional data. Existing lock is preserved when the
    // current run couldn't produce a fresh, clean assignment.
    const stripLockPrefix = (id?: string | null) =>
      String(id ?? "").toLowerCase().replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");
    const existingLock: Record<string, string> =
      (persistedPlateIdentity as any)?.assignmentLock &&
      typeof (persistedPlateIdentity as any).assignmentLock === "object"
        ? { ...(persistedPlateIdentity as any).assignmentLock }
        : {};
    let freshLock: Record<string, string> | null = null;
    if (
      plateIdentityMap &&
      plateIdentityMap.faces.length > 0 &&
      speakers.every((sp) => !!stripLockPrefix(sp.character_id)) &&
      coordSources.every((s) => typeof s === "string" && s.startsWith("plate-identity-cid"))
    ) {
      freshLock = {};
      speakers.forEach((sp, idx) => {
        const cid = stripLockPrefix(sp.character_id);
        if (cid) freshLock![String(idx)] = cid;
      });
    }
    const finalAssignmentLock = freshLock ?? existingLock;
    const v153PlateIdentitySnapshot = {
      version: "v242" as const,
      dims: plateDims,
      bboxes: speakerPlateBboxes,
      mouths: speakerPlateMouths,
      faces: plateIdentityMap?.faces ?? persistedPlateIdentity?.faces ?? [],
      resolvedCount: plateIdentityMap?.resolvedCount ?? persistedPlateIdentity?.resolvedCount ?? 0,
      cached: plateIdentityMap?.cached ?? persistedPlateIdentity?.cached ?? false,
      sourceClipUrl,
      hydratedAt: new Date().toISOString(),
      assignmentLock: finalAssignmentLock,
    };
    console.warn(
      `[compose-dialog-segments] scene=${sceneId} v242_assignment_lock ` +
      `fresh=${freshLock ? "yes" : "no"} locked_slots=${Object.keys(finalAssignmentLock).length}/${speakers.length}`,
    );
    console.warn(
      `[compose-dialog-segments] scene=${sceneId} v158_plate_hydration source=${plateHydrationSource} speakers=${speakers.length} boxes=${speakerPlateBboxes.filter(Boolean).length}/${speakers.length} mouths=${speakerPlateMouths.filter(Boolean).length}/${speakers.length} advance=${isAdvance} retry=${isRetry}`,
    );

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

    // ── v153.1 — Unified Pre-Flight Hard-Fail (N=1..4) ──────────────────
    // SINGLE-PATH-POLICY: jeder Sprecher MUSS eine eigene plate-native Box
    // bekommen — gilt einheitlich für 1, 2, 3 oder 4 Sprecher. Wenn nicht,
    // würde der bbox-url-pro Pfad mehrere Sprecher auf dieselbe Box mappen
    // (N>=2: "Sprecher 1 spricht für 1+2"-Bug) oder bei N=1 still auf eine
    // synthetische Coords-Box zurückfallen. Lieber sofort hart abbrechen
    // + refund + klare Meldung, statt 20 min später ein falsch gemixtes
    // Video zu liefern.
    if (
      speakers.length >= 1
    ) {
      const missingBoxIdx: number[] = [];
      const plateDimsMissing = !plateDims;
      for (let i = 0; i < speakers.length; i++) {
        const b = speakerPlateBboxes?.[i];
        if (!Array.isArray(b) || b.length !== 4) missingBoxIdx.push(i);
      }
      // Zusätzlich: distinkte Boxen verlangen (zwei Speaker dürfen nicht
      // auf exakt dieselben Pixel mappen). Toleranz: center-Distanz <8px.
      const boxes = speakerPlateBboxes
        .map((b, i) => (Array.isArray(b) && b.length === 4 ? { i, b } : null))
        .filter(Boolean) as Array<{ i: number; b: number[] }>;
      const dupeIdx: number[] = [];
      for (let a = 0; a < boxes.length; a++) {
        for (let c = a + 1; c < boxes.length; c++) {
          const ca = [(boxes[a].b[0] + boxes[a].b[2]) / 2, (boxes[a].b[1] + boxes[a].b[3]) / 2];
          const cc = [(boxes[c].b[0] + boxes[c].b[2]) / 2, (boxes[c].b[1] + boxes[c].b[3]) / 2];
          const dx = ca[0] - cc[0];
          const dy = ca[1] - cc[1];
          if (Math.hypot(dx, dy) < 8) {
            dupeIdx.push(boxes[c].i);
          }
        }
      }
      if (plateDimsMissing || missingBoxIdx.length > 0 || dupeIdx.length > 0) {
        const reason = plateDimsMissing
          ? "v153_plate_dims_missing"
          : missingBoxIdx.length > 0
          ? `v153_plate_box_missing_for_speakers=[${missingBoxIdx.join(",")}]`
          : `v153_plate_box_duplicate_for_speakers=[${dupeIdx.join(",")}]`;
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v153.2_preflight_BLOCK ${reason} hydration=${plateHydrationSource} — refunding ${totalCost} credits, no dispatch`,
        );
        const alreadyRefundedPF = !!(existing as any)?.refunded;
        if (!alreadyRefundedPF) {
          try {
            const { data: wPF } = await supabase
              .from("wallets").select("balance").eq("user_id", userId).single();
            await supabase
              .from("wallets")
              .update({
                balance: Number(wPF?.balance ?? 0) + Number(totalCost ?? 0),
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
          } catch (e) {
            console.error(
              `[compose-dialog-segments] scene=${sceneId} v153 preflight refund failed: ${(e as Error)?.message}`,
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
              cost_credits: Number((existing as any)?.cost_credits ?? totalCost),
              refunded: true,
              error: reason,
              finished_at: new Date().toISOString(),
            },
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error: (() => {
              if (speakers.length === 1) {
                return "Lip-Sync abgebrochen: für den Sprecher konnte kein eindeutiges Gesicht in der Szene gefunden werden. " +
                  "Credits wurden zurückerstattet. Bitte die Szene neu rendern, sodass der Sprecher frontal und unverdeckt sichtbar ist.";
              }
              // v183 — Sprecher-Namen einsetzen wenn Dup-Kollision.
              if (dupeIdx.length >= 1) {
                const primaryIdx = boxes.find((_, a) =>
                  boxes.some((__, c) =>
                    c > a &&
                    Math.hypot(
                      (boxes[a].b[0] + boxes[a].b[2]) / 2 - (boxes[c].b[0] + boxes[c].b[2]) / 2,
                      (boxes[a].b[1] + boxes[a].b[3]) / 2 - (boxes[c].b[1] + boxes[c].b[3]) / 2,
                    ) < 8,
                  ),
                )?.i ?? dupeIdx[0];
                const nameA =
                  (speakers[primaryIdx] as any)?.speaker_name ??
                  speakers[primaryIdx]?.speaker ??
                  `Speaker ${primaryIdx + 1}`;
                const nameB =
                  (speakers[dupeIdx[0]] as any)?.speaker_name ??
                  speakers[dupeIdx[0]]?.speaker ??
                  `Speaker ${dupeIdx[0] + 1}`;
                return `Lip-Sync abgebrochen: ${nameA} und ${nameB} wurden auf dasselbe Gesicht in der Szene gemappt. ` +
                  `Bitte prüfen, ob im Cast identische Basis-Charaktere oder Saved-Outfit-Look-Varianten desselben Chars mehrfach vertreten sind — ` +
                  `oder die Szene neu rendern, sodass alle Sprecher visuell klar getrennt und frontal sichtbar sind. Credits wurden zurückerstattet.`;
              }
              if (missingBoxIdx.length >= 1) {
                const names = missingBoxIdx.map(
                  (i) =>
                    (speakers[i] as any)?.speaker_name ??
                    speakers[i]?.speaker ??
                    `Speaker ${i + 1}`,
                );
                return `Lip-Sync abgebrochen: für ${names.join(", ")} konnte kein eindeutiges Gesicht in der Szene gefunden werden. ` +
                  `Credits wurden zurückerstattet. Bitte die Szene neu rendern, sodass alle Sprecher frontal und unverdeckt sichtbar sind.`;
              }
              return "Lip-Sync abgebrochen: die einzelnen Sprecher konnten auf dem Video nicht eindeutig unterschieden werden " +
                "(jeder Sprecher braucht ein klar getrenntes Gesicht in der Szene). " +
                "Credits wurden zurückerstattet. Bitte die Szene neu rendern, sodass alle Sprecher frontal und getrennt sichtbar sind.";
            })(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_status: "PREFLIGHT_BLOCKED", error_class: "v153_preflight_block",
          error_message: reason,
          meta: {
            speakers: speakers.length,
              plate_dims_missing: plateDimsMissing,
              plate_hydration_source: plateHydrationSource,
            missing_box_idx: missingBoxIdx,
            duplicate_box_idx: dupeIdx,
            plate_identity_resolved: plateIdentityMap?.resolvedCount ?? 0,
            plate_identity_faces: plateIdentityMap?.faces?.length ?? 0,
            refunded_credits: alreadyRefundedPF ? 0 : totalCost,
          },
        });
        return json(
          {
            error: "v153_preflight_block",
            reason,
            refunded: alreadyRefundedPF ? 0 : totalCost,
          },
          422,
        );
      }
    }



    // ── v133 — Identity-Ambiguity Hard-Fail (3+ speakers) ───────────────
    // Per-character probe + Hungarian assignment runs inside
    // resolvePlateFaceIdentities for N≥3. If the resulting mapping is
    // ambiguous (min-confidence < 0.55 OR margin < 0.15) AND the cross-
    // check Gemini call could neither confirm nor pinpoint a single swap,
    // refuse to dispatch — the alternative is a voice-swap (e.g. char 1
    // speaks with char 4's voice). Refund and surface a clear message.
    if (
      !isAdvance &&
      !isRetry &&
      speakers.length >= 3 &&
      plateIdentityMap &&
      (plateIdentityMap as any).ambiguous === true
    ) {
      const minConf = Number((plateIdentityMap as any).minConfidence ?? 0);
      const minMar = Number((plateIdentityMap as any).minMargin ?? 0);
      const method = String((plateIdentityMap as any).identityMethod ?? "unknown");
      const xc = String((plateIdentityMap as any).crossCheck ?? "skipped");
      console.error(
        `[compose-dialog-segments] scene=${sceneId} v133_identity_ambiguous method=${method} minConf=${minConf.toFixed(2)} minMargin=${minMar.toFixed(2)} crossCheck=${xc} — refunding ${totalCost} credits`,
      );
      await failLipSync({
        supabase,
        sceneId,
        reason: "identity_ambiguous_multi_speaker",
        userId,
        refundCredits: totalCost,
        syncApiKey,
      });
      const userMsg =
        `Lip-Sync wurde nicht gestartet: Die Charaktere auf dem gerenderten Scene-Clip ` +
        `sind nicht eindeutig voneinander unterscheidbar (Identitäts-Confidence ${(minConf * 100).toFixed(0)}%, Margin ${(minMar * 100).toFixed(0)}%). ` +
        `Eine automatische Zuweisung birgt das Risiko, dass Stimmen vertauscht werden. ` +
        `Bitte die Szene neu rendern — mit deutlich unterschiedlichen Posen, Kleidung oder Kamera-Winkeln pro Charakter, sodass jede Person klar identifizierbar ist. ` +
        `Credits wurden vollständig zurückerstattet.`;
      try {
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: {
              version: 5,
              engine: "sync-segments",
              status: "failed",
              cost_credits: 0,
              refunded: true,
              error: `v133_identity_ambiguous:method=${method},minConf=${minConf.toFixed(2)},minMargin=${minMar.toFixed(2)},crossCheck=${xc}`,
              v133_identity_audit: {
                method,
                minConfidence: minConf,
                minMargin: minMar,
                crossCheck: xc,
                resolvedCount: plateIdentityMap.resolvedCount,
                faces: plateIdentityMap.faces.length,
                scoreMatrix: (plateIdentityMap as any).scoreMatrix ?? null,
              },
              finished_at: new Date().toISOString(),
            },
            lip_sync_status: "failed",
            twoshot_stage: "needs_clip_rerender",
            clip_status: "pending",
            clip_url: null,
            lip_sync_source_clip_url: null,
            clip_error: userMsg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
      } catch (_) { /* best-effort */ }
      try {
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          user_id: userId,
          engine: "sync-segments",
          sync_status: "PREFLIGHT_BLOCKED",
          error_class: "v133_identity_ambiguous",
          error_message: `method=${method} minConf=${minConf} minMargin=${minMar} crossCheck=${xc}`,
          meta: {
            speakers: speakers.length,
            plate_dims: plateDims,
            plate_url: sourceClipUrl,
            refunded_credits: totalCost,
            identity_method: method,
            min_confidence: minConf,
            min_margin: minMar,
            cross_check: xc,
            score_matrix: (plateIdentityMap as any).scoreMatrix ?? null,
            note:
              "v133 Identity-Gate: per-character probe + Hungarian assignment returned ambiguous mapping; cross-check could not resolve. Refusing dispatch to prevent voice-swap.",
          },
        });
      } catch (_) { /* best-effort */ }
      return json(
        {
          error: "v133_identity_ambiguous",
          message: userMsg,
          identity_method: method,
          min_confidence: minConf,
          min_margin: minMar,
          cross_check: xc,
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
      //
      // v9 (Jun 19 2026) — Split-Screen-Detector: when N>=3 and detection
      // *did* find all faces but they're arranged in a perfect grid
      // (same y, equal x-spacing, identical box height) the plate is a
      // quad/triptych split-screen layout. Sync.so cannot lipsync isolated
      // panels — block before dispatch with a clear error.
      const detectSplitScreenLayout = (): string | null => {
        if (!plateDims || !plateIdentityMap?.faces || plateIdentityMap.faces.length < 3) return null;
        const faces = plateIdentityMap.faces as Array<{ bbox?: { x: number; y: number; width: number; height: number } }>;
        const boxes = faces.map((f) => f.bbox).filter((b): b is { x: number; y: number; width: number; height: number } => !!b);
        if (boxes.length < 3 || boxes.length !== faces.length) return null;
        const W = plateDims.width;
        const H = plateDims.height;
        const centers = boxes.map((b) => ({ cx: b.x + b.width / 2, cy: b.y + b.height / 2, h: b.height }));
        // Sort left-to-right by cx
        centers.sort((a, b) => a.cx - b.cx);
        const ys = centers.map((c) => c.cy);
        const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
        const ySpreadPct = Math.max(...ys.map((y) => Math.abs(y - yMean))) / H;
        // Equal x-spacing: gaps between consecutive centers within ±8% of mean gap
        const gaps: number[] = [];
        for (let i = 1; i < centers.length; i++) gaps.push(centers[i].cx - centers[i - 1].cx);
        const gapMean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const gapSpreadPct = gapMean > 0 ? Math.max(...gaps.map((g) => Math.abs(g - gapMean))) / gapMean : 1;
        // Identical box heights: ±10% of mean
        const hs = centers.map((c) => c.h);
        const hMean = hs.reduce((a, b) => a + b, 0) / hs.length;
        const hSpreadPct = hMean > 0 ? Math.max(...hs.map((h) => Math.abs(h - hMean))) / hMean : 1;
        if (ySpreadPct <= 0.05 && gapSpreadPct <= 0.08 && hSpreadPct <= 0.10) {
          return `split_screen_layout(faces=${centers.length}, y_spread=${(ySpreadPct * 100).toFixed(1)}%, gap_spread=${(gapSpreadPct * 100).toFixed(1)}%, h_spread=${(hSpreadPct * 100).toFixed(1)}%)`;
        }
        return null;
      };
      const splitScreenReason = detectSplitScreenLayout();
      const gateFails =
        !plateIdentityMap ||
        detectedFaces < speakers.length ||
        !!splitScreenReason;
      if (resolvedFaces < speakers.length && detectedFaces >= speakers.length && !splitScreenReason) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v117_plate_quality_gate_SOFT_WARN detected=${detectedFaces}/${speakers.length} resolved=${resolvedFaces}/${speakers.length} — dispatch proceeds with slot-order coords`,
        );
      }
      if (gateFails) {
        const reason = splitScreenReason
          ? splitScreenReason
          : !plateIdentityMap
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
            clip_error: splitScreenReason
              ? `Plate-Quality-Gate (v9): Der gerenderte Scene-Clip ist ein Split-Screen/Panel-Layout (${speakers.length} isolierte Einzel-Panels statt einer gemeinsamen Group-Composition). Sync.so kann Einzel-Panels nicht lipsyncen. Bitte die Szene neu rendern — alle ${speakers.length} Personen müssen im selben Raum stehen, in einem durchgehenden Kamera-Frame. Credits wurden zurückerstattet.`
              : `Plate-Quality-Gate (v117): Auf dem aktuellen Scene-Clip sind nicht alle ${speakers.length} Charaktere als Gesichter erkennbar (erkannt: ${detectedFaces} von ${speakers.length}). Sync.so kann fehlende Personen nicht animieren. Bitte die Szene neu rendern — alle ${speakers.length} Personen müssen frontal sichtbar im Bild sein, keine angeschnittenen Köpfe. Credits wurden zurückerstattet.`,
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


    // ── v132 — Turn-Visibility Pre-Gate (root-cause fix) ──────────────────
    // BEFORE rendering any per-pass preclip (3 × Lambda, ~3 min each) and
    // BEFORE dispatching to Sync.so, validate that every speaker is actually
    // visible AT THEIR OWN TURN TIMESTAMP on the plate. The historical
    // failure mode this catches: pass 1–3 render fine, then pass 4's preclip
    // returns `face_gate_failed:count=0 (after 2 v116 repair attempts)` →
    // the entire scene fails with `v107_preclip_required_for_multispeaker`
    // after wasting 10+ minutes of Lambda time and Watchdog ticks.
    //
    // We probe the plate at each speaker's turn-mid timestamp using
    // `validate-frame-face` (same Gemini Vision detector used downstream).
    // A speaker whose face is undetectable in their own turn frame will
    // also fail downstream; refunding now is cheaper for both the user
    // (no 10-min wait) and the platform (no 3-Lambda × 4-pass burn).
    //
    // Permissive on probe errors (validator returns ok:false): we never
    // block on a flaky vision model, only on confirmed faceCount===0.
    // First-attempt only; advance/retry skips the gate (already validated).
    const TURN_GATE_DISABLED =
      (Deno.env.get("FORCE_SKIP_TURN_VISIBILITY_GATE") ?? "").toLowerCase() === "true";
    if (
      !TURN_GATE_DISABLED &&
      !isAdvance &&
      !isRetry &&
      !isV41Retry &&
      speakers.length >= 2 &&
      plateDims &&
      sourceClipUrl
    ) {
      const FPS = 30;
      const failures: Array<{
        speaker: string;
        character_id: string | null;
        turn_sec: number;
        frame: number;
        face_count: number;
      }> = [];
      const probes: Array<{
        speaker: string;
        turn_sec: number;
        face_count: number | null;
        ok: boolean;
      }> = [];
      // v192 — Parallelisiert. Vorher: serielle for-Schleife über N Sprecher,
      // jede mit bis zu 5 Gemini-Vision-Probes (cold cache 1–5s each) →
      // ~4–20s Preflight-Overhead bei 4 Sprechern. Jetzt läuft der Gate pro
      // Sprecher parallel via Promise.all; die inneren Sample-Offset-Probes
      // bleiben seriell, weil sie via early-exit auf face_count>=1 optimieren.
      const speakerResults = await Promise.all(
        speakers.map(async (spRaw: any, i: number) => {
          const sp = spRaw as any;
          const turns = Array.isArray(sp?.voicedRange?.turns) ? sp.voicedRange.turns : [];
          if (turns.length === 0) return null;
          const t0 = turns[0];
          const startSec = Math.max(0, Number(t0?.startSec) || 0);
          const endSec = Math.max(startSec + 0.2, Number(t0?.endSec) || startSec + 0.5);
          const midSec = (startSec + endSec) / 2;
          const frameNum = Math.max(1, Math.round(midSec * FPS));

          // v188 — Nearest-Window Snap (siehe Original-Kommentar): sample the
          // turn window at up to 5 timestamps (mid, ±25%, ±50% incl. ±0.5s
          // padding beyond turn edges). If ANY frame in the window shows ≥1
          // face, treat the turn as recoverable.
          const turnDur = Math.max(0.2, endSec - startSec);
          const padSec = 0.5;
          const sampleOffsets = [
            0,
            -turnDur * 0.25,
            +turnDur * 0.25,
            -(turnDur * 0.5 + padSec),
            +(turnDur * 0.5 + padSec),
          ];
          let bestFaceCount = 0;
          let bestSampleSec = midSec;
          let bestOk = false;
          let anyProbeSucceeded = false;
          const sampleTrail: Array<{ sec: number; frame: number; faces: number | null; ok: boolean }> = [];
          for (const off of sampleOffsets) {
            const sampleSec = Math.max(0, midSec + off);
            const sampleFrame = Math.max(1, Math.round(sampleSec * FPS));
            try {
              const v = await validateFrameFace({
                supabaseUrl,
                serviceKey,
                videoUrl: sourceClipUrl,
                frameNumber: sampleFrame,
                fps: FPS,
                targetCoords: null,
              });
              const faceCount = Number(v.faceCount ?? 0);
              sampleTrail.push({
                sec: Math.round(sampleSec * 100) / 100,
                frame: sampleFrame,
                faces: v.ok ? faceCount : null,
                ok: !!v.ok,
              });
              if (v.ok) {
                anyProbeSucceeded = true;
                if (faceCount > bestFaceCount) {
                  bestFaceCount = faceCount;
                  bestSampleSec = sampleSec;
                  bestOk = true;
                }
                if (faceCount >= 1) break;
              }
            } catch (e) {
              console.warn(
                `[compose-dialog-segments] scene=${sceneId} v188_snap probe threw speaker=${i} off=${off}: ${(e as Error)?.message}`,
              );
            }
          }

          return {
            i,
            sp,
            midSec,
            frameNum,
            bestFaceCount,
            bestSampleSec,
            bestOk,
            anyProbeSucceeded,
            sampleTrail,
          };
        }),
      );

      for (const res of speakerResults) {
        if (!res) continue;
        const { i, sp, midSec, frameNum, bestFaceCount, bestSampleSec, bestOk, anyProbeSucceeded, sampleTrail } = res;
        probes.push({
          speaker: String(sp?.speaker ?? `Speaker ${i + 1}`),
          turn_sec: Math.round(midSec * 100) / 100,
          face_count: bestOk ? bestFaceCount : null,
          ok: anyProbeSucceeded,
        });

        if (anyProbeSucceeded && bestFaceCount < 1) {
          failures.push({
            speaker: String(sp?.speaker ?? `Speaker ${i + 1}`),
            character_id: sp?.character_id ?? null,
            turn_sec: Math.round(midSec * 100) / 100,
            frame: frameNum,
            face_count: 0,
          });
        } else if (anyProbeSucceeded && bestFaceCount >= 1) {
          const snapOffsetMs = Math.round((bestSampleSec - midSec) * 1000);
          if (Math.abs(snapOffsetMs) > 5) {
            console.log(
              `[compose-dialog-segments] scene=${sceneId} v188_turn_visibility_snap speaker=${i} snapped_from=${midSec.toFixed(2)}s snapped_to=${bestSampleSec.toFixed(2)}s offset=${snapOffsetMs}ms faces=${bestFaceCount} trail=${JSON.stringify(sampleTrail)}`,
            );
          }
        }
      }
      if (failures.length > 0) {
        const detail = failures
          .map((f) => `${f.speaker}@${f.turn_sec}s(faces=${f.face_count})`)
          .join(", ");
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v132_turn_visibility_BLOCK ${detail} — refunding ${totalCost} credits and forcing plate re-render`,
        );
        // Refund wallet (debit happened at ~line 1024).
        const alreadyRefunded = !!(existing as any)?.refunded;
        if (!alreadyRefunded) {
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
              `[compose-dialog-segments] scene=${sceneId} v132 refund failed: ${(refundErr as Error)?.message}`,
            );
          }
        }
        const speakerList =
          failures.length === 1
            ? `Sprecher „${failures[0].speaker}" ist bei Sekunde ${failures[0].turn_sec} (Dialog-Turn) nicht im Bild`
            : `${failures.length} Sprecher sind während ihres Dialog-Turns nicht im Bild: ${failures.map((f) => `${f.speaker} @ ${f.turn_sec}s`).join(", ")}`;
        const userMsg =
          `Lip-Sync wurde nicht gestartet: ${speakerList}. ` +
          `Sync.so kann ein Gesicht nur animieren, wenn es in genau diesem Moment sichtbar ist. ` +
          `Bitte die Szene neu rendern — alle Sprecher müssen während ihres Dialog-Turns frontal und unverdeckt im Bild sein (keine Kameraschwenks weg, keine Cuts, keine angeschnittenen Köpfe). ` +
          `Credits wurden vollständig zurückerstattet.`;
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
              error: `v132_turn_visibility:${detail}`,
              v132_turn_gate: { failures, probes },
              finished_at: new Date().toISOString(),
            },
            lip_sync_status: "failed",
            twoshot_stage: "needs_clip_rerender",
            clip_status: "pending",
            clip_url: null,
            lip_sync_source_clip_url: null,
            clip_error: userMsg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
        try {
          await logSyncDispatch(supabase, {
            scene_id: sceneId,
            user_id: userId,
            engine: "sync-segments",
            sync_status: "PREFLIGHT_BLOCKED",
            error_class: "v132_turn_visibility",
            error_message: detail,
            meta: {
              failures,
              probes,
              speakers: speakers.length,
              plate_dims: plateDims,
              plate_url: sourceClipUrl,
              refunded_credits: totalCost,
              note:
                "Turn-Visibility-Gate: speaker not detectable at their own dialog turn frame on the plate. Re-render required.",
            },
          });
        } catch (_) {
          /* best-effort */
        }
        return json(
          {
            error: "v132_turn_visibility",
            message: userMsg,
            failures,
            probes,
            refunded: alreadyRefunded ? 0 : totalCost,
          },
          422,
        );
      }
      if (probes.length > 0) {
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v132_turn_visibility OK probes=${JSON.stringify(probes)}`,
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
        // v137 — per-pass mapping forensics. Surface what the
        // speaker→face resolver decided so the cockpit can show why
        // a given pass got those coordinates without joining
        // syncso_dispatch_log.
        v137_mapping: {
          coord_source: coordSources[originalIdx] ?? "unknown",
          plate_bbox: speakerPlateBboxes[originalIdx] ?? null,
            plate_mouth: speakerPlateMouths[originalIdx] ?? null,
          plate_face_count: plateIdentityMap?.faces?.length ?? null,
          plate_identity_resolved: plateIdentityMap?.resolvedCount ?? null,
          plate_identity_method: (plateIdentityMap as any)?.identityMethod ?? null,
          plate_identity_min_conf: (plateIdentityMap as any)?.minConfidence ?? null,
          plate_identity_min_margin: (plateIdentityMap as any)?.minMargin ?? null,
          plate_dims: plateDims ?? null,
        },
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

    // ── v194 Silent-Speaker-Pass fan-out ────────────────────────────────
    // For each listener speaker (M ≥ 2), append one "silent stabilizer"
    // pass that dispatches Sync.so with a deterministic silence WAV against
    // that listener's own bbox. The Sync.so output lipsyncs a CLOSED mouth
    // that follows head motion → composites over the plate ONLY during
    // OTHER speakers' turn windows (segments = complement of this
    // listener's own turns). Result: no ghost faces, no freeze patches, no
    // static-plate look — background and all faces stay alive, only the
    // mouths of non-speakers are stilled by the same lipsync engine that
    // moves the active speaker's mouth.
    //
    // Hard constraint: every stabilizer pass uses `bounding_boxes_url`
    // (bbox-only, no `auto_detect`), same code path as active passes.
    try {
      const { data: v194Row } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "composer.silent_speaker_pass_v194")
        .maybeSingle();
      const rawV194 = (v194Row as any)?.value;
      const v194Enabled = rawV194 === true || rawV194 === "true" || String(rawV194).toLowerCase() === "true";

      // Collect unique speaker indices that appear as an active pass.
      const activeSpeakerIdxs = Array.from(
        new Set(builtPasses.map((p) => Number(p.speaker_idx))),
      ).filter((i) => Number.isFinite(i));

      if (v194Enabled && activeSpeakerIdxs.length >= 2) {
        // Fetch a scene-length silence track. Deterministic per duration →
        // idempotent across retries and other scenes of the same length.
        let silenceUrl: string | null = null;
        try {
          const silResp = await fetch(
            `${supabaseUrl}/functions/v1/generate-silence-track`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ duration_sec: Math.max(0.5, Math.min(60, totalSec + 0.2)) }),
            },
          );
          if (silResp.ok) {
            const j = await silResp.json();
            silenceUrl = typeof j?.url === "string" ? j.url : null;
          }
        } catch (silErr) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v194_silence_track_fetch_failed: ${(silErr as Error)?.message ?? silErr}`,
          );
        }

        if (!silenceUrl) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v194_silent_speaker_pass_SKIPPED reason=no_silence_url speakers=${activeSpeakerIdxs.length}`,
          );
        } else {
          // For each listener, its silent-stabilizer covers all turns
          // where SOMEONE ELSE is speaking (union of other-speaker
          // segments). Turns where the listener speaks are excluded
          // (their active-pass overlay wins in those windows anyway).
          const stabilizers: PassState[] = [];
          for (const listenerIdx of activeSpeakerIdxs) {
            const bbox = (speakerPlateBboxes as any)?.[listenerIdx] ?? null;
            const coord = speakerCoords[listenerIdx];
            const bboxOk =
              Array.isArray(bbox) &&
              bbox.length === 4 &&
              bbox.every((n: number) => Number.isFinite(Number(n)));
            const coordOk =
              Array.isArray(coord) &&
              coord.length === 2 &&
              Number.isFinite(Number(coord[0])) &&
              Number.isFinite(Number(coord[1]));
            if (!bboxOk || !coordOk) {
              console.warn(
                `[compose-dialog-segments] scene=${sceneId} v194_stabilizer_SKIP listener=${listenerIdx} reason=no_bbox_or_coord — that listener will fall back to raw plate motion`,
              );
              continue;
            }
            const otherSegs: SegmentItem[] = builtPasses
              .filter((p) => Number(p.speaker_idx) !== listenerIdx)
              .flatMap((p) => (Array.isArray(p.segments) ? p.segments : []))
              .map((s) => ({
                startTime: Number(s.startTime),
                endTime: Number(s.endTime),
                speakerIdx: listenerIdx,
                speakerName: `stabilizer_${listenerIdx}`,
                refId: "silence",
              }))
              .filter((s) => Number.isFinite(s.startTime) && Number.isFinite(s.endTime) && s.endTime > s.startTime);
            if (otherSegs.length === 0) continue;
            const listenerSpeaker = speakers[listenerIdx] as any;
            stabilizers.push({
              idx: builtPasses.length + stabilizers.length,
              speaker_idx: listenerIdx,
              character_id: listenerSpeaker?.character_id ?? null,
              speaker_name: `stabilizer_${listenerSpeaker?.speaker ?? listenerIdx}`,
              audio_url: silenceUrl,
              coords: [Number(coord[0]), Number(coord[1])] as [number, number],
              segments: otherSegs,
              input_url: "",
              status: "pending",
              v137_mapping: {
                coord_source: `v194_stabilizer_${(coordSources as any)?.[listenerIdx] ?? "unknown"}`,
                plate_bbox: bbox,
                plate_mouth: (speakerPlateMouths as any)?.[listenerIdx] ?? null,
                plate_face_count: plateIdentityMap?.faces?.length ?? null,
                plate_identity_resolved: plateIdentityMap?.resolvedCount ?? null,
                plate_identity_method: (plateIdentityMap as any)?.identityMethod ?? null,
                plate_identity_min_conf: (plateIdentityMap as any)?.minConfidence ?? null,
                plate_identity_min_margin: (plateIdentityMap as any)?.minMargin ?? null,
                plate_dims: plateDims ?? null,
              },
              // v194 markers — read by SILENT_AUDIO_GATE bypass and by the
              // mux logger. Non-charging, non-refunding.
              is_silent_stabilizer: true,
              silent_for_turn_of_pass_idx: null,
              stabilizer_pass: true,
            } as unknown as PassState);
          }
          if (stabilizers.length > 0) {
            builtPasses.push(...stabilizers);
            console.log(
              `[compose-dialog-segments] scene=${sceneId} v194_silent_speaker_pass_INJECTED active=${activeSpeakerIdxs.length} stabilizers=${stabilizers.length} total_passes=${builtPasses.length} silence_url=${silenceUrl.slice(0, 80)}`,
            );
          } else {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} v194_silent_speaker_pass_NO_STABILIZERS speakers=${activeSpeakerIdxs.length} (all listeners lacked bbox/coord)`,
            );
          }
        }
      } else if (v194Enabled) {
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v194_silent_speaker_pass_SKIPPED reason=single_speaker speakers=${activeSpeakerIdxs.length}`,
        );
      }
    } catch (v194Err) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v194_silent_speaker_pass_ERROR ${(v194Err as Error)?.message ?? v194Err} — falling back to plain active-only passes`,
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
              // v167 speedup #3 — was 8_000ms; 2s is enough for Storage propagation
              // and saves 6s per transient audio-preflight self-retry. Single-shot,
              // not a loop — Folge-Fail führt sauber in den Hard-Fail-Pfad mit Refund.
              await new Promise((r) => setTimeout(r, 2_000));
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
          // v139 — Defer the log emission. v119 may demote this to SOFT_WARN
          // below when plate-identity is authoritative. Logging "BLOCK" here
          // first and then "SOFT_WARN proceed" later confused forensics on
          // scene b1ee2ede… The single, truthful log is emitted after the
          // v119 decision below.
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
          `[compose-dialog-segments] scene=${sceneId} v139_face_gate_SOFT_WARN strict_blocks=${blockedNames.join(",")} plate_identity_resolved=${plateIdentityMap?.resolvedCount}/${speakers.length} — proceeding with plate-identity coords + bbox-url dispatch`,
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
        // v139 — only NOW emit the hard BLOCK log; v119 did not demote.
        const { reason: blockReason } = firstReject;
        console.error(
          `[compose-dialog-segments] scene=${sceneId} FACE-GATE BLOCK (hard) pass=${firstReject.pass.idx} speaker=${firstReject.pass.speaker_name} reason=${blockReason}`,
        );
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
        console.warn(`[compose-dialog-segments] scene=${sceneId} v170_advance_missing_slot idx=${currentPassIdx} have=${passes.length} total_passes=${(prevState as any)?.total_passes ?? "?"} — sibling skeleton was never seeded`);
        try {
          await logSyncDispatch(supabase, {
            scene_id: sceneId, user_id: userId, engine: "sync-segments",
            sync_status: "ADVANCE_MISSING_SLOT",
            error_class: "pass_skeleton_missing",
            error_message: `advance pass_idx=${currentPassIdx} but passes.length=${passes.length}`,
            meta: { pass_idx: currentPassIdx, have: passes.length, total_passes: (prevState as any)?.total_passes ?? null },
          });
        } catch { /* best-effort */ }
        return json({ ok: true, skipped: "no_pass_at_cursor", pass_idx: currentPassIdx, have: passes.length }, 200);
      }
      const candidatePass: any = passes[currentPassIdx];
      const candidateStatus = String(candidatePass?.status ?? "");
      const candidateHasJob = typeof candidatePass?.job_id === "string" && candidatePass.job_id.length > 0;
      const candidatePreflightStarted = candidatePass?.preflight_started_at
        ? Date.parse(String(candidatePass.preflight_started_at))
        : NaN;
      const candidatePreflightFresh = Number.isFinite(candidatePreflightStarted)
        ? Date.now() - candidatePreflightStarted < 10 * 60_000
        : true;
      if (
        candidateStatus === "done" ||
        (candidateStatus === "rendering" && candidateHasJob) ||
        (candidateStatus === "rendering_preflight" && candidatePreflightFresh)
      ) {
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
        // v139 (Fix C7) — Scope the refresh to ONLY the pass we are about
        // to dispatch. Previously this loop touched every sibling pass and
        // nulled their already-rendered preclips on every advance — see
        // forensic report scene b1ee2ede… 09:08:50 where Matthew/Kailee/
        // Sarah preclips were invalidated mid-flight although `source` was
        // already `identity`. A sibling pass's coords are refreshed in its
        // own dispatch turn; there is no need to mutate them here.
        if (p.idx !== currentPassIdx) continue;
        const freshCoord = speakerCoords[idx];
        const freshSource = coordSources[idx] ?? "none";
        if (!freshCoord) continue;
        if (freshSource === "heuristic" || freshSource === "none") continue;
        const oldCoord = Array.isArray(p.coords) ? [p.coords[0], p.coords[1]] : null;
        // v139 (Fix C7) — Raise the change threshold from sub-pixel (round)
        // to 8 px Manhattan. Sub-pixel drift from a re-probed identity map
        // was triggering full preclip re-renders for no visible gain.
        const dx = oldCoord ? Math.abs(Number(oldCoord[0]) - Number(freshCoord[0])) : Infinity;
        const dy = oldCoord ? Math.abs(Number(oldCoord[1]) - Number(freshCoord[1])) : Infinity;
        const changed = !oldCoord || dx > 8 || dy > 8;
        if (changed) {
          // v128 — Alpha-Plan v3.1 §1.8: terminal coord-refresh guard.
          // v134 §2 — Exception: if THIS pass is currently in an active
          // NOOP-retry cycle (status was reset to pending by sync-so-webhook
          // and a fresh noop_retry_attempt_id was issued), then the pass
          // is no longer terminal — it's just been re-opened for the
          // explicit purpose of changing the input vector. Block the
          // refresh only for truly terminal (done/failed without an active
          // retry) passes, where flipping coords would silently mutate
          // a finished result.
          const isTerminal = p.status === "done" || p.status === "failed";
          const inActiveNoopRetry =
            !!(p as any).noop_retry_attempt_id &&
            Number((p as any).noop_escalation_step ?? 0) > 0 &&
            p.status === "pending";
          if (isTerminal && !inActiveNoopRetry) {
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
          if (inActiveNoopRetry) {
            console.log(
              `[compose-dialog-segments] scene=${sceneId} v134 COORD-REFRESH-ALLOWED (active NOOP retry) ` +
              `pass=${p.idx} speaker=${p.speaker_name} step=${(p as any).noop_escalation_step} old=${JSON.stringify(oldCoord)} new=${JSON.stringify([freshCoord[0], freshCoord[1]])}`,
            );
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

    // ── v193 — Pass-level dedupe/claim before expensive preflight ────────
    // The Plan-D fanout and webhook advance can race when a sibling pass is
    // still rendering its preclip and has no provider job_id yet. Persist a
    // lightweight `rendering_preflight` claim before Lambda/Sync.so work; any
    // second invocation for the same pass now short-circuits instead of
    // dispatching a duplicate provider job.
    {
      const { data: freshClaimRow } = await supabase
        .from("composer_scenes")
        .select("dialog_shots")
        .eq("id", sceneId)
        .maybeSingle();
      const freshClaimState: any = (freshClaimRow as any)?.dialog_shots ?? null;
      const freshClaimPasses: any[] = Array.isArray(freshClaimState?.passes) ? freshClaimState.passes : [];
      const livePass = freshClaimPasses[currentPassIdx] ?? null;
      const liveStatus = String(livePass?.status ?? "");
      const liveHasJob = typeof livePass?.job_id === "string" && livePass.job_id.length > 0;
      const preflightStartedMs = livePass?.preflight_started_at
        ? Date.parse(String(livePass.preflight_started_at))
        : NaN;
      const preflightAgeMs = Number.isFinite(preflightStartedMs)
        ? Date.now() - preflightStartedMs
        : Number.POSITIVE_INFINITY;
      const freshUserRetry = body?.user_retry_flag === true || body?.noop_auto_escalation === true;
      const duplicateActivePass =
        !freshUserRetry &&
        (
          liveStatus === "done" ||
          (liveStatus === "rendering" && liveHasJob) ||
          (liveStatus === "rendering_preflight" && preflightAgeMs < 10 * 60_000)
        );
      if (duplicateActivePass) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v193_pass_claim_skip_existing status=${liveStatus} job=${livePass?.job_id ?? "none"} age_ms=${Number.isFinite(preflightAgeMs) ? Math.round(preflightAgeMs) : "n/a"}`,
        );
        try {
          await logSyncDispatch(supabase, {
            scene_id: sceneId,
            user_id: userId,
            engine: "sync-segments",
            sync_status: "PASS_DEDUPE_SKIPPED",
            error_class: "v193_pass_already_active",
            meta: {
              compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
              pass_idx: currentPassIdx,
              live_status: liveStatus,
              live_job_id: livePass?.job_id ?? null,
              preflight_age_ms: Number.isFinite(preflightAgeMs) ? Math.round(preflightAgeMs) : null,
              is_advance: isAdvance,
              is_retry: isRetry,
            },
          });
        } catch { /* best-effort */ }
        return json({ ok: true, skipped: "v193_pass_already_active", pass_idx: currentPassIdx, status: liveStatus }, 202);
      }
      try {
        await supabase.rpc("update_dialog_pass_slot", {
          _scene_id: sceneId,
          _pass_idx: currentPassIdx,
          _patch: {
            status: "rendering_preflight",
            preflight_started_at: new Date().toISOString(),
            preflight_claim_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
          },
        });
      } catch (claimErr) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v193_pass_claim_failed: ${(claimErr as Error)?.message ?? claimErr}`,
        );
      }
      (pass as any).preflight_started_at = new Date().toISOString();
      pass.status = "rendering_preflight";
    }

    // ── v193 — Batch preclip all sibling passes immediately ──────────────
    // v192 only prefetched passes beyond the Sync.so concurrency cap. With cap=4
    // that meant no prefetch at all for normal 4-speaker scenes; each fanout
    // invocation still spent ~60–120s rendering its own preclip. Start sibling
    // preclips as a background task as soon as pass 0 has claimed the scene,
    // while pass 0 continues its own preclip + Sync.so dispatch.
    if (false && !isAdvance && !isRetry && currentPassIdx === 0 && passes.length > 1 && plateDims && sourceClipUrl) {
      let batchPreclipEnabled = true;
      try {
        const { data: batchFlag } = await supabase
          .from("system_config")
          .select("value")
          .eq("key", "composer.batch_preclip_render")
          .maybeSingle();
        const raw = (batchFlag as any)?.value;
        if (raw !== undefined && raw !== null) {
          batchPreclipEnabled = String(raw).toLowerCase() !== "false";
        }
      } catch {
        batchPreclipEnabled = true;
      }

      if (batchPreclipEnabled) {
        const siblingIdxs = passes
          .map((p, i) => ({ p, i }))
          .filter(({ p, i }) =>
            i > 0 &&
            !(p as any)?.preclip_url &&
            Array.isArray(p?.coords) &&
            Number.isFinite(Number(p.coords?.[0])) &&
            Number.isFinite(Number(p.coords?.[1])) &&
            Array.isArray(p?.segments) &&
            p.segments.length > 0,
          )
          .map(({ i }) => i);

        if (siblingIdxs.length > 0) {
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v193_batch_preclip_all_start passes=${siblingIdxs.map((i) => i + 1).join(",")} total=${passes.length}`,
          );
          try {
            EdgeRuntime.waitUntil((async () => {
              const results = await Promise.allSettled(siblingIdxs.map(async (idx) => {
                const bp = passes[idx] as any;
                const bpWindows: Array<[number, number]> = (Array.isArray(bp.segments) ? bp.segments : [])
                  .map((s: any) => [Number(s.startTime), Number(s.endTime)] as [number, number])
                  .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s);
                if (bpWindows.length === 0) return { idx, status: "skip_no_windows" };
                const unionStart = Math.max(0, Math.min(...bpWindows.map(([s]) => s)));
                const unionEnd = Math.min(totalSec, Math.max(...bpWindows.map(([, e]) => e)));
                const siblingCoords: Array<[number, number]> = passes
                  .filter((other: any) => other?.speaker_idx !== bp.speaker_idx && Array.isArray(other?.coords))
                  .map((other: any) => [Number(other.coords[0]), Number(other.coords[1])] as [number, number])
                  .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
                const result = await renderPassFacePreclip(
                  supabase,
                  serviceKey,
                  supabaseUrl,
                  {
                    sceneId,
                    projectId: String((scene as any).project_id ?? ""),
                    userId,
                    passIdx: idx,
                    masterVideoUrl: sourceClipUrl,
                    srcWidth: plateDims.width,
                    srcHeight: plateDims.height,
                    coords: [Number(bp.coords[0]), Number(bp.coords[1])],
                    bbox: speakerPlateBboxes?.[bp.speaker_idx] ?? null,
                    mouth: speakerPlateMouths?.[bp.speaker_idx] ?? null,
                    siblingCoords: siblingCoords.length > 0 ? siblingCoords : null,
                    startSec: unionStart,
                    endSec: unionEnd,
                  },
                  300_000,
                );
                if (!result.ok || !result.preclipUrl || !result.crop) {
                  return { idx, status: "failed", error: result.error ?? "preclip_unknown" };
                }
                await supabase.rpc("update_dialog_pass_slot", {
                  _scene_id: sceneId,
                  _pass_idx: idx,
                  _patch: {
                    preclip_url: result.preclipUrl,
                    preclip_render_id: result.preclipRenderId ?? null,
                    preclip_crop: {
                      x: result.crop.x,
                      y: result.crop.y,
                      size: result.crop.size,
                      outputSize: result.crop.outputSize,
                    },
                    preclip_start_sec: Number(unionStart.toFixed(3)),
                    preclip_end_sec: Number(unionEnd.toFixed(3)),
                    preclip_fps: Number(result.fps ?? 30),
                    preclip_frame_count: Number.isFinite(Number(result.frameCount)) && Number(result.frameCount) > 0
                      ? Math.max(1, Math.round(Number(result.frameCount)))
                      : Math.max(1, Math.ceil((result.durationSec ?? Math.max(0.2, unionEnd - unionStart)) * Number(result.fps ?? 30))),
                    preclip_duration_sec: Number((result.durationSec ?? Math.max(0.2, unionEnd - unionStart)).toFixed(3)),
                    preclip_error: null,
                    preclip_prefetched_at: new Date().toISOString(),
                  },
                });
                return { idx, status: "ok" };
              }));
              const summary = results.map((r, n) => {
                const idx = siblingIdxs[n] + 1;
                return r.status === "fulfilled"
                  ? `${idx}:${(r.value as any).status}`
                  : `${idx}:threw`;
              });
              console.log(`[compose-dialog-segments] scene=${sceneId} v193_batch_preclip_all_done results=${summary.join(",")}`);
            })());
          } catch (err) {
            console.warn(`[compose-dialog-segments] scene=${sceneId} v193_batch_preclip_all_setup_failed: ${(err as Error)?.message ?? err}`);
          }
        }
      }
    }

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
      if (passes.length < 2 && (silentBboxFails ?? 0) >= 2) {
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

    // ── v148 — NOOP-Eskalation bypassed Rule 0 (Preclip-Auto-Detect) ─────
    // sync-so-webhook eskaliert NOOPs via v134-Ladder mit explizitem
    // Variant (bbox-url-pro → coords-pro-box). Wenn ein Preclip existiert,
    // greift jedoch Rule 0 (v131.2 auto_detect_unconditional_on_preclip) und
    // kollabiert den Dispatch wieder auf `auto_detect` — die exakt selbe
    // ASD-Shape, die gerade NOOP'd hat. Resultat: 2 identische Dispatches,
    // Ladder erschöpft, Hard-Fail.
    //
    // Fix: Bei einer NOOP-Eskalation mit deterministischem Variant droppen
    // wir den per-Pass Preclip lokal (analog v120), damit der Full-Plate
    // bbox-url-pro / coords-pro-box Pfad greift. Rule 0 wird so für genau
    // diesen eskalierten Pass übergangen, nicht generell.
    const v148NoopBypassEligible =
      body?.noop_auto_escalation === true &&
      (requestedRetryVariant === "bbox-url-pro" || requestedRetryVariant === "coords-pro-box") &&
      !!(pass as any).preclip_url;
    if (v148NoopBypassEligible) {
      (pass as any).preclip_url = null;
      (pass as any).preclip_render_id = null;
      (pass as any).preclip_crop = null;
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v148_noop_bypass_preclip step=${body?.noop_escalation_step ?? "?"} variant=${requestedRetryVariant} speaker=${pass.speaker_name ?? "?"} — dropping preclip to allow full-plate deterministic ASD`,
      );
    }

    // ── v153.1 — Single-Path bbox-url-pro Pipeline (N=1..4 einheitlich) ──
    // PRECLIP IS DEAD. Es gibt nur noch einen einzigen Dispatch-Pfad:
    // Full-Plate + `bounding_boxes_url` mit plate-nativer Box pro Sprecher.
    //
    // Aktivierung: jede frische (nicht-noop-escalation) Dispatch braucht
    //  - plateDims (sonst hat die Scene-Pre-Flight längst hart gefailt)
    //  - eine plate-native Box für DIESEN Sprecher — gilt einheitlich
    //    für N=1, 2, 3, 4 (kein synthetic-coords-Fallback mehr für N=1).
    //
    // Wenn das nicht erfüllt ist, hat die Scene-Pre-Flight (Z. ~1326)
    // bereits hart gefailt + refunded. Hier ist es daher ein simples Flag.
    const v153HasPlateBox =
      Array.isArray(speakerPlateBboxes?.[pass.speaker_idx]) &&
      (speakerPlateBboxes![pass.speaker_idx] as any[]).length === 4;
    // v201 — block the historical v153 env backdoor completely. Bounding boxes
    // remain canonical, but through the current per-pass bbox-url builder below
    // (preferably clip-space on a single-speaker preclip), never via the old
    // `_v153BboxPrimary` full-plate override toggled by FEATURE_V153_BBOX_PRIMARY.
    const v153UnifiedBboxEligible = false;
    if (!isRetry) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v201_legacy_v153_env_blocked speakers=${speakers.length} plate_box=${v153HasPlateBox} — canonical path is ID + sync-3 + bounding_boxes_url`,
      );
    }
    if (v153UnifiedBboxEligible) {
      (pass as any).preclip_url = null;
      (pass as any).preclip_render_id = null;
      (pass as any).preclip_crop = null;
      (pass as any).preclip_error = null;
      (pass as any)._v152BboxPrimary = true; // legacy flag name kept for downstream gates
      (pass as any)._v153BboxPrimary = true;
      // v181 — N=1 Depicted-Face Lock telemetry.
      // When a single-speaker scene has 2+ faces in the FULL plate (phone
      // screen, photo, mirror, background person), the bbox-url-pro path
      // already pins Sync.so to the cast speaker box. We surface a clear
      // log line so QA can verify the lock fired and so future regressions
      // are visible without re-reading source.
      const v181PlateFaceCount = Number(plateIdentityMap?.faces?.length ?? 0);
      const v181CastBox = speakerPlateBboxes?.[pass.speaker_idx] ?? null;
      if (speakers.length === 1 && v181PlateFaceCount >= 2) {
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v181_n1_depicted_face_lock ` +
          `plate_face_count=${v181PlateFaceCount} cast_box=${JSON.stringify(v181CastBox)} ` +
          `speaker=${pass.speaker_name ?? "?"} — forcing strict bbox-url-pro on cast face`,
        );
        (pass as any)._v181DepictedFaceLock = true;
      }
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v153.2_unified_bbox_primary speakers=${speakers.length} plate_box=yes resolved=${plateIdentityMap?.resolvedCount ?? "?"} speaker=${pass.speaker_name ?? "?"} plate_face_count=${v181PlateFaceCount} — bbox-url-pro SINGLE PATH (no preclip, no auto_detect, no synthetic)`,
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
    // v147 — bbox-url-pro als PRIMARY für Multi-Speaker (revives v82 Phase 2.1).
    // Empirie v146 Forensik Run 0b3dafc5: Hailuo-Plates sind sauber
    // (Sarah 32.6% frame-coverage, Mund sichtbar), aber Sync.so `auto_detect`
    // failt reproducibly mit `face_gate_failed:count=0` auf stilisierten
    // Multi-Face Plates. Deterministische `bounding_boxes_url` umgeht den
    // Sync.so-Detector komplett.
    //
    // v126 hatte bbox-url-pro deaktiviert wegen `provider_unknown_error`
    // (Szene cba18767). v147 löst das mit Pre-Dispatch-Validation der bbox-
    // URL (nonNullFrames >= 1) + sauberem Fallback auf `coords-pro` statt
    // blind dispatchen.
    //
    // Preclip-Path bleibt unverändert (Rule 0 → auto_detect auf der per-
    // Speaker single-face Crop ist sicher und well-understood). Nur der
    // Full-Plate Multi-Speaker Pfad bekommt bbox-url-pro.
    void v120ForcePreclip;
    // v201 — no env-controlled fallback. Fresh and retry dispatches use the
    // bbox branch so the wire ASD is always bounding_boxes_url / bounding_boxes.
    const v147BboxEligible =
      speakers.length >= 2 &&
      havePlateIdentityForDispatch &&
      !!plateDims &&
      !hasPassPreclipForDispatch;
    // v153 — Wenn der unified-bbox-Pfad aktiv ist, IMMER bbox-url-pro.
    // Kein Fallback auf coords-pro mehr im Live-Pfad.
    const v153Active = !!(pass as any)._v153BboxPrimary;
    const freshDefaultVariant: RetryVariant = "bbox-url-pro";
    const noopAutoEscalation = body?.noop_auto_escalation === true;
    let retryVariant: RetryVariant = isRetry
      ? ((requestedRetryVariant === "coords-pro-box" ? "coords-pro-box" : "bbox-url-pro") as RetryVariant)
      : freshDefaultVariant;
    // v204 — Multi-speaker rolled back to v169 preclip path. Retry variants
    // (coords-pro-box, sync3-coords, etc.) are honored again. The forbidden
    // legacy variants (auto-pro/auto-standard/coords-pro/coords-pro-lp2pro)
    // remain blocked further down for N>=2.
    // v153.2 — Bei aktivem unified-Pfad auch Advance/Retry auf bbox-url-pro zwingen.
    // Die NOOP-Ladder darf weiterhin explizite Diagnose-Varianten wählen.
    if (v153Active && !noopAutoEscalation) {
      retryVariant = "bbox-url-pro";
    }
    const isFreshBboxPrimary = !isRetry && freshDefaultVariant === "bbox-url-pro";
    if (
      !noopAutoEscalation &&
      !isFreshBboxPrimary &&
      !v153Active &&
      (retryVariant === "auto-pro" || retryVariant === "auto-standard" || retryVariant === "coords-pro" || retryVariant === "sync3-coords" || retryVariant === "coords-pro-lp2pro")
    ) {
      retryVariant = "bbox-url-pro";
    }
    if (noopAutoEscalation) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} v144_noop_escalation honoring variant=${retryVariant} step=${body?.noop_escalation_step ?? "?"}`,
      );
    }
    if (isFreshBboxPrimary) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v153_bbox_url_pro_primary speakers=${speakers.length} resolved=${plateIdentityMap?.resolvedCount ?? 0} plate_box=${(pass as any)._v153BboxPrimary ? "plate-native" : "facemap-fallback"}`,
      );
    }

    // v85 (Mini-Phase 2.5) — Structured gate-decision log so we can answer
    // "why didn't bbox-url-pro fire?" without re-reading the source. Emitted
    // ONLY on fresh dispatch (retries inherit the previous variant) and only
    // for multi-speaker scenes (N>=2 is the only place where the gate is
    // meaningful). Keep on one line for easy grep.
    if ((!isRetry || (body?.noop_auto_escalation === true)) && speakers.length >= 2) {
      const gateReason =
        body?.noop_auto_escalation === true && (retryVariant === "bbox-url-pro" || retryVariant === "coords-pro-box")
          ? `v148-noop-bypass-${retryVariant}`
          : freshDefaultVariant === "bbox-url-pro"
            ? "picked-bbox-url-pro"
            : !plateDims
              ? "fallback-no-plateDims"
              : !havePlateIdentityForDispatch
                ? `fallback-identity-unresolved(resolved=${plateIdentityMap?.resolvedCount ?? 0})`
                : hasPassPreclipForDispatch
                  ? "fallback-preclip-present"
                  : "fallback-unknown";
      console.log(
        `[v82-gate] scene=${sceneId} pass=${currentPassIdx + 1} speakers=${speakers.length} plateDims=${!!plateDims} resolved=${plateIdentityMap?.resolvedCount ?? 0} preclip=${hasPassPreclipForDispatch} noop_esc=${body?.noop_auto_escalation === true} → variant=${retryVariant} (${gateReason})`,
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
    // v175 — Tight-Slice für ALLE N≥1 (revert v169). Sync.so wirft reproduzierbar
    // `generation_unknown_error` wenn die per-Sprecher-WAV mehrheitlich trailing
    // silence enthält (siehe v64). v169 hatte das für N=1 abgeschaltet um
    // Tail-Talk zu fixen — Tail-Talk wird ab v175 stattdessen durch den
    // closed-mouth Plate-Prompt in compose-video-clips verhindert (v167 idle
    // mouth motion entfernt). Overlay-Mode N=1 ist in render-sync-segments-
    // audio-mux ebenfalls wieder aktiv.
    // v194 — Stabilizer passes carry a scene-length near-silence WAV. Tight-
    // slicing/re-uploading that per stabilizer is wasteful and would emit a
    // near-empty audio window that Sync.so has historically rejected. Keep
    // the full silence WAV → mux uses absolute timing on segments.
    const isStabilizerForTight = (pass as any).stabilizer_pass === true &&
      (pass as any).is_silent_stabilizer === true;
    const allowTightSlice = passes.length >= 1 && !isStabilizerForTight;
    if (allowTightSlice && speakerWindowsSecs.length > 0) {


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

    // ── v153.4 — Legacy Batch-Preclip vollständig entfernt ───────────────
    // Der `plan_b_B_batch_preclip_*` Pfad (Juni 2026) hat parallel zum v153
    // bbox-url-pro Pfad gerendert und dabei die ASD nach v153 überschrieben.
    // Phase A (v153.3) hat ihn gegated; Phase B.1 (v153.4) löscht ihn.
    // Der `composer.batch_preclip_render` system_config Key bleibt in der
    // DB liegen, wird aber nicht mehr gelesen.



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
    // ── v161 — Single-Face Preclip + bbox-url-pro (1..N einheitlich) ─────
    // Für JEDEN Pass (1 Sprecher oder 4 Sprecher) wird ein Single-Face
    // Square-Crop des aktiven Sprechers via Remotion Lambda gerendert und
    // an Sync.so geschickt. Dispatch bleibt `bbox-url-pro` mit einer in
    // den CLIP-Koordinatenraum transformierten plate-nativen Face-Box.
    // Mux (render-sync-segments-audio-mux) überlagert den lipsynced Crop
    // via `preclip_crop` zurück auf die Master-Plate. Damit gibt es kein
    // Full-Frame Morphen mehr auf Nachbargesichter, weder bei N=1 noch N=4.
    //
    // Idempotent: ein bereits gerenderter Preclip wird wiederverwendet.
    // Fail-Closed: wenn der Preclip nicht rendert UND keine Plate-Box
    // existiert, greift der v153.5 Hard-Fail unten (Refund + abort).
    // v204 — Preclip cache is honored again for N>=2 (rollback of v203's
    // drop-cached-preclip block). Renderers use idempotent preclips.
    let passPreclipUrl: string | null = ((pass as any).preclip_url ?? null);
    let usePassPreclip: boolean = !!passPreclipUrl && !!(pass as any).preclip_crop;

    const v161PreclipEligible =
      !usePassPreclip &&
      !!tightAudioInfo &&
      !!plateDims &&
      !!sourceClipUrl &&
      Array.isArray(pass.coords) &&
      Number.isFinite(Number(pass.coords?.[0])) &&
      Number.isFinite(Number(pass.coords?.[1])) &&
      Array.isArray(speakerWindowsSecs) && speakerWindowsSecs.length > 0 &&
      body?.noop_auto_escalation !== true;

    if (v161PreclipEligible) {
      const unionStart = Math.max(0, Math.min(...speakerWindowsSecs.map(([s]) => s)));
      const unionEnd = Math.min(totalSec, Math.max(...speakerWindowsSecs.map(([, e]) => e)));
      const siblingCoords: Array<[number, number]> = [];
      for (let i = 0; i < speakers.length; i++) {
        if (i === pass.speaker_idx) continue;
        const c = (speakers as any[])[i]?.coords;
        if (Array.isArray(c) && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))) {
          siblingCoords.push([Number(c[0]), Number(c[1])]);
        }
      }
      const platePassBoxForPreclip = speakerPlateBboxes?.[pass.speaker_idx] ?? null;
      console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_preclip_render START speaker=${pass.speaker_name} window=[${unionStart.toFixed(2)},${unionEnd.toFixed(2)}] speakers=${speakers.length} plate_box=${platePassBoxForPreclip ? "yes" : "no"} siblings=${siblingCoords.length}`,
      );
      try {
        const preclipResult = await renderPassFacePreclip(
          supabase,
          serviceKey,
          supabaseUrl,
          {
            sceneId,
            projectId: String((scene as any).project_id ?? ""),
            userId,
            passIdx: currentPassIdx,
            masterVideoUrl: sourceClipUrl,
            srcWidth: plateDims.width,
            srcHeight: plateDims.height,
            coords: [Number(pass.coords[0]), Number(pass.coords[1])],
            bbox: platePassBoxForPreclip,
            mouth: speakerPlateMouths?.[pass.speaker_idx] ?? null,
            siblingCoords: siblingCoords.length > 0 ? siblingCoords : null,
            startSec: unionStart,
            endSec: unionEnd,
          },
          300_000,
        );
        if (preclipResult.ok && preclipResult.preclipUrl && preclipResult.crop) {
          passPreclipUrl = preclipResult.preclipUrl;
          usePassPreclip = true;
          (pass as any).preclip_url = preclipResult.preclipUrl;
          (pass as any).preclip_render_id = preclipResult.preclipRenderId ?? null;
          (pass as any).preclip_crop = {
            x: preclipResult.crop.x,
            y: preclipResult.crop.y,
            size: preclipResult.crop.size,
            outputSize: preclipResult.crop.outputSize,
          };
          (pass as any).preclip_start_sec = Number(unionStart.toFixed(3));
          (pass as any).preclip_end_sec = Number(unionEnd.toFixed(3));
          // v163 — persist the exact Remotion render frame count. Sync.so
          // requires `bounding_boxes_url.bounding_boxes.length` to match the
          // dispatched video frames exactly; duration-derived `round(dur*fps)`
          // was off by one for short preclips.
          (pass as any).preclip_fps = Number(preclipResult.fps ?? 30);
          (pass as any).preclip_frame_count = Number.isFinite(Number(preclipResult.frameCount)) && Number(preclipResult.frameCount) > 0
            ? Math.max(1, Math.round(Number(preclipResult.frameCount)))
            : Math.max(1, Math.ceil((preclipResult.durationSec ?? Math.max(0.2, unionEnd - unionStart)) * Number(preclipResult.fps ?? 30)));
          (pass as any).preclip_duration_sec = Number(
            (preclipResult.durationSec ?? Math.max(0.2, unionEnd - unionStart)).toFixed(3),
          );
          (pass as any).preclip_error = null;
          console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_preclip_render OK url=…${passPreclipUrl.slice(-60)} crop=${JSON.stringify((pass as any).preclip_crop)} render_id=${preclipResult.preclipRenderId} frames=${(pass as any).preclip_frame_count} dur=${(pass as any).preclip_duration_sec} fps=${(pass as any).preclip_fps}`,
          );

        } else {
          (pass as any).preclip_error = preclipResult.error ?? "preclip_unknown";
          if (speakers.length >= 2) {
            const reason = `v187_preclip_required_no_fullplate_fallback: Preclip für „${pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`}" wurde nicht rechtzeitig fertig (${preclipResult.error ?? "preclip_unknown"}). Kein Full-Plate-Fallback, damit Sync.so nicht erneut generation_input_face_selection_invalid auslöst.`;
            console.error(
              `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v187_preclip_required_no_fullplate_fallback speaker=${pass.speaker_name ?? "?"} err=${preclipResult.error ?? "preclip_unknown"} class=${preclipResult.errorClass ?? "unknown"} window=[${unionStart.toFixed(2)},${unionEnd.toFixed(2)}] — refusing full-plate dispatch`,
            );
            await logSyncDispatch(supabase, {
              scene_id: sceneId,
              user_id: userId,
              engine: "sync-segments",
              sync_status: "PREFLIGHT_BLOCKED",
              error_class: "v187_preclip_required_no_fullplate_fallback",
              error_message: preclipResult.error ?? "preclip_unknown",
              meta: {
                compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
                pass_idx: currentPassIdx,
                speaker: pass.speaker_name ?? null,
                character_id: pass.character_id ?? null,
                preclip_error: preclipResult.error ?? null,
                preclip_error_class: preclipResult.errorClass ?? null,
                preclip_window_sec: [Number(unionStart.toFixed(3)), Number(unionEnd.toFixed(3))],
                speakers: speakers.length,
                full_plate_fallback_blocked: true,
                refunded_credits: Number(totalCost ?? 0),
              },
            });
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
                error: "v187_preclip_required_no_fullplate_fallback",
                reason,
                refunded: totalCost,
              },
              422,
            );
          }
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_preclip_render FAILED err=${preclipResult.error} class=${preclipResult.errorClass} — falling back to full-plate dispatch`,
          );
        }
      } catch (preclipErr) {
        (pass as any).preclip_error = (preclipErr as Error)?.message ?? String(preclipErr);
        if (speakers.length >= 2) {
          const preclipErrorMessage = (preclipErr as Error)?.message ?? String(preclipErr);
          const reason = `v187_preclip_required_no_fullplate_fallback: Preclip für „${pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`}" ist fehlgeschlagen (${preclipErrorMessage}). Kein Full-Plate-Fallback, damit Sync.so nicht erneut generation_input_face_selection_invalid auslöst.`;
          console.error(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v187_preclip_required_no_fullplate_fallback speaker=${pass.speaker_name ?? "?"} threw=${preclipErrorMessage} window=[${unionStart.toFixed(2)},${unionEnd.toFixed(2)}] — refusing full-plate dispatch`,
          );
          await logSyncDispatch(supabase, {
            scene_id: sceneId,
            user_id: userId,
            engine: "sync-segments",
            sync_status: "PREFLIGHT_BLOCKED",
            error_class: "v187_preclip_required_no_fullplate_fallback",
            error_message: preclipErrorMessage,
            meta: {
              compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
              pass_idx: currentPassIdx,
              speaker: pass.speaker_name ?? null,
              character_id: pass.character_id ?? null,
              preclip_error: preclipErrorMessage,
              preclip_error_class: "throw",
              preclip_window_sec: [Number(unionStart.toFixed(3)), Number(unionEnd.toFixed(3))],
              speakers: speakers.length,
              full_plate_fallback_blocked: true,
              refunded_credits: Number(totalCost ?? 0),
            },
          });
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
              error: "v187_preclip_required_no_fullplate_fallback",
              reason,
              refunded: totalCost,
            },
            422,
          );
        }
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_preclip_render THREW: ${(preclipErr as Error)?.message} — falling back to full-plate dispatch`,
        );
      }
    } else if (usePassPreclip) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_preclip_reuse cached url=…${(passPreclipUrl ?? "").slice(-60)} crop=${JSON.stringify((pass as any).preclip_crop)} frames=${(pass as any).preclip_frame_count ?? "?"}`,
      );
    }

    // v153.5 — Hard-Fail wenn Plate-Bbox fehlt (Ersatz für v107/v126).
    // v153 setzt `_v153BboxPrimary` nur wenn `speakerPlateBboxes[idx]`
    // valide ist. Fehlt der Plate-Bbox UND wir haben tightAudio + coords,
    // muss die Szene neu gerendert werden — kein Silent-Fallback.
    const v153BboxRequired = false;
    if (v153BboxRequired && !(pass as any)._v153BboxPrimary) {
      const failReason = "v153_plate_bbox_required";
      console.error(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v153.5_plate_bbox_required_BLOCK speakers=${speakers.length} resolved=${plateIdentityMap?.resolvedCount ?? 0} — refusing dispatch`,
      );
      const existingDsLocal: any = (scene as any)?.dialog_shots ?? existing ?? {};
      const alreadyRefunded = !!existingDsLocal?.refunded;
      if (!alreadyRefunded) {
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
          ? { ...p, status: "failed" as const, last_error: failReason, last_error_class: "v153_plate_bbox_required" }
          : p,
      );
      const failedSpeakerName = String(
        (pass as any)?.speaker_name ?? `Sprecher ${currentPassIdx + 1}`,
      );
      const passSegs0 = Array.isArray(pass.segments) ? pass.segments : [];
      const turnStartSec =
        passSegs0.length > 0 ? Number(passSegs0[0].startTime) : null;
      const turnEndSec =
        passSegs0.length > 0 ? Number(passSegs0[0].endTime) : null;
      const turnLabel =
        turnStartSec != null && turnEndSec != null
          ? ` (Dialog-Turn ${turnStartSec.toFixed(1)}s–${turnEndSec.toFixed(1)}s)`
          : "";
      const friendlyClipError =
        `Lip-Sync abgebrochen: „${failedSpeakerName}"${turnLabel} konnte im Scene-Clip nicht eindeutig zugeordnet werden ` +
        `(${failReason}). Bitte Szene neu rendern — alle Sprecher müssen während ihres Turns frontal und unverdeckt im Bild sein. ` +
        `Credits wurden zurückerstattet.`;
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
            refunded: !alreadyRefunded,
            error: `v153_plate_bbox_required_pass_${currentPassIdx + 1}`,
            v153_failed_speaker: {
              speaker: failedSpeakerName,
              character_id: (pass as any)?.character_id ?? null,
              pass_idx: currentPassIdx,
              turn_start_sec: turnStartSec,
              turn_end_sec: turnEndSec,
              resolved_count: plateIdentityMap?.resolvedCount ?? 0,
            },
            finished_at: new Date().toISOString(),
          },
          lip_sync_status: "failed",
          twoshot_stage: "needs_clip_rerender",
          clip_status: "pending",
          clip_url: null,
          lip_sync_source_clip_url: null,
          clip_error: friendlyClipError,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);

      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "PREFLIGHT_BLOCKED",
        error_class: "v153_plate_bbox_required",
        error_message: failReason,
        meta: {
          pass_idx: currentPassIdx,
          speakers: speakers.length,
          plate_dims: plateDims ?? null,
          resolved_count: plateIdentityMap?.resolvedCount ?? 0,
          have_tight_audio: !!tightAudioInfo,
          have_coords:
            Array.isArray(pass.coords) &&
            Number.isFinite(Number(pass.coords?.[0])) &&
            Number.isFinite(Number(pass.coords?.[1])),
        },
      });
      return json(
        {
          error: "v153_plate_bbox_required",
          reason: failReason,
          refunded: alreadyRefunded ? 0 : Number(totalCost ?? 0),
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
    // v160 — sync-3 doc-strict from construction: only send public-schema
    // options Sync.so accepts. The sanitizer remains as a safety net, but we
    // no longer create `temperature` / `occlusion_detection_enabled` and rely
    // on stripping them later.
    const syncOptions: Record<string, unknown> = {
      sync_mode: payloadSyncMode,
    };

    if (retryVariant === "coords-pro" || retryVariant === "sync3-coords" || retryVariant === "coords-pro-lp2pro") {

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

      // v153 — PRIMÄRE Quelle: plate-native box pro Sprecher
      // (aus resolvePlateFaceIdentities slot/identity fallback).
      // Garantiert distinkte Boxen pro Sprecher und behebt den
      // "Sprecher 1 spricht für Sprecher 1+2"-Bug, weil bisher der
      // faceMap-Match-Loop für mehrere Speaker auf derselben Box landen
      // konnte wenn characterId nicht gesetzt war.
      const platePassBox = speakerPlateBboxes?.[pass.speaker_idx] ?? null;
      const platePassMouth = speakerPlateMouths?.[pass.speaker_idx] ?? null;
      if (Array.isArray(platePassBox) && platePassBox.length === 4) {
        const [bx1, by1, bx2, by2] = platePassBox.map((n: any) => Number(n));
        if (Number.isFinite(bx1) && Number.isFinite(by1) && Number.isFinite(bx2) && Number.isFinite(by2)) {
          const w = Math.max(1, bx2 - bx1);
          const h = Math.max(1, by2 - by1);
          const aspectIn = h / w;
          // v160 — Sync.so `bounding_boxes(_url)` wants a real face detection
          // box. v159's mouth-centered mini box (0.14% area in production)
          // was below our own sanity floor and is not the API contract. Keep
          // the mouth landmark as the fail-closed identity anchor, but dispatch
          // the tight face/head bbox itself so sync-3 has enough facial context.
          const useMouth = Array.isArray(platePassMouth)
            && Number.isFinite(platePassMouth[0])
            && Number.isFinite(platePassMouth[1]);
          const multiSpeakerNoMouth = speakers.length >= 2 && !useMouth;
          if (multiSpeakerNoMouth) {
            console.error(
              `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v159_mouth_missing_multi_speaker ` +
              `speaker=${pass.speaker_name} hydration=${plateHydrationSource} bbox=${JSON.stringify(platePassBox)} — ` +
              `refusing to dispatch without mouth landmark (would morph)`,
            );
            // Hand off to v152 hard-fail path below: leave box=null so the
            // pre-dispatch gate refunds instead of sending a bad target.
          } else {
            const anchorX = useMouth ? platePassMouth![0] : Math.round((bx1 + bx2) / 2);
            const anchorY = useMouth ? platePassMouth![1] : Math.round(by1 + h * 0.66);
            const padX = Math.max(2, Math.round(w * 0.08));
            const padTop = Math.max(2, Math.round(h * 0.06));
            const padBottom = Math.max(2, Math.round(h * 0.04));
            const x1 = Math.max(0, Math.round(bx1 - padX));
            const y1 = Math.max(0, Math.round(by1 - padTop));
            const x2 = Math.min(dims.width, Math.round(bx2 + padX));
            const y2 = Math.min(dims.height, Math.round(by2 + padBottom));
            if (x2 > x1 + 4 && y2 > y1 + 4) {
              box = [x1, y1, x2, y2];
              bboxSource = useMouth ? "plate-native:v160-face-mouth-verified" : "plate-native:v160-face-single";
              const plateArea = Math.max(1, dims.width * dims.height);
              const boxArea = Math.max(0, (x2 - x1) * (y2 - y1));
              const areaPct = (boxArea / plateArea) * 100;
              console.log(
                `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v160_sync3_face_box ` +
                `speaker=${pass.speaker_name} mouth_used=${useMouth} hydration=${plateHydrationSource} ` +
                `aspect_in=${aspectIn.toFixed(2)} aspect_out=${((y2 - y1) / Math.max(1, x2 - x1)).toFixed(2)} ` +
                `area_pct=${areaPct.toFixed(2)} in=${JSON.stringify(platePassBox)} ` +
                `out=${JSON.stringify(box)} anchor=[${anchorX},${anchorY}] source=${bboxSource} ` +
                `speakers=${speakers.length}`,
              );
            }
          }
        }
      }


      // Sekundär: anchor faceMap (kann bei N=1 helfen oder wenn plate-native fehlt).
      if (!box && speakers.length < 2) {
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
      }

      // Letzter Notanker: synthetisch aus coords (nur N=1 erlaubt).
      // Für N>=2 würde das pro Sprecher auf identische Boxen mappen
      // wenn coords nicht plate-native sind — daher Hard-Fail unten.
      // v153.1 — Synthetic-Coords-Fallback ist GLOBAL deaktiviert (N=1..4).
      // Wenn weder plate-native noch facemap eine Box liefern, hat die
      // Pre-Flight (Z. ~1326) bereits hart gefailt + refunded. Hier kein
      // stiller Box-aus-coords-Mittelpunkt mehr — das hat in N=1 Szenen
      // dazu geführt, dass Sync.so im Zweifel die falsche Person animiert.
      if (!box && speakers.length < 2 && !(pass as any)._v153BboxPrimary) {
        const [cx, cy] = pass.coords ?? [Math.round(dims.width / 2), Math.round(dims.height / 2)];
        const boxW = Math.round(dims.width * 0.18);
        const boxH = Math.round(dims.height * 0.28);
        const x1 = Math.max(0, Math.round(cx - boxW / 2));
        const y1 = Math.max(0, Math.round(cy - boxH / 2));
        const x2 = Math.min(dims.width, Math.round(cx + boxW / 2));
        const y2 = Math.min(dims.height, Math.round(cy + boxH / 2));
        box = [x1, y1, x2, y2];
      }
      // v153.8 — Use ACTUAL plate frame count (probed from mp4 mvhd) instead
      // of the requested Hailuo duration. Sync.so rejects mismatched bbox
      // arrays with the opaque `generation_unknown_error`.
      // v161 — When a single-face preclip is in use, all bbox math runs in
      // CLIP space (not plate space). We probe the preclip's actual frame
      // count and shift voiced windows so they start at clip t=0.
      const v161PreclipCrop = usePassPreclip ? (pass as any).preclip_crop as
        | { x: number; y: number; size: number; outputSize: number }
        | undefined : undefined;
      const v161UsingPreclipForBbox = usePassPreclip && !!passPreclipUrl && !!v161PreclipCrop;
      // v204 — Preclip is the canonical multi-speaker path again. No hard-fail here.
      const probeUrlForBbox = v161UsingPreclipForBbox ? (passPreclipUrl as string) : passInputUrl;
      const v161PreclipStartSec = v161UsingPreclipForBbox
        ? Number((pass as any).preclip_start_sec ?? 0)
        : 0;

      // v163 — Frame count + fps MUST match the dispatched video exactly.
      // For preclips: use the exact Remotion `durationInFrames` captured by
      // renderPassFacePreclip. Only legacy cached preclips fall back to
      // ceil(duration*fps); never round, because it produced 73/28 bbox frames
      // for 74/29-frame preclips and Sync.so failed with generation_unknown_error.
      const dispatchFps = v161UsingPreclipForBbox
        ? Number((pass as any).preclip_fps ?? 30)
        : ASSUMED_FPS;
      const preclipPersistedFrameCount = v161UsingPreclipForBbox
        ? Math.round(Number((pass as any).preclip_frame_count ?? 0))
        : 0;
      const preclipPersistedDurSec = v161UsingPreclipForBbox
        ? Number((pass as any).preclip_duration_sec ?? 0)
        : 0;
      const __probedPlateDurSec = v161UsingPreclipForBbox && preclipPersistedDurSec > 0
        ? preclipPersistedDurSec
        : await getPlateDurationSecCached(probeUrlForBbox);
      const __probedFrames = __probedPlateDurSec
        ? Math.max(1, Math.ceil(__probedPlateDurSec * dispatchFps))
        : null;
      const frameCount = v161UsingPreclipForBbox && preclipPersistedFrameCount > 0
        ? preclipPersistedFrameCount
        : (__probedFrames ?? Math.max(1, Math.ceil(totalSec * dispatchFps)));
      const frameCountSource = v161UsingPreclipForBbox && preclipPersistedFrameCount > 0
        ? "preclip_frame_count"
        : (__probedFrames ? "ceil_probe_duration" : "ceil_total_duration");
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_bbox_framecount space=${v161UsingPreclipForBbox ? "clip" : "plate"} source=${frameCountSource} fps=${dispatchFps} preclip_frames=${preclipPersistedFrameCount || "?"} probe_dur=${__probedPlateDurSec ? __probedPlateDurSec.toFixed(3) : "?"} requested_total=${totalSec}s probed_frames=${__probedFrames ?? "?"} used=${frameCount}`,
      );
      if (v161UsingPreclipForBbox && frameCountSource === "ceil_total_duration") {
        (pass as any)._v152HardFail = {
          reason: "preclip_frame_count_unavailable",
          errorClass: "v163_preclip_frame_count_unavailable",
          message:
            `Lip-Sync für „${pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`}" wurde vor Sync.so abgebrochen: ` +
            "die exakte Preclip-Framezahl fehlt, daher kann keine sichere bounding_boxes_url erzeugt werden. Credits wurden zurückerstattet.",
          meta: {
            v163_exact_framecount_required: true,
            preclip_duration_sec: preclipPersistedDurSec || null,
            preclip_fps: dispatchFps,
            preclip_url_present: !!passPreclipUrl,
          },
        };
      }

      // Voiced windows in the dispatched video's time base.
      const v124VoicedWindows: Array<[number, number]> = v161UsingPreclipForBbox
        ? speakerWindowsSecs.map(([s, e]) => [
            Math.max(0, s - v161PreclipStartSec),
            Math.max(0, e - v161PreclipStartSec),
          ] as [number, number])
        : speakerWindowsSecs.slice();

      // Box in the dispatched video's pixel space.
      let dispatchBox: [number, number, number, number] | null = box;
      if (v161UsingPreclipForBbox && box && v161PreclipCrop) {
        const scale = v161PreclipCrop.outputSize / Math.max(1, v161PreclipCrop.size);
        const cx1 = Math.max(0, Math.round((box[0] - v161PreclipCrop.x) * scale));
        const cy1 = Math.max(0, Math.round((box[1] - v161PreclipCrop.y) * scale));
        const cx2 = Math.min(v161PreclipCrop.outputSize, Math.round((box[2] - v161PreclipCrop.x) * scale));
        const cy2 = Math.min(v161PreclipCrop.outputSize, Math.round((box[3] - v161PreclipCrop.y) * scale));
        if (cx2 > cx1 + 4 && cy2 > cy1 + 4) {
          dispatchBox = [cx1, cy1, cx2, cy2];
        } else {
          // Fallback: most of the preclip IS the face.
          const pad = Math.max(2, Math.round(v161PreclipCrop.outputSize * 0.08));
          dispatchBox = [pad, pad, v161PreclipCrop.outputSize - pad, v161PreclipCrop.outputSize - pad];
        }
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_bbox_clip_space plate_box=${JSON.stringify(box)} crop=${JSON.stringify(v161PreclipCrop)} → clip_box=${JSON.stringify(dispatchBox)} windows_clip=${JSON.stringify(v124VoicedWindows)}`,
        );
      }

      let usedUrl: string | null = null;
      let nonNullFrames = frameCount;
      if (retryVariant === "bbox-url-pro" && dispatchBox) {
        const up = await uploadBoundingBoxesJson(supabase, {
          userId,
          projectId: String((scene as any).project_id ?? ""),
          sceneId,
          passIdx: currentPassIdx,
          box: dispatchBox,
          frameCount,
          voicedWindowsSec: v124VoicedWindows,
          fps: dispatchFps,
        });
        usedUrl = up.url;
        nonNullFrames = up.nonNullFrames;
      }


      // v147 — Pre-Dispatch Validation: bbox-url muss mind. 1 voiced frame
      // enthalten. Sonst: deterministischer Downgrade auf coords-pro (kein
      // stiller inline-Fallback, der bei kaputter URL den v126-Provider-
      // Unknown wieder triggern würde).
      const v147BboxValid = !!usedUrl && nonNullFrames >= 1;
      // v152 — Bbox-Geometrie Sanity-Gate auf dem DISPATCHED video. Im
      // Preclip-Modus ist die Box-Fläche praktisch das ganze Bild (≈ 60-95 %),
      // also wird der upper-bound für Preclip auf 0.98 angehoben.
      const dispatchDimsArea = v161UsingPreclipForBbox && v161PreclipCrop
        ? Math.max(1, v161PreclipCrop.outputSize * v161PreclipCrop.outputSize)
        : Math.max(1, (plateDims?.width ?? 0) * (plateDims?.height ?? 0));
      const boxArea = dispatchBox ? Math.max(0, (dispatchBox[2] - dispatchBox[0]) * (dispatchBox[3] - dispatchBox[1])) : 0;
      const boxAreaPct = boxArea / dispatchDimsArea;
      const v152UpperBound = v161UsingPreclipForBbox ? 0.98 : 0.45;
      const v152BboxSane = boxAreaPct >= 0.002 && boxAreaPct <= v152UpperBound;
      (pass as any)._v152BboxAreaPct = Number(boxAreaPct.toFixed(4));

      if (v147BboxValid && v152BboxSane) {
        syncOptions.active_speaker_detection = {
          auto_detect: false,
          bounding_boxes_url: usedUrl!,
        };
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_BBOX_URL_PRIMARY speaker=${pass.speaker_name} space=${v161UsingPreclipForBbox ? "clip" : "plate"} box=${JSON.stringify(dispatchBox)} source=${bboxSource} frames=${frameCount} voiced_frames=${nonNullFrames} area_pct=${(boxAreaPct * 100).toFixed(2)} windows=${JSON.stringify(v124VoicedWindows)} url=…${usedUrl!.slice(-60)}`,
        );
      } else if (retryVariant === "coords-pro-box") {
        // Legacy inline path bleibt verfügbar für explizite coords-pro-box Retries.
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
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v124_BBOX_INLINE variant=${retryVariant} speaker=${pass.speaker_name} box=${JSON.stringify(box)} source=${bboxSource} frames=${frameCount} voiced_frames=${inlineNonNull} windows=${JSON.stringify(v124VoicedWindows)}`,
        );
      } else {
        // v152 — Hard-Fail statt Silent-Downgrade. Lieber sofort transparent
        // abbrechen + refunden + klare User-Message als 30 min später mit
        // einem stillen Pseudo-Lipsync zu enden.
        const v152FailReason = !usedUrl
          ? "bbox_url_upload_failed"
          : nonNullFrames < 1
            ? "bbox_zero_voiced_frames"
            : `bbox_geometry_insane:area_pct=${(boxAreaPct * 100).toFixed(2)}`;
        (pass as any)._v152HardFail = {
          reason: v152FailReason,
          errorClass: "v152_bbox_hard_fail",
          message:
            `Lip-Sync für „${pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`}" konnte nicht vorbereitet werden ` +
            `(${v152FailReason}). Bitte Szene neu rendern — Sprecher muss frontal und unverdeckt im Bild sein. ` +
            `Credits wurden zurückerstattet.`,
          meta: {
            v152_unified_path: true,
            usedUrl: !!usedUrl,
            non_null_frames: nonNullFrames,
            frame_count: frameCount,
            box,
            bbox_source: bboxSource,
            bbox_area_pct: Number(boxAreaPct.toFixed(4)),
            plate_dims: plateDims ?? null,
          },
        };
        console.error(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v152_BBOX_HARD_FAIL reason=${v152FailReason} usedUrl=${!!usedUrl} non_null=${nonNullFrames} area_pct=${(boxAreaPct * 100).toFixed(2)} — refund + abort, no silent downgrade`,
        );
        // Defer the actual refund/return until failBeforeProviderDispatch
        // is declared (~ line 4486). syncOptions wird unten überschrieben.
        syncOptions.active_speaker_detection = {
          auto_detect: false,
          bounding_boxes_url: "deferred-v152-hard-fail",
        };
      }



    } else {
      (pass as any)._v153LegacyBranchHardFail = {
        reason: "v153_unexpected_legacy_branch",
        errorClass: "v153_auto_detect_blocked",
        message:
          "v153.2 blocked a legacy auto_detect dispatch before provider call. " +
          "Every dialog pass must use bbox-url-pro with a plate-native speaker box.",
        meta: {
          retry_variant: retryVariant,
          plate_hydration_source: plateHydrationSource,
          speaker_plate_boxes: speakerPlateBboxes,
          plate_dims: plateDims,
          is_advance: isAdvance,
          is_retry: isRetry,
        },
      };
      syncOptions.active_speaker_detection = {
        auto_detect: false,
        frame_number: referenceFrameNumber,
        coordinates: clampSyncCoords(pass.coords) ?? [Math.round(videoDims.width / 2), Math.round(videoDims.height / 2)],
      };
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
    // v129.29 — SYNC-3-ONLY policy (user-directive 2026-06-19).
    // All dialog-shot passes dispatch on sync-3, regardless of retry
    // variant. lipsync-2 / lipsync-2-pro fallbacks are disabled for this
    // pipeline. Retry differentiation happens via ASD shape
    // (auto_detect → bbox-url → expanded-crop-auto), not via model swap.
    const payloadModel = SYNC3_MODEL;

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
            canonical_lipsync_pipeline: passes.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
            input_space: passes.length >= 2 ? "plate" : undefined,
            preclip_used: passes.length >= 2 ? false : undefined,
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
            plate_identity: v153PlateIdentitySnapshot,
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

    if (canonicalDialogTurnsCount > 0) {
      const passCharacterId = String(pass.character_id ?? "").trim();
      if (!passCharacterId || !canonicalSpeakerIds.includes(passCharacterId)) {
        return await failBeforeProviderDispatch(
          "id_only_character_id_missing_or_mismatched",
          "id_only_cast_violation",
          "Dialog lip-sync requires every Sync.so pass to carry a brand character UUID from dialog_turns; legacy name/slot fallback is blocked.",
          422,
          {
            canonical_lipsync_pipeline: speakers.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
            speakers_source: speakersSource,
            dialog_turns_count: canonicalDialogTurnsCount,
            canonical_speaker_ids: canonicalSpeakerIds,
            pass_character_id: pass.character_id ?? null,
            pass_idx: currentPassIdx,
          },
        );
      }
    }

    // ── v152 — Deferred Hard-Fail für bbox-url-pro Pre-Dispatch Errors ──
    // Die bbox-Construction oben setzt `_v152HardFail` wenn upload/geometry
    // versagt. Wir können dort noch nicht refunden weil failBeforeProviderDispatch
    // erst hier deklariert ist. Hier triggern wir den Hard-Fail bevor Sync.so
    // jemals einen Request sieht.
    if ((pass as any)._v152HardFail) {
      const hf = (pass as any)._v152HardFail;
      return await failBeforeProviderDispatch(
        hf.reason,
        hf.errorClass,
        hf.message,
        422,
        hf.meta ?? {},
      );
    }

    if ((pass as any)._v153LegacyBranchHardFail) {
      const hf = (pass as any)._v153LegacyBranchHardFail;
      return await failBeforeProviderDispatch(
        hf.reason,
        hf.errorClass,
        hf.message,
        500,
        hf.meta ?? {},
      );
    }


    // v169.1 — Gate nur scharf schalten wenn Tight-Slicing tatsächlich versucht
    // wurde (N≥2). Bei N=1 ist `allowTightSlice=false` und die volle VO geht
    // intentionally als pass.audio_url an Sync.so (Plate-länge Lipsync,
    // direkt als Master, kein Overlay-Mux). Ohne diese Einschränkung
    // feuerte das Gate für jeden Single-Speaker-Pass `prepare_failed_no_tight_audio`.
    if (allowTightSlice && speakerWindowsSecs.length > 0 && !tightAudioInfo) {
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

    // v194 — Silent-Speaker-Pass stabilizer bypass. These passes intentionally
    // ship a near-silent WAV (room tone) so Sync.so produces a closed-mouth
    // lipsync that follows head motion for a non-speaking listener face. The
    // regular silent-audio gate would (correctly, for user audio) reject
    // them. We bypass ONLY when the pass is explicitly flagged as a
    // stabilizer AND the audio_url is our deterministic silence-track.
    const isStabilizerPass = (pass as any).stabilizer_pass === true &&
      (pass as any).is_silent_stabilizer === true;

    const finalAudioDiag = isStabilizerPass
      ? null
      : await inspectSpeakerAudioWithRetry(pass.audio_url, 3).catch((audioErr) => {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} SILENT_AUDIO_GATE inspect_failed: ${(audioErr as Error)?.message ?? audioErr}`,
          );
          return null;
        });
    const finalPeakDbFs = Number(finalAudioDiag?.wav?.peakDbFs);
    const finalVoicedSec = Number(finalAudioDiag?.vad?.voicedSec ?? 0);
    const finalLongestRun = Number(finalAudioDiag?.vad?.longestVoicedRun ?? 0);
    const audioSilentOrInvalid = !isStabilizerPass && (
      !finalAudioDiag ||
      !Number.isFinite(finalPeakDbFs) ||
      finalPeakDbFs <= -50 ||
      finalVoicedSec <= 0.04 ||
      finalLongestRun <= 0.04
    );
    if (isStabilizerPass) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v194_stabilizer_bypass_silent_gate speaker_idx=${(pass as any).speaker_idx}`,
      );
    }
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
    const v204MultiSpeakerPreclipDispatch = speakers.length >= 2;
    if (v204MultiSpeakerPreclipDispatch && (!usePassPreclip || !passPreclipUrl)) {
      return await failBeforeProviderDispatch(
        "v204_preclip_required",
        "v204_preclip_missing_before_wire",
        "Refusing to dispatch multi-speaker Sync.so job without a single-face preclip; v204 forbids Full-Plate fallback.",
        422,
        {
          canonical_lipsync_pipeline: "v204_preclip_bbox_clipspace",
          input_space: "clip",
          preclip_used: false,
          full_plate_fallback_blocked: true,
          pass_idx: currentPassIdx,
          speaker: pass.speaker_name ?? null,
          character_id: pass.character_id ?? null,
          retry_variant: retryVariant,
        },
      );
    }
    const dispatchVideoKind = usePassPreclip ? "preclip" : "full_plate";
    const dispatchInputSpace = usePassPreclip ? "clip" : "plate";
    const rawDispatchVideoUrl = v204MultiSpeakerPreclipDispatch
      ? (passPreclipUrl as string)
      : (usePassPreclip ? (passPreclipUrl as string) : passInputUrl);
    // v143 — Rehost the plate into our own bucket before sending to Sync.so.
    // Presigned Replicate/S3 URLs expire after ~60 min; multi-pass dialogs
    // routinely exceed that window, causing Sync.so to silently return 422
    // `generation_input_video_inaccessible` which our pipeline mis-read as
    // a NOOP. The signed `lipsync-plates` URL is valid for 7 days.
    let dispatchVideoUrl = rawDispatchVideoUrl;
    let rehostInfo: { uploaded: boolean; ms: number; bytes: number } | null = null;
    try {
      const rh = await rehostPlate(supabase, rawDispatchVideoUrl, {
        sceneId,
        passIdx: currentPassIdx,
          kind: usePassPreclip ? "preclip" : "fullplate",
        ownerId: (scene as any)?.user_id ?? (scene as any)?.owner_id ?? null,
      });
      dispatchVideoUrl = rh.url;
      rehostInfo = { uploaded: rh.uploaded, ms: rh.durationMs, bytes: rh.bytes };
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v143_rehost ${rh.uploaded ? "uploaded" : "cached"} ${rh.bytes}B in ${rh.durationMs}ms`,
      );
    } catch (e) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v143_rehost FAILED — falling back to raw URL: ${(e as Error)?.message}`,
      );
    }
    // v189 (Fix E) — Persistence honesty. `pass.input_url` was set to the
    // master plate at the top of the dispatch, but Sync.so actually receives
    // `dispatchVideoUrl` (the per-speaker preclip when `usePassPreclip`).
    // Overwrite so forensics (`dialog_shots.passes[].input_url`) matches
    // what Sync.so was told, per v169 §3 data-model contract.
    try {
      (pass as any).input_url = dispatchVideoUrl;
    } catch { /* noop */ }
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
      stage: speakers.length >= 2
        ? "v204-preclip-bbox-clipspace"
        : usePassPreclip
          ? "preclip-sync3-autodetect-v105"
          : "fullplate-sync3-deterministic-v105",
      model_intent: "sync-3",
      payload_model: payloadModel,
      dispatch_video_kind: dispatchVideoKind,
      canonical_lipsync_pipeline: speakers.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
      input_space: dispatchInputSpace,
      preclip_used: usePassPreclip,
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
      // v143 — Rehost telemetry so dispatch logs prove whether Sync.so saw a
      // stable lipsync-plates URL or the raw Replicate URL.
      v143_rehost_url: rehostInfo ? dispatchVideoUrl : null,
      v143_rehost_source_url: rehostInfo ? rawDispatchVideoUrl : null,
      v143_rehost_uploaded: rehostInfo?.uploaded ?? null,
      v143_rehost_bytes: rehostInfo?.bytes ?? null,
      v143_rehost_ms: rehostInfo?.ms ?? null,
      // v106 — full options-key list so any future doc-drift (unsupported
      // field smuggled into sync-3) is visible in dispatch logs.
      options_keys: Object.keys(payloadOptions),
      v124_stripped_opts: v124Sanitized.strippedOpts,
      v124_stripped_asd: v124Sanitized.strippedAsd,
    };
    (pass as any)._v105_probe = v105Probe;
    (pass as any)._v106_probe = v105Probe;

    // v169 — Multi-speaker must NEVER use auto_detect, including preclips.
    // Each pass should carry deterministic frame_number+coordinates or a
    // bounding_boxes_url/inline bbox. If any legacy branch still produced
    // auto_detect:true, fail before provider spend instead of black-boxing
    // into wrong-speaker / black-scene / infinite-loading behaviour.
    if (speakers.length >= 2 && asdForProbe?.auto_detect === true) {
      return await failBeforeProviderDispatch(
        "multi_speaker_auto_detect_blocked",
        usePassPreclip
          ? "asd_auto_detect_on_multi_speaker_preclip"
          : "asd_auto_detect_on_multi_speaker_fullplate",
        "Refusing to dispatch Sync.so with auto_detect=true on a multi-speaker scene; deterministic ASD is required.",
        500,
        { v105_probe: v105Probe, canonical_lipsync_pipeline: "v204_preclip_bbox_clipspace" },
      );
    }

    // v204 — Preclip wire is the canonical multi-speaker path (rolled back v203 block).

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
      // v129.24 — auto_detect:true on a single-face preclip is now the
      // CORRECT path (reproduced 2026-06-18: explicit ASD coords cause
      // `generation_unknown_error` while auto_detect succeeds). The legacy
      // v129.2.1 block treated `wouldAutoDetect && hasCoords` as a contract
      // violation — invert that: it's only a violation when the preclip
      // ALSO has more than one face (genuine ambiguity).
      const rawPassFc = (pass as any).preclip_face_count;
      const passFcNum =
        rawPassFc === null || rawPassFc === undefined || !Number.isFinite(Number(rawPassFc))
          ? null
          : Number(rawPassFc);
      // v129.25 — clean crop with unknown face_count is also "unambiguous".
      // Only confirmed multi-face crops force the explicit-ASD path.
      const ambiguityCleanPre =
        v1291Ambig === null || v1291Ambig?.risk === "clean";
      const preclipUnambiguous =
        ambiguityCleanPre && passFcNum !== 0 && !(passFcNum !== null && passFcNum > 1);
      const ambiguousAutoDetect =
        wouldAutoDetect &&
        !!v1291Ambig?.sibling_centers_inside_crop &&
        !preclipUnambiguous;
      const wrongAutoDetect =
        hasCoords && wouldAutoDetect && !preclipUnambiguous;
      if (v1291Block || wrongAutoDetect || ambiguousAutoDetect) {
        const reasonLabel = v1291Block
          ? v1291Block.reason
          : ambiguousAutoDetect
            ? "auto_detect_with_ambiguous_crop"
            : "auto_detect_with_persisted_coords";
        return await failBeforeProviderDispatch(
          "DISPATCH_BLOCKED_PAYLOAD_PRECHECK",
          "internal_payload_contract_violation",
          `v129.24 preflight blocked dispatch: ${reasonLabel}`,
          500,
          {
            v1291: v1291Diag,
            v1291_block: v1291Block,
            v1291_ambiguity: v1291Ambig,
            v105_probe: v105Probe,
            preclip_face_count: passFcNum,
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
      // v136 — Always run the face-gate. The previous "auto_detect preclip
      // trusted" short-circuit (v131.4) is gone because we no longer dispatch
      // auto_detect on preclips; we send explicit center coords and the gate
      // (+ Sync.so auto-snap) is the safety net against drift.
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
      // ── v130 — Post-Probe Snap as a Re-Invocation of the Same Strategy ──
      // Previously (v129.22.3 → v129.30) the Face-Gate's `ok_after_snap`
      // branch was an ad-hoc patch: it overwrote `syncOptions` and
      // `payload.options` inline, with shape decisions duplicated from
      // Block A. That created two sources of truth and was the root
      // cause of "Snap-Kandidat erkannt, noch nicht im Dispatch
      // angewandt" (v124 sanitizer stripping mismatched coords).
      //
      // v130 collapses this: when the gate snaps, we re-invoke the SAME
      // `buildAsdStrategy` function with the snapped coord injected as a
      // `preflight` input. The strategy returns mode `preflight_coord`
      // with a doc-strict ASD — structurally identical to a fresh
      // first-attempt dispatch where preflight had succeeded. Single
      // source of truth, no shape drift possible.
      if (gate.ok && gate.code === "ok_after_snap" && Array.isArray(gate.snapped_coord)) {
        const snappedCoord: [number, number] = [Number(gate.snapped_coord[0]), Number(gate.snapped_coord[1])];
        const snapFrame: number = Number.isFinite(gateFrame as number) ? Number(gateFrame) : 0;
        if (!usePassPreclip) (pass as any).coords = snappedCoord;
        else (pass as any).dispatch_coords_snapped = snappedCoord;
        (pass as any).coords_snapped_at = new Date().toISOString();
        (pass as any).coords_snap_origin = gate.original_coord ?? null;
        (pass as any).coords_snap_space = usePassPreclip ? "preclip" : "plate";
        (pass as any).snap_applied_to_dispatch = true;
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v140_snap_recorded_no_payload_mutation pass=${currentPassIdx + 1} snapped=[${snappedCoord[0]},${snappedCoord[1]}] frame=${snapFrame} space=${usePassPreclip ? "preclip" : "plate"}`,
        );
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_source_kind: "segments", video_url: dispatchVideoUrl,
          coords: snappedCoord, frame_number: snapFrame,
          http_status: 0, sync_status: "COORD_AUTO_SNAPPED",
          error_class: "coord_auto_snap",
          error_message: (gate.reason ?? "auto_snapped").slice(0, 240),
          meta: {
            diagnostic_id: diagnosticId,
            retry_variant: retryVariant,
            pass_idx: currentPassIdx,
            total_passes: passes.length,
            face_gate: {
              version: "v130",
              code: gate.code,
              snapped_coord: snappedCoord,
              original_coord: gate.original_coord ?? gateCoord,
              snap_distance_px: gate.snap_distance_px ?? null,
              frame_jpeg_url: gate.frame_jpeg_url,
              extract_ms: gate.extract_ms,
              gemini_ms: gate.gemini_ms,
            },
            snap_applied_to_dispatch: true,
            asd_strategy: {
              mode: "snap_recorded_no_payload_mutation",
              source: "face_gate",
              coord_space: usePassPreclip ? "preclip" : "plate",
              diagnostics: { reason: "v140_single_wire_builder_prevents_late_asd_mutation" },
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
              version: "v129.23.2",
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
              version: "v129.23.2",
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

    // ── v140 — Final single wire builder for ASD ────────────────────────
    // From here to `fetch`, the outgoing payload is canonicalized exactly
    // once. No branch may mutate `active_speaker_detection` after this point.
    try {
      const canonicalAsd = normalizeCanonicalAsd(
        (payload.options as any)?.active_speaker_detection ??
          (syncOptions as any)?.active_speaker_detection,
      );
      (syncOptions as any).active_speaker_detection = canonicalAsd;
      (payload.options as any).active_speaker_detection = canonicalAsd;
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} v140_ASD_CANONICAL asd=${JSON.stringify(canonicalAsd)}`,
      );
      if ((canonicalAsd as any)?.auto_detect === true) {
        const v153WasPrimary = !!(pass as any)._v153BboxPrimary;
        if (v153WasPrimary) {
          console.error(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} v153.3_preclip_overwrite_detected — v153 set bbox-url-pro but ASD was rewritten to auto_detect before wire. retry_variant=${retryVariant} use_pass_preclip=${usePassPreclip} preclip_url=${(pass as any).preclip_url ? "yes" : "no"}`,
          );
        }
        return await failBeforeProviderDispatch(
          "v153_auto_detect_wire_blocked",
          "v153_auto_detect_blocked",
          v153WasPrimary
            ? "v153.3 assert: auto_detect:true reached wire AFTER unified bbox path was active — legacy preclip overwrite still present."
            : "v153.3 assert: auto_detect:true is forbidden in dialog lip-sync; expected bbox-url-pro.",
          500,
          {
            retry_variant: retryVariant,
            plate_hydration_source: plateHydrationSource,
            speaker_plate_boxes: speakerPlateBboxes,
            plate_dims: plateDims,
            is_advance: isAdvance,
            is_retry: isRetry,
            v153_was_primary: v153WasPrimary,
            use_pass_preclip: usePassPreclip,
            had_preclip_url: !!(pass as any).preclip_url,
          },
        );
      }
      if ((canonicalAsd as any)?.auto_detect === false) {
        const hasBoxes = !!(canonicalAsd as any)?.bounding_boxes_url || Array.isArray((canonicalAsd as any)?.bounding_boxes);
        if (!hasBoxes) {
          return await failBeforeProviderDispatch(
            "v201_bbox_required",
            "bbox_required",
            "Dialog lip-sync dispatch is locked to sync-3 + bounding_boxes_url/bounding_boxes. Coordinate-only ASD is blocked to prevent speaker drift.",
            500,
            {
              canonical_lipsync_pipeline: speakers.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
              speakers_source: speakersSource,
              dialog_turns_count: canonicalDialogTurnsCount,
              final_asd: canonicalAsd,
              retry_variant: retryVariant,
            },
          );
        }
      }
    } catch (canonErr) {
      return await failBeforeProviderDispatch(
        "DISPATCH_BLOCKED_V140_CANONICAL_ASD",
        "canonical_asd_invalid",
        `v140 canonical ASD builder rejected payload: ${(canonErr as Error)?.message ?? canonErr}`,
        500,
        {
          final_asd: (payload.options as any)?.active_speaker_detection ?? null,
          retry_variant: retryVariant,
          compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
        },
      );
    }

    // ── v136 — Doc-strict ASD sanitizer (replaces v131.5 final override) ──
    // With v136 we dispatch explicit preclip-centered coordinates on preclip
    // passes, so the previous "force auto_detect:true at the wire" override
    // no longer applies — that override was the very thing causing Sync.so
    // sync-3 to silently no-op on every speaker. We keep ONLY the mutex
    // sanitizer + the doc-strict shape assertion so that any code path
    // intentionally using auto_detect:true (e.g. the post-snap re-strategy
    // when no coord is available) still sends a legal payload.
    {
      const sanAsd: any = (payload.options as any)?.active_speaker_detection;
      if (sanAsd && sanAsd.auto_detect === true) {
        if ("coordinates" in sanAsd) delete sanAsd.coordinates;
        if ("frame_number" in sanAsd) delete sanAsd.frame_number;
        if ("bounding_boxes" in sanAsd) delete sanAsd.bounding_boxes;
        if ("bounding_boxes_url" in sanAsd) delete sanAsd.bounding_boxes_url;
      }

      const assertAsd: any = (payload.options as any)?.active_speaker_detection;
      if (
        assertAsd?.auto_detect === true &&
        (Array.isArray(assertAsd?.coordinates) || assertAsd?.frame_number != null)
      ) {
        return await failBeforeProviderDispatch(
          "DISPATCH_BLOCKED_V136_ASSERT",
          "asd_auto_detect_with_coords_violation",
          "v136 assert: active_speaker_detection.auto_detect=true must not carry coordinates/frame_number",
          500,
          { final_asd: assertAsd, retry_variant: retryVariant, compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION },
        );
      }
    }

    // v139.1 — Pre-dispatch coords-shape assertion. Sync.so sync-3 expects
    // `coordinates: [x, y]` flat (2 finite numbers). Any other shape (nested,
    // length≠2, non-number) is rejected with HTTP 400 "must contain at least
    // 2 elements". Catch this client-side so we get a clear error code + log
    // instead of a generic Sync.so 400 — and so a future regression like v136
    // is impossible to ship unnoticed.
    {
      const coordsAsd: any = (payload.options as any)?.active_speaker_detection;
      if (coordsAsd && coordsAsd.auto_detect === false) {
        const c = coordsAsd.coordinates;
        const hasBoxes = coordsAsd.bounding_boxes || coordsAsd.bounding_boxes_url;
        const coordsOk =
          Array.isArray(c) &&
          c.length === 2 &&
          c.every((n: unknown) => typeof n === "number" && Number.isFinite(n));
        if (!hasBoxes && !coordsOk) {
          console.error(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} BAD_COORDS_SHAPE coords=${JSON.stringify(c)} retry_variant=${retryVariant}`,
          );
          return await failBeforeProviderDispatch(
            "BAD_COORDS_SHAPE",
            "coords_shape_violation",
            `v139.1 assert: active_speaker_detection.coordinates must be flat [x, y] (got ${JSON.stringify(c)})`,
            500,
            { final_asd: coordsAsd, retry_variant: retryVariant, compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION },
          );
        }
        if (coordsOk) {
          console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} coords_shape ok=[${c[0]},${c[1]}] frame_number=${coordsAsd.frame_number}`,
          );
        } else if (hasBoxes) {
          const boxesKind = coordsAsd.bounding_boxes_url ? "bounding_boxes_url" : "bounding_boxes";
          console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} coords_shape ok=${boxesKind} frame_number=${coordsAsd.frame_number ?? "n/a"}`,
          );
        }
      }
    }

    // v139.2 — WIRE_PAYLOAD forensik. Logs the EXACT options object that
    // Sync.so will see, immediately before fetch. This is the only way to
    // attribute a Sync.so 400 to a specific shape — every earlier mutation
    // point becomes irrelevant once we have the wire bytes. Truncate to
    // 1500 chars so multi-frame bounding_boxes don't flood the log.
    try {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} WIRE_PAYLOAD version=${COMPOSE_DIALOG_SEGMENTS_VERSION} model=${(payload as any)?.model} options=${JSON.stringify((payload as any)?.options ?? null).slice(0, 1500)}`,
      );
    } catch (_logErr) {
      // never let logging crash dispatch
    }

    // v169 Stage A — Stale-Job Reconcile (best-effort, ≤500ms). Frees Sync.so
    // concurrency slots held by zombie jobs from earlier failed runs so this
    // dispatch doesn't hit a spurious 429.
    try {
      await reconcileStaleSyncJobs(supabase, {
        userId,
        syncApiKey,
        apiBase: SYNC_API_BASE,
      });
    } catch (_e) {
      // never block dispatch on reconcile
    }

    // v169 Stage B — 429-Backoff. Sync.so concurrency_limit_reached is
    // transient (other passes in this scene or a parallel scene). Retry
    // identical payload up to 3× with exponential backoff + jitter before
    // falling through to the existing dispatch-failure path.
    const BACKOFFS_MS = [4_000, 10_000, 22_000];
    let resp: Response;
    let attempt = 0;
    while (true) {
      resp = await fetch(`${SYNC_API_BASE}/generate`, {
        method: "POST",
        headers: { "x-api-key": syncApiKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.status !== 429 || attempt >= BACKOFFS_MS.length) break;
      const base = BACKOFFS_MS[attempt];
      const jitter = Math.floor(Math.random() * (base * 0.2));
      const waitMs = base + jitter;
      attempt++;
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} 429_RETRY attempt=${attempt}/${BACKOFFS_MS.length} backoff_ms=${waitMs}`,
      );
      try { await resp.body?.cancel(); } catch (_e) { /* ignore */ }
      await new Promise((r) => setTimeout(r, waitMs));
    }


    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      // v139.2 — Correlate failure with the wire shape that triggered it.
      // Re-log options on failure so request+response sit in one query.
      console.error(
        `[compose-dialog-segments] scene=${sceneId} dispatch FAILED pass=${currentPassIdx} status=${resp.status} body=${errTxt.slice(0, 600)} wire_options=${JSON.stringify((payload as any)?.options ?? null).slice(0, 800)}`,
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
          clip_error: resp.status === 429
            ? "syncso_concurrency_exhausted"
            : `syncso_segments_dispatch_${resp.status}`,
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
      plate_identity: v153PlateIdentitySnapshot,
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
      // v134 §3 — Populate dedicated turn_idx column so SQL forensics no longer
      // requires pulling pass_idx out of meta JSON.
      turn_idx: Number.isFinite(currentPassIdx) ? Number(currentPassIdx) : null,
      http_status: resp.status, sync_status: "DISPATCHED",
      meta: {
        // v131.5 — version pin for forensic attribution
        compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
        canonical_lipsync_pipeline: speakers.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
        speakers_source: speakersSource,
        dialog_turns_count: canonicalDialogTurnsCount,
        canonical_speaker_ids: canonicalSpeakerIds,
        asd_mode: (payload.options as any)?.active_speaker_detection?.bounding_boxes_url
          ? "bounding_boxes_url"
          : Array.isArray((payload.options as any)?.active_speaker_detection?.bounding_boxes)
            ? "bounding_boxes"
            : (payload.options as any)?.active_speaker_detection?.coordinates
              ? "coordinates"
              : (payload.options as any)?.active_speaker_detection?.auto_detect
                ? "auto_detect"
                : "unknown",
        v131_5_final_override: (pass as any)._v131_5_final_override ?? null,
        input_space: dispatchInputSpace,
        preclip_used: usePassPreclip,
        fullplate_bbox_only: false,
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
          plate_identity_method: (plateIdentityMap as any)?.identityMethod ?? null,
          plate_identity_min_conf: (plateIdentityMap as any)?.minConfidence ?? null,
          plate_identity_min_margin: (plateIdentityMap as any)?.minMargin ?? null,
          plate_identity_cross_check: (plateIdentityMap as any)?.crossCheck ?? null,
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
        // v131.2 — top-level keys for fast SQL filtering. Always populated:
        // `asd_rule_fired` falls back to the strategy mode when the rule
        // diagnostic isn't set (Rule 3/4/5 don't emit a `rule` key).
        asd_mode_chosen: (pass as any)._v130_asd_strategy?.mode ?? null,
        asd_rule_fired:
          (pass as any)._v1291?.rule ??
          (pass as any)._v130_asd_strategy?.mode ??
          null,
        preclip_trust:
          (pass as any)._v1291?.preclip_trust ??
          (pass as any)._v130_asd_strategy?.preclip_trust ??
          null,

        preclip_duration_sec: (pass as any).preclip_duration_sec ?? null,
        preclip_frame_count: (pass as any).preclip_frame_count ?? null,
        preclip_fps: (pass as any).preclip_fps ?? null,
        preclip_dims: (pass as any).preclip_dims ?? null,
        preclip_crop: (pass as any).preclip_crop ?? null,
        dispatch_video_kind: dispatchVideoKind,

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

    // v168 — Phase 1 of Per-Pass-Lock rollout: replace full-row dialog_shots
    // UPDATE with atomic per-slot RPC writes. With Plan-D fan-out, up to N
    // parallel dispatchers race here; a full-row UPDATE causes Lost-Update
    // (the last writer overwrites sibling-pass job_ids). The RPCs use
    // jsonb_set/||-merge at the row-lock level, so each pass writes only
    // its own slot atomically.
    //
    //   1) update_dialog_pass_slot(scene, pass_idx, patch)
    //      → writes `dialog_shots.passes[pass_idx] = passes[pass_idx] || patch`
    //   2) update_dialog_shots_root_merge(scene, patch)
    //      → merges root-level fields (cost_credits, fallback_history)
    //        WITHOUT touching `passes[]`. `passes` is stripped defensively.
    //   3) plain UPDATE for top-level scene columns (lip_sync_status,
    //      twoshot_stage, …) — these are idempotent across passes (latest
    //      writer's value is fine for status/diagnostic fields).
    {
      const { error: slotErr } = await supabase.rpc("update_dialog_pass_slot", {
        _scene_id: sceneId,
        _pass_idx: currentPassIdx,
        _patch: pass,
      });
      if (slotErr) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v168_per_slot_write pass=${currentPassIdx + 1} rpc_error=${slotErr.message} — falling back to full-row UPDATE`,
        );
        // Fallback: read-modify-write merge (legacy behavior for safety).
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
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: {
              ...freshState,
              ...state,
              canonical_lipsync_pipeline: passes.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
              input_space: passes.length >= 2 ? "plate" : undefined,
              preclip_used: passes.length >= 2 ? false : undefined,
              passes: freshPasses,
            },
          })
          .eq("id", sceneId);
      } else {
        // Root merge: write ALL root-level state fields (sync_job_id, status,
        // total_sec, video_width, etc.) WITHOUT touching `passes[]`. The RPC
        // strips `passes` defensively. Last-writer-wins on root scalars is
        // the legacy behavior and is tolerable because authoritative per-pass
        // job IDs live in `passes[i].sync_job_id`.
        const { passes: _drop, ...rootOnly } = state as any;
        await supabase.rpc("update_dialog_shots_root_merge", {
          _scene_id: sceneId,
          _patch: {
            ...rootOnly,
            canonical_lipsync_pipeline: passes.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
            input_space: passes.length >= 2 ? "plate" : undefined,
            preclip_used: passes.length >= 2 ? false : undefined,
          },
        });
      }

      // Top-level scene columns (idempotent across parallel passes).
      await supabase
        .from("composer_scenes")
        .update({
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
    // v138 — Defaults flipped ON. Plan-D parallel fan-out is now the
    // standard path. DB flags act as KILL-SWITCHES only (set to false
    // explicitly to force the legacy serial chain). Env var also
    // defaults true. Previously all three defaulted false → 17-23 min
    // serial runs even when ops set DB flags to true (deploy lag).
    let parallelFlagOn = true;
    // v192 — Default cap raised from 2 → 4. For 4-speaker scenes this collapses
    // two serial Sync.so waves back into one parallel wave (v169 tempo). DB row
    // `composer.sync_so_concurrency_cap` still acts as the down-ward kill-switch.
    let concurrencyCap = 4;
    let fanoutForceEnableDb = true;
    try {
      const { data: pFlag } = await supabase
        .from("system_config").select("value")
        .eq("key", "composer.parallel_sync_so_passes").maybeSingle();
      if (pFlag && (pFlag.value === false || pFlag.value === "false")) {
        parallelFlagOn = false;
      }
      const { data: cFlag } = await supabase
        .from("system_config").select("value")
        .eq("key", "composer.sync_so_concurrency_cap").maybeSingle();
      const rawCap = (cFlag as any)?.value;
      const parsedCap = typeof rawCap === "number" ? rawCap : Number(rawCap);
      if (Number.isFinite(parsedCap) && parsedCap >= 1) {
        concurrencyCap = Math.min(4, Math.max(1, Math.floor(parsedCap)));
      }
      const { data: fFlag } = await supabase
        .from("system_config").select("value")
        .eq("key", "composer.plan_d_fanout_force_enable").maybeSingle();
      if (fFlag && (fFlag.value === false || fFlag.value === "false")) {
        fanoutForceEnableDb = false;
      }
    } catch { /* defaults */ }
    // v138 — Env killswitch defaults TRUE. Set FEATURE_PLAN_D_FANOUT=false
    // explicitly to force serial mode for emergency rollback.
    const planDFanoutEnvOn = (Deno.env.get("FEATURE_PLAN_D_FANOUT") ?? "true")
      .toLowerCase() === "true";
    const fanOutAllowed = (planDFanoutEnvOn || fanoutForceEnableDb) && parallelFlagOn && passes.length >= 2;
    if (parallelFlagOn && passes.length >= 2 && !planDFanoutEnvOn && !fanoutForceEnableDb && !isAdvance && !isRetry) {

      try {
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          user_id: userId,
          engine: "sync-segments",
          sync_status: "PLAN_D_FANOUT_BLOCKED_V139",
          meta: {
            v139_blocked: true,
            pass_idx: currentPassIdx,
            total_passes: passes.length,
            attempt_id: pass?.attempt_id ?? null,
            variant: pass?.retry_variant ?? null,
            model: pass?.retry_variant ?? null,
            dispatch_source: "compose-dialog-segments",
            reason: "FEATURE_PLAN_D_FANOUT=false AND composer.plan_d_fanout_force_enable=false",
          },
        });
      } catch { /* ignore log errors */ }
      console.log(
        `[compose-dialog-segments] scene=${sceneId} PLAN_D_FANOUT_BLOCKED_V139 ` +
          `(env=${Deno.env.get("FEATURE_PLAN_D_FANOUT") ?? "<unset>"} db_force=${fanoutForceEnableDb}, ${passes.length} passes) — webhook will chain serially`,
      );
    }
    // ── v170 — Seed sibling pass skeletons BEFORE fan-out ────────────────
    // Regression fix (June 2026): on fresh multi-speaker dispatch the v168
    // per-slot RPC above only writes `passes[0]`, and the root merge strips
    // `passes` defensively. The parallel `{ advance: true, pass_idx: i }`
    // self-invokes therefore loaded `prevState.passes.length === 1`, hit the
    // "no pass at cursor" guard, and silently returned. Result in DB:
    // `total_passes: 4` but `passes` length 1 → UI shows 1/1 and only the
    // first speaker is ever lip-synced.
    //
    // Fix: BEFORE fanning out, persist a pending skeleton for every sibling
    // pass (slots 1..N-1) via the same atomic RPC. Each skeleton carries the
    // full pass metadata (idx, speaker_idx, character_id, audio_url, coords,
    // segments, retry_variant, audio_url_full, v137_mapping). The fan-out
    // self-invokes then find their slot and dispatch normally.
    if (!isAdvance && !isRetry && passes.length > 1) {
      try {
        const seedResults = await Promise.allSettled(
          passes.slice(1).map(async (sibling, offset) => {
            const slotIdx = offset + 1;
            // Defensive deep-copy so we never persist `rendering`/`job_id`
            // state inherited from a shared reference.
            const skeleton: Record<string, unknown> = {
              ...(sibling as any),
              status: "pending",
              job_id: null,
              output_url: null,
              started_at: null,
              finished_at: null,
              error: null,
            };
            const { error } = await supabase.rpc("update_dialog_pass_slot", {
              _scene_id: sceneId,
              _pass_idx: slotIdx,
              _patch: skeleton,
            });
            if (error) throw new Error(error.message);
            return slotIdx;
          }),
        );
        const seededIdxs = seedResults
          .map((r, i) => (r.status === "fulfilled" ? i + 1 : null))
          .filter((v): v is number => v !== null);
        const failedSeeds = seedResults
          .map((r, i) => (r.status === "rejected" ? { idx: i + 1, reason: (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason) } : null))
          .filter((v): v is { idx: number; reason: string } => v !== null);
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v170_pass_skeleton_seed ok=${seededIdxs.join(",") || "none"} total_passes=${passes.length}${failedSeeds.length ? ` failed=${JSON.stringify(failedSeeds)}` : ""}`,
        );
        if (failedSeeds.length > 0) {
          // Fallback: write the full array via the legacy UPDATE so siblings
          // are at least present (last-writer-wins is acceptable here because
          // pass 0 was already persisted via the per-slot RPC above).
          try {
            const { data: freshRow2 } = await supabase
              .from("composer_scenes")
              .select("dialog_shots")
              .eq("id", sceneId)
              .maybeSingle();
            const freshDs: any = (freshRow2 as any)?.dialog_shots ?? {};
            const freshPasses: any[] = Array.isArray(freshDs?.passes)
              ? freshDs.passes.slice()
              : [];
            for (let i = 0; i < passes.length; i++) {
              if (!freshPasses[i]) freshPasses[i] = passes[i];
            }
            await supabase
              .from("composer_scenes")
              .update({
                dialog_shots: { ...freshDs, passes: freshPasses, total_passes: passes.length, multi_pass: passes.length > 1 },
                updated_at: nowIso,
              })
              .eq("id", sceneId);
          } catch (fallbackErr) {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} v170_pass_skeleton_seed_fallback_failed: ${(fallbackErr as Error)?.message ?? fallbackErr}`,
            );
          }
        }
      } catch (seedErr) {
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v170_pass_skeleton_seed_threw: ${(seedErr as Error)?.message ?? seedErr}`,
        );
      }
    }

    if (!isAdvance && !isRetry && fanOutAllowed) {
      // Pass 0 was just dispatched above. Fan out passes [1 .. cap-1] now;
      // any beyond cap remain `pending` and get kicked by the webhook.
      // v193: use EdgeRuntime.waitUntil instead of bare setTimeout. Bare timers
      // can be dropped when the Edge Function returns, which silently collapses
      // a supposed one-wave fanout back into webhook-chained serial dispatch.
      const fanOutEnd = Math.min(passes.length, concurrencyCap);
      try {
        EdgeRuntime.waitUntil(Promise.allSettled(
          Array.from({ length: Math.max(0, fanOutEnd - 1) }, async (_, offset) => {
            const i = offset + 1;
            const delayMs = i * 250; // small jitter prevents Sync.so burst spike
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            const resp = await fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ scene_id: sceneId, advance: true, pass_idx: i }),
            });
            console.log(
              `[compose-dialog-segments] scene=${sceneId} v193_fanout_self_invoke pass=${i + 1}/${passes.length} status=${resp.status}`,
            );
          }),
        ));
      } catch (err) {
        console.warn(`[compose-dialog-segments] plan_d waitUntil fan-out setup threw: ${(err as Error)?.message ?? err}`);
      }
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v193_parallel_pass_fanout_start cap=${concurrencyCap} fanout_size=${fanOutEnd} N_passes=${passes.length} env=${Deno.env.get("FEATURE_PLAN_D_FANOUT") ?? "<unset>"} db_force=${fanoutForceEnableDb}`,
      );

      // ── v167 Speedup Schritt 2 — Preclip Pre-Fanout für Passes jenseits des Caps ──
      // Wenn N > cap (z.B. N=4, cap=3), wartet Pass[cap..N-1] aktuell auf den
      // Webhook eines früheren Passes UND rendert dann erst seinen ~90-120s
      // Preclip. Dieser Block startet die Preclip-Renders für die "wartenden"
      // Passes als Background-Task SOFORT (parallel zur sync-3-Verarbeitung
      // der Fanout-Passes). Wenn der Webhook später `advance` für Pass N-1
      // triggert, ist `preclip_url` bereits gesetzt → der Per-Pass-Lazy-Render
      // (Z. 3727) wird übersprungen, Pass N-1 dispatched direkt.
      //
      // Hinter Env-Flag `FEATURE_PRECLIP_PREFANOUT` (default OFF). Aktivieren
      // mit `FEATURE_PRECLIP_PREFANOUT=true` in den Edge-Secrets.
      // Fallback: bei Failure greift der bestehende Per-Pass-Render in der
      // späteren `advance`-Invocation → keine Regression möglich.
      // v192 — Default flipped ON. Preclip pre-fanout is retry-path insurance;
      // no cost on the v153.2 bbox-url-pro happy path. Set to "false" explicitly
      // to disable.
      const preFanoutEnabled = (Deno.env.get("FEATURE_PRECLIP_PREFANOUT") ?? "true")
        .toLowerCase() === "true";
      if (preFanoutEnabled && passes.length > concurrencyCap && plateDims && sourceClipUrl) {
        const waitingIdxs: number[] = [];
        for (let i = concurrencyCap; i < passes.length; i++) {
          const wp = passes[i];
          if ((wp as any)?.preclip_url && (wp as any)?.preclip_crop) continue; // already cached
          if (!Array.isArray(wp?.coords) || wp.coords.length !== 2) continue;
          if (!Number.isFinite(Number(wp.coords[0])) || !Number.isFinite(Number(wp.coords[1]))) continue;
          waitingIdxs.push(i);
        }
        if (waitingIdxs.length > 0) {
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout START waiting_passes=${waitingIdxs.join(",")} cap=${concurrencyCap} N=${passes.length}`,
          );
          try {
            EdgeRuntime.waitUntil((async () => {
              await Promise.allSettled(waitingIdxs.map(async (waitIdx) => {
                const wp = passes[waitIdx];
                try {
                  const wpSegments = Array.isArray(wp.segments) ? wp.segments : [];
                  const wpWindows: Array<[number, number]> = wpSegments
                    .map((s: any) => [Number(s.startTime), Number(s.endTime)] as [number, number])
                    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s);
                  if (wpWindows.length === 0) {
                    console.warn(`[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout pass=${waitIdx + 1} skip: no audio windows`);
                    return;
                  }
                  const wpUnionStart = Math.max(0, Math.min(...wpWindows.map(([s]) => s)));
                  const wpUnionEnd = Math.min(totalSec, Math.max(...wpWindows.map(([, e]) => e)));
                  const wpSiblings: Array<[number, number]> = [];
                  for (let k = 0; k < speakers.length; k++) {
                    if (k === wp.speaker_idx) continue;
                    const c = (speakers as any[])[k]?.coords;
                    if (Array.isArray(c) && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))) {
                      wpSiblings.push([Number(c[0]), Number(c[1])]);
                    }
                  }
                  const wpPlateBox = speakerPlateBboxes?.[wp.speaker_idx] ?? null;
                  const wpPreclip = await renderPassFacePreclip(
                    supabase,
                    serviceKey,
                    supabaseUrl,
                    {
                      sceneId,
                      projectId: String((scene as any).project_id ?? ""),
                      userId,
                      passIdx: waitIdx,
                      masterVideoUrl: sourceClipUrl,
                      srcWidth: plateDims.width,
                      srcHeight: plateDims.height,
                      coords: [Number(wp.coords[0]), Number(wp.coords[1])],
                      bbox: wpPlateBox,
                      siblingCoords: wpSiblings.length > 0 ? wpSiblings : null,
                      startSec: wpUnionStart,
                      endSec: wpUnionEnd,
                    },
                    300_000,
                  );
                  if (wpPreclip.ok && wpPreclip.preclipUrl && wpPreclip.crop) {
                    const patch = {
                      preclip_url: wpPreclip.preclipUrl,
                      preclip_render_id: wpPreclip.preclipRenderId ?? null,
                      preclip_crop: {
                        x: wpPreclip.crop.x,
                        y: wpPreclip.crop.y,
                        size: wpPreclip.crop.size,
                        outputSize: wpPreclip.crop.outputSize,
                      },
                      preclip_start_sec: Number(wpUnionStart.toFixed(3)),
                      preclip_end_sec: Number(wpUnionEnd.toFixed(3)),
                      preclip_fps: Number(wpPreclip.fps ?? 30),
                      preclip_frame_count: Number.isFinite(Number(wpPreclip.frameCount)) && Number(wpPreclip.frameCount) > 0
                        ? Math.max(1, Math.round(Number(wpPreclip.frameCount)))
                        : Math.max(1, Math.ceil((wpPreclip.durationSec ?? Math.max(0.2, wpUnionEnd - wpUnionStart)) * Number(wpPreclip.fps ?? 30))),
                      preclip_duration_sec: Number((wpPreclip.durationSec ?? Math.max(0.2, wpUnionEnd - wpUnionStart)).toFixed(3)),
                      preclip_error: null,
                    };
                    await supabase.rpc("update_dialog_pass_slot", {
                      _scene_id: sceneId,
                      _pass_idx: waitIdx,
                      _patch: patch,
                    });
                    console.log(
                      `[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout pass=${waitIdx + 1} OK persisted url=…${wpPreclip.preclipUrl.slice(-60)}`,
                    );
                  } else {
                    console.warn(
                      `[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout pass=${waitIdx + 1} render failed err=${wpPreclip.error} — per-pass lazy-render will retry on advance`,
                    );
                  }
                } catch (e) {
                  console.warn(
                    `[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout pass=${waitIdx + 1} threw: ${(e as Error)?.message ?? e} — per-pass lazy-render will retry on advance`,
                  );
                }
              }));
              console.log(
                `[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout DONE waiting_passes=${waitingIdxs.join(",")}`,
              );
            })());
          } catch { /* EdgeRuntime not available in some test contexts */ }
        }
      }
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
          _pass_idx: lockPassIdx,
        });
      } catch (e) {
        console.warn(`[compose-dialog-segments] lock release failed (scene=${lockSceneId} pass=${lockPassIdx}): ${(e as Error)?.message ?? e}`);
      }
    }
  }
});

