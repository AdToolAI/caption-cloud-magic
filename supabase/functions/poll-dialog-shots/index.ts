/**
 * poll-dialog-shots — v5 SERIAL per-turn Sync.so dispatcher + ffmpeg stitch.
 *
 * v4 design:
 *  - Each turn = ONE Sync.so lipsync-2-pro pass on the ORIGINAL pristine
 *    master plate (no chaining). Tight single-window `segments_secs=[[t]]`
 *    + identity-matched face coords + per-turn temperature.
 *  - Only one new Sync.so turn is dispatched per scene/tick and only when no
 *    other turn is in flight. This keeps Creator-plan concurrency stable.
 *  - Per-tick: poll every in-flight shot, then dispatch the next pending shot.
 *  - On `allReady`: stitch with ffmpeg by time-slicing — window i from
 *    out_T_i, gaps from the pristine master — then remux the master WAV.
 *  - Result: every sentence has identical Sync.so attention, only ONE
 *    re-encode generation per pixel, no chained softening.
 *
 *   pending → lipsyncing (sync_job_id set) → ready (output_url set)
 *                                          → failed
 *   (all turns ready) → stitching → done (clip_url updated)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import {
  classifySyncError,
  clampCoordsToBounds,
  countInflightSyncJobs,
  detectVoicedFrames,
  inspectWav,
  isTransientSyncError,
  logSyncDispatch,
  normalizeWav,
  probeAsset,
  probeVideoStreamCached,
  registerInflightSyncJob,
  releaseInflightSyncJob,
  SYNCSO_DEFAULT_MAX_PARALLEL,
  validateFrameFace,
} from "../_shared/syncso-preflight.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYNC_API_BASE = "https://api.sync.so/v2";
const LIPSYNC_MODEL = "lipsync-2-pro";
const MAX_NEW_SYNC_JOBS_PER_SCENE_PER_TICK = 1;

class SyncConcurrencyDeferredError extends Error {
  constructor(message: string, readonly retryAfter?: string | null) {
    super(message);
    this.name = "SyncConcurrencyDeferredError";
  }
}

/** Pre-roll/tail for `segments_secs` (Sync.so VAD onset + frame-grid rounding).
 *  Hard-clamped to ½ of the gap to the nearest neighbour window so it can
 *  never bleed into another turn's region. v12 Stability: zurück auf
 *  konservative Werte — aggressive Lead-In/Tail erhöhte die Sync.so-Failrate. */
const SYNC_LEAD_IN_SEC = 0.18;
const SYNC_TAIL_SEC = 0.12;

interface DialogShot {
  idx: number;
  speaker_idx: number;
  speaker_name: string;
  character_id: string | null;
  /** Single time window for THIS turn (tight voiced range). */
  window: [number, number];
  /** v9 Artlist-style: slightly expanded window (lead-in/tail) used both
   *  as Sync.so `segments_secs` and as the Lambda-stitch overlay range.
   *  Persisting it guarantees stitch + lipsync target the IDENTICAL slice. */
  render_window?: [number, number];
  durSec: number;
  target_coords: [number, number] | null;
  temperature: number;
  /** v7: ISOLATED per-speaker audio (only this speaker's voice + silence
   *  elsewhere). Fixes "ghost-speech" where Sync.so animated the wrong
   *  face because the merged WAV contained other speakers' voices. */
  audio_url?: string;
  /** v7: when true, MUST dispatch with coords + frame_number (no auto). */
  deterministic_coords?: boolean;
  status: "pending" | "lipsyncing" | "ready" | "failed";
  sync_job_id?: string;
  output_url?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
  last_deferred_at?: string;
  retry_count?: number;
  /** When true, the next dispatch MUST use the coords+frame_number fallback
   *  path instead of auto_detect. */
  force_coords?: boolean;
  /** Optional override for the Sync.so `frame_number` sample point. Used on
   *  retries to avoid the frame that originally triggered Sync.so's
   *  "unknown error" (cuts/blinks/motion blur at window start). */
  frame_number_override?: number;
  /** v9.1 Artlist parity: deterministic per-turn WAV slice (uploaded to
   *  `voiceover-audio/trimmed/`). Sync.so v2 only accepts `segments_secs`
   *  on video inputs, so we MUST pre-trim the audio upstream — otherwise
   *  Sync.so reads audio from t=0 (first sentence) while the video plays
   *  a later window → wrong-speaker / "unknown error". */
  trimmed_audio_url?: string;
  /** v10 Artlist-Style Preclip Pipeline: kurzer, server-side gerenderter
   *  MP4-Ausschnitt aus dem Master für genau diesen Turn (ab t=0).
   *  Sync.so bekommt diesen Clip OHNE `segments_secs` — das eliminiert
   *  die "An unknown error occurred"-Failures aus dem Segments-Pfad. */
  preclip_url?: string;
  preclip_status?: "pending" | "rendering" | "ready" | "failed";
  preclip_render_id?: string;
  preclip_started_at?: string;
  preclip_completed_at?: string;
  preclip_error?: string;
  preclip_retry_count?: number;
  /** Tracks which video source was used for the actual Sync.so dispatch.
   *  'preclip' = short clip ab t=0 (preferred). 'master' = legacy segments_secs. */
  sync_source_kind?: "preclip" | "master";
  /** Stufe B telemetry — populated by ensureNormalizedTurnAudio. */
  audio_dur_sec?: number;
  audio_lead_in_sec?: number;
  audio_peak_dbfs?: number | null;
}



interface DialogShotsState {
  version: 4;
  status: "queued" | "lipsyncing" | "stitching" | "done" | "failed";
  shots: DialogShot[];
  source_clip_url: string;
  master_audio_url: string;
  total_sec: number;
  cost_credits: number;
  refunded: boolean;
  started_at: string;
  video_width: number;
  video_height: number;
  final_url?: string | null;
  stitch?: { render_id: string; dispatched_at: string };
  finished_at?: string;
  error?: string;
}

function dispatchModeForShot(shot: DialogShot): "auto" | "coords" {
  return shot.target_coords && (shot.deterministic_coords === true || !!shot.force_coords)
    ? "coords"
    : "auto";
}

function isMultiSpeakerScene(allShots: DialogShot[]): boolean {
  return new Set(allShots.map((s) => s.speaker_idx)).size >= 2;
}

const ASSUMED_MASTER_FPS_CONST = 24;

/** Max provider retries per shot before we surrender.
 *  v13 (Sync.so Hardening): differentiated retry matrix — each attempt
 *  varies frame sampling, temperature AND (on attempt 3) the source kind
 *  (preclip → master+segments_secs). 4 strategies should bust through
 *  >95% of transient `unknown error` failures. */
const MAX_SHOT_RETRIES = 4;

/** Stable temperatures to cycle through on retries. Lower values are safer
 *  on short windows; higher values force more articulation on long windows. */
const RETRY_TEMPERATURES = [0.5, 0.35, 0.7, 0.4];

/** Pick a segment-relative sampling frame based on retry attempt.
 *  Attempt 1 = middle (default), 2 = 25%, 3 = 75%, 4 = 40%. */
function pickRetryFrame(segFrames: number, attempt: number): number {
  const positions = [0.5, 0.25, 0.75, 0.4, 0.6];
  const pos = positions[Math.min(attempt, positions.length - 1)];
  return Math.min(segFrames - 1, Math.max(0, Math.floor(segFrames * pos)));
}

function prepareShotRetry(
  shot: DialogShot,
  reason: string,
  allShots: DialogShot[],
): boolean {
  if ((shot.retry_count ?? 0) >= MAX_SHOT_RETRIES) return false;
  shot.retry_count = (shot.retry_count ?? 0) + 1;
  shot.status = "pending";
  shot.sync_job_id = undefined;
  shot.output_url = undefined;
  shot.started_at = undefined;
  shot.completed_at = undefined;
  shot.error = `retrying_after_${reason}`.slice(0, 300);

  const multi = isMultiSpeakerScene(allShots);
  const attempt = shot.retry_count; // 1-based after increment

  // v13 Differentiated Retry Matrix:
  //   attempt 1 → same source, new frame midFrame, lower temp
  //   attempt 2 → same source, alternate frame (25%), different temp
  //   attempt 3 → SWITCH source kind (preclip ↔ master) + re-trim audio,
  //               another alternate frame (75%)
  //   attempt 4 → SWITCH back, recompute trimmed audio fresh
  if (attempt === 3 || attempt === 4) {
    // Force a different transport path to escape provider sticky-failures
    if (shot.sync_source_kind === "preclip") {
      shot.sync_source_kind = "master";
      // Force re-render of preclip on next pass if we ever go back
      shot.preclip_url = undefined;
      shot.preclip_status = undefined;
      shot.preclip_render_id = undefined;
    } else {
      shot.sync_source_kind = "preclip";
    }
    // Invalidate trimmed audio cache so we re-trim with current padding logic
    shot.trimmed_audio_url = undefined;
    console.warn(
      `[poll-dialog-shots] turn ${shot.idx} ${reason} → retry ${attempt}/${MAX_SHOT_RETRIES} SWITCHED source_kind=${shot.sync_source_kind}`,
    );
  }

  // Multi-speaker + we have coords → NEVER drop to auto_detect. Auto-detect
  // in a two-shot frame routinely picks the wrong face. Cycle frame
  // sampling positions + temperature to escape provider "unknown error".
  if (multi && shot.target_coords) {
    shot.force_coords = true;
    shot.deterministic_coords = true;
    const [s, e] = (shot.render_window ?? shot.window) as [number, number];
    const segFrames = Math.max(1, Math.floor((e - s) * ASSUMED_MASTER_FPS_CONST));
    shot.frame_number_override = pickRetryFrame(segFrames, attempt);
    shot.temperature = RETRY_TEMPERATURES[(attempt) % RETRY_TEMPERATURES.length];
    console.warn(
      `[poll-dialog-shots] turn ${shot.idx} ${reason} → retry ${attempt}/${MAX_SHOT_RETRIES} coords-locked segRelFrame=${shot.frame_number_override}/${segFrames} temp=${shot.temperature}`,
    );
    return true;
  }

  const failedMode = dispatchModeForShot(shot);
  if (failedMode === "coords") {
    // Single-speaker scenes with coords: safe to fall back to auto_detect.
    shot.force_coords = false;
    shot.deterministic_coords = false;
    console.warn(`[poll-dialog-shots] turn ${shot.idx} ${reason} → retry ${attempt} with auto_detect fallback`);
  } else if (shot.target_coords) {
    shot.force_coords = true;
    console.warn(`[poll-dialog-shots] turn ${shot.idx} ${reason} → retry ${attempt} with coords fallback`);
  } else {
    console.warn(`[poll-dialog-shots] turn ${shot.idx} ${reason} → retry ${attempt} with auto_detect`);
  }
  return true;
}

function markShotTerminalFailed(shot: DialogShot, error: string) {
  shot.status = "failed";
  shot.error = error.slice(0, 300);
  shot.completed_at = new Date().toISOString();
}

/** v13: Graceful degrade is ONLY safe for single-speaker scenes. For
 *  multi-speaker dialogs, a turn without `output_url` means that sentence
 *  has NO lip-sync at all — shipping that as "done" produced silent-mouth
 *  videos. Multi-speaker degrade now hard-fails the scene + triggers an
 *  idempotent credit refund. The caller decides per-scene which path to use. */
function degradeShotToMaster(shot: DialogShot, error: string, allShots: DialogShot[]) {
  if (isMultiSpeakerScene(allShots)) {
    // Hard fail — caller will refund and surface the scene as failed.
    markShotTerminalFailed(shot, `multi_speaker_no_degrade: ${error}`);
    return;
  }
  shot.status = "ready";
  (shot as any).degraded = true;
  shot.output_url = undefined;
  shot.error = `degraded_to_master: ${error}`.slice(0, 300);
  shot.completed_at = new Date().toISOString();
}

// ── Sync.so dispatch ────────────────────────────────────────────────────

/** Expand a turn's single window with pre-roll/tail, clamping each side
 *  to the nearest neighbour boundary across ALL turns so a pre-roll/tail
 *  can never bleed into another turn's region. */
function expandWindow(
  shot: DialogShot,
  allShots: DialogShot[],
): [number, number] {
  const [start, end] = shot.window;
  const others = allShots.filter((s) => s.idx !== shot.idx).map((s) => s.window);
  const prevEnd = others
    .filter(([, e]) => e <= start)
    .reduce((m, [, e]) => Math.max(m, e), 0);
  const nextStart = others
    .filter(([s]) => s >= end)
    .reduce((m, [s]) => Math.min(m, s), Number.POSITIVE_INFINITY);
  const maxLeadIn = Math.min(SYNC_LEAD_IN_SEC, Math.max(0, (start - prevEnd) / 2));
  const maxTail = Number.isFinite(nextStart)
    ? Math.min(SYNC_TAIL_SEC, Math.max(0, (nextStart - end) / 2))
    : SYNC_TAIL_SEC;
  let w0 = Math.max(0, start - maxLeadIn);
  let w1 = end + maxTail;
  // v13 Sync.so Hardening: Sync.so's `lipsync-2-pro` is unstable on very
  // short clips (<3s) — short windows correlate strongly with
  // "An unknown error occurred". Force a minimum 3.0s window by widening
  // toward neighbour boundaries (capped at mid-gap so we never bleed into
  // an adjacent turn's region).
  const MIN_WIN_SEC = 3.0;
  if (w1 - w0 < MIN_WIN_SEC) {
    const need = MIN_WIN_SEC - (w1 - w0);
    const leftRoom = Math.max(0, (w0 - prevEnd) / 2);
    const rightRoom = Number.isFinite(nextStart)
      ? Math.max(0, (nextStart - w1) / 2)
      : need;
    const addLeft = Math.min(need / 2, leftRoom);
    const addRight = Math.min(need - addLeft, rightRoom);
    w0 = Math.max(0, w0 - addLeft);
    w1 = w1 + addRight;
  }
  return [w0, w1];
}

// ───────────────────────────────────────────────────────────────────────
// WAV pre-trim + Stufe B normalize (v14 Sync.so input hardening)
// ───────────────────────────────────────────────────────────────────────
//
// Sync.so v2 only accepts `segments_secs` on VIDEO inputs. The audio is
// always read from t=0 of whatever URL we pass. So when a per-speaker WAV
// contains multiple turns we MUST slice the WAV to the exact turn window
// before dispatch — otherwise Sync.so would map shot K>0 to the speaker's
// FIRST sentence (wrong mouth shapes / "unknown error").
//
// v14 (Stufe B): in addition to slicing, every dispatched WAV now goes
// through `normalizeWav()` which:
//   – mono-downmixes,
//   – peak-normalizes to -1 dBFS (fixes "audio too quiet → VAD silent"),
//   – prepends 0.25s lead-in silence (fixes "speech starts exactly at
//     t=0" which Sync.so VAD fails on),
//   – pads tail to a minimum 3.0s total length.
// Cache namespace bumped to `trimmed-v14` so any older un-normalized
// WAVs cannot be re-served from storage.

const AUDIO_LEAD_IN_SEC = 0.25;
const AUDIO_MIN_TOTAL_SEC = 3.0;
const AUDIO_PEAK_TARGET_DBFS = -1;

function sliceWavToWindow(wav: Uint8Array, windowSec: [number, number]): Uint8Array {
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) {
    throw new Error("Not a RIFF/WAVE file");
  }
  let off = 12;
  let audioFormat = 1, channels = 1, sampleRate = 44100, bitsPerSample = 16;
  let dataOff = -1, dataLen = 0;
  while (off + 8 <= wav.byteLength) {
    const id = dv.getUint32(off, false);
    const size = dv.getUint32(off + 4, true);
    if (id === 0x666d7420) {
      audioFormat = dv.getUint16(off + 8, true);
      channels = dv.getUint16(off + 10, true);
      sampleRate = dv.getUint32(off + 12, true);
      bitsPerSample = dv.getUint16(off + 22, true);
    } else if (id === 0x64617461) {
      dataOff = off + 8;
      dataLen = size;
      break;
    }
    off += 8 + size + (size & 1);
  }
  if (dataOff < 0) throw new Error("WAV missing data chunk");
  if (audioFormat !== 1 || bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV: format=${audioFormat} bits=${bitsPerSample}`);
  }
  const bytesPerFrame = channels * (bitsPerSample / 8);
  const totalFrames = Math.floor(dataLen / bytesPerFrame);

  const [s0, s1] = windowSec;
  const startFrame = Math.max(0, Math.floor(s0 * sampleRate));
  const endFrame = Math.min(totalFrames, Math.ceil(s1 * sampleRate));
  if (endFrame <= startFrame) throw new Error(`empty slice ${s0}-${s1}`);

  const sliceByteOff = dataOff + startFrame * bytesPerFrame;
  const sliceByteLen = (endFrame - startFrame) * bytesPerFrame;
  const sliceBytes = wav.subarray(sliceByteOff, sliceByteOff + sliceByteLen);

  // Re-pack the raw slice as a fresh RIFF/WAVE. Normalization (lead-in,
  // peak, min-dur, mono) happens in a separate pass via normalizeWav().
  const outBuf = new ArrayBuffer(44 + sliceByteLen);
  const ov = new DataView(outBuf);
  ov.setUint32(0, 0x52494646, false);
  ov.setUint32(4, 36 + sliceByteLen, true);
  ov.setUint32(8, 0x57415645, false);
  ov.setUint32(12, 0x666d7420, false);
  ov.setUint32(16, 16, true);
  ov.setUint16(20, 1, true);
  ov.setUint16(22, channels, true);
  ov.setUint32(24, sampleRate, true);
  ov.setUint32(28, sampleRate * bytesPerFrame, true);
  ov.setUint16(32, bytesPerFrame, true);
  ov.setUint16(34, bitsPerSample, true);
  ov.setUint32(36, 0x64617461, false);
  ov.setUint32(40, sliceByteLen, true);
  new Uint8Array(outBuf, 44, sliceByteLen).set(sliceBytes);
  return new Uint8Array(outBuf);
}

interface PreparedAudio {
  url: string;
  durSec: number;
  leadInSec: number;
  peakDbFs: number;
  channels: number;
  sampleRate: number;
  bytes: number;
  voicedRatio: number;
  longestVoicedRun: number;
}

const MIN_VOICED_RATIO = 0.15;
const MIN_LONGEST_VOICED_RUN_SEC = 0.4;

async function ensureNormalizedTurnAudio(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sceneId: string,
  shot: DialogShot,
  sourceAudioUrl: string,
  windowSec: [number, number],
): Promise<PreparedAudio> {
  const winTag = `${windowSec[0].toFixed(3)}-${windowSec[1].toFixed(3)}`;
  // v14: bump cache namespace so any pre-Stufe-B trimmed WAVs don't get served.
  const path = `${userId}/twoshot-vo/trimmed-v14/${sceneId}-turn${shot.idx}-${winTag}.wav`;

  // Fast path: reuse if already in storage AND we still have stats on the shot.
  const { data: existing } = supabase.storage.from("voiceover-audio").getPublicUrl(path);
  if (shot.trimmed_audio_url === existing.publicUrl && shot.audio_dur_sec) {
    try {
      const head = await fetch(existing.publicUrl, { method: "HEAD" });
      if (head.ok) {
        return {
          url: existing.publicUrl,
          durSec: Number(shot.audio_dur_sec) || 0,
          leadInSec: Number(shot.audio_lead_in_sec) || 0,
          peakDbFs: Number(shot.audio_peak_dbfs) || 0,
          channels: 1,
          sampleRate: 24000,
          bytes: Number(head.headers.get("content-length") ?? "0") || 0,
          voicedRatio: Number((shot as any).audio_voiced_ratio ?? 1),
          longestVoicedRun: Number((shot as any).audio_longest_voiced_run ?? 0),
        };
      }
    } catch { /* fall through to regenerate */ }
  }

  const res = await fetch(sourceAudioUrl);
  if (!res.ok) throw new Error(`fetch audio ${res.status}`);
  const wav = new Uint8Array(await res.arrayBuffer());
  const sliced = sliceWavToWindow(wav, windowSec);
  // Stufe B: normalize → mono, peak -1 dBFS, 0.25s lead-in, min 3.0s.
  const normalized = normalizeWav(sliced, {
    leadInSec: AUDIO_LEAD_IN_SEC,
    minTotalSec: AUDIO_MIN_TOTAL_SEC,
    peakDbFs: AUDIO_PEAK_TARGET_DBFS,
    forceMono: true,
  });

  // Stage E.1: VAD on the SLICED (pre-pad) signal so 0.25s lead-in & tail
  // padding don't poison the ratio.
  let vad = { voicedRatio: 1, longestVoicedRun: 0, voicedSec: 0, totalSec: 0 } as
    ReturnType<typeof detectVoicedFrames>;
  try {
    vad = detectVoicedFrames(sliced);
  } catch (e) {
    console.warn(`[poll-dialog-shots] turn ${shot.idx} VAD inspect failed: ${(e as Error).message}`);
  }

  const { error } = await supabase.storage
    .from("voiceover-audio")
    .upload(path, normalized.bytes, { contentType: "audio/wav", upsert: true });
  if (error) throw new Error(`upload ${error.message}`);
  const { data: pub } = supabase.storage.from("voiceover-audio").getPublicUrl(path);

  // Cache stats on the shot so subsequent ticks skip the re-inspect.
  shot.trimmed_audio_url = pub.publicUrl;
  shot.audio_dur_sec = normalized.info.durSec;
  shot.audio_lead_in_sec = normalized.info.leadInSec;
  shot.audio_peak_dbfs = Number.isFinite(normalized.info.peakDbFs)
    ? normalized.info.peakDbFs
    : null;
  (shot as any).audio_voiced_ratio = vad.voicedRatio;
  (shot as any).audio_longest_voiced_run = vad.longestVoicedRun;

  console.log(
    `[poll-dialog-shots] turn ${shot.idx} audio normalized path=${path} bytes=${normalized.bytes.byteLength} dur=${normalized.info.durSec.toFixed(2)}s peak=${Number.isFinite(normalized.info.peakDbFs) ? normalized.info.peakDbFs.toFixed(1) : "silent"}dBFS leadIn=${normalized.info.leadInSec.toFixed(3)}s gain=${normalized.appliedGain.toFixed(2)}x voiced=${(vad.voicedRatio * 100).toFixed(0)}% longestRun=${vad.longestVoicedRun.toFixed(2)}s`,
  );
  return {
    url: pub.publicUrl,
    durSec: normalized.info.durSec,
    leadInSec: normalized.info.leadInSec,
    peakDbFs: Number.isFinite(normalized.info.peakDbFs) ? normalized.info.peakDbFs : -Infinity,
    channels: 1,
    sampleRate: normalized.info.sampleRate,
    bytes: normalized.bytes.byteLength,
    voicedRatio: vad.voicedRatio,
    longestVoicedRun: vad.longestVoicedRun,
  };
}




/** Default fps assumption for Hailuo i2v master clips. Used to map a turn's
 *  start time to a `frame_number` so Sync.so samples coords INSIDE the
 *  turn window, not at frame 0 of the master video. */
const ASSUMED_MASTER_FPS = 24;
async function startSyncTurnJob(
  apiKey: string,
  videoUrl: string,
  audioUrl: string,
  window: [number, number],
  coords: [number, number] | null,
  temperature: number,
  turnIdx?: number,
  /** 'auto' = let Sync.so detect the active speaker inside the segment
   *  window (robust against camera moves, recommended primary).
   *  'coords' = use fixed pixel coords + frame_number aligned to the
   *  turn start (deterministic fallback when auto_detect fails). */
  mode: "auto" | "coords" = "auto",
  /** Optional Sync.so webhook URL (B.1 Stage 5). When set, Sync.so will POST
   *  the terminal status to this URL — cuts per-shot completion latency from
   *  ~60s (cron tick) down to ~1s. pg_cron polling stays as safety net. */
  webhookUrl?: string,
  /** Optional override for the `frame_number` coord-sampling point. Used on
   *  retries to step away from the original failing frame (cuts/blinks).
   *  Must be SEGMENT-RELATIVE (0 = first frame of the trimmed segment). */
  frameNumberOverride?: number,
  /** v10 Artlist Pipeline: when true, the video is ALREADY a short pre-clip
   *  starting at t=0 (rendered via DialogTurnClipVideo). We MUST NOT send
   *  `segments_secs` on it — Sync.so would otherwise try to clip an already
   *  trimmed video and fail with "An unknown error occurred". */
  noSegments: boolean = false,
): Promise<string> {
  // v12 Stability: temperature konservativ geclamped (≤0.5); occlusion-detection
  // wieder entfernt — es korrelierte mit erhöhter Sync.so-Failrate (sync_FAILED).
  // Smoothness wird über DialogStitchVideo-Crossfade abgedeckt.
  const smoothTemp = Math.min(Math.max(temperature, 0.2), 0.5);
  const options: Record<string, unknown> = {
    output_format: "mp4",
    sync_mode: "cut_off",
    temperature: smoothTemp,
  };
  // Determine the segment length in frames for frame_number clamping. For
  // preclips the segment is the whole clip starting at t=0.
  const segDurSec = noSegments ? Math.max(0.1, window[1] - window[0]) : (window[1] - window[0]);
  const segFrames = Math.max(1, Math.floor(segDurSec * ASSUMED_MASTER_FPS));
  if (mode === "coords" && coords) {
    const rawFrame = Number.isFinite(frameNumberOverride as number)
      ? Math.max(0, Math.round(frameNumberOverride as number))
      : Math.max(0, Math.floor(segFrames / 2));
    const frameNumber = Math.min(segFrames - 1, rawFrame);
    options.active_speaker_detection = {
      auto_detect: false,
      frame_number: frameNumber,
      coordinates: coords,
    };
  } else {
    options.active_speaker_detection = { auto_detect: true };
  }

  // Video input: für Preclips OHNE segments_secs (kompletter Clip ist der
  // Turn), für Master MIT segments_secs (Legacy/Fallback-Pfad).
  const videoInput: Record<string, unknown> = { type: "video", url: videoUrl };
  if (!noSegments) videoInput.segments_secs = [window];

  const payload: Record<string, unknown> = {
    model: LIPSYNC_MODEL,
    input: [
      videoInput,
      // Audio bleibt sample-genau auf das Turn-Fenster vorgetrimmt; bei
      // Preclips ist das ohnehin Pflicht, weil Sync.so kein `segments_secs`
      // auf Audio-Inputs unterstützt.
      { type: "audio", url: audioUrl },
    ],
    options,
  };




  if (webhookUrl) {
    // Sync.so v2 accepts `webhookUrl` (camelCase). Include `webhook_url` too
    // for forward-compat. Unknown fields are ignored by the API.
    payload.webhookUrl = webhookUrl;
    (payload as any).webhook_url = webhookUrl;
  }
  console.log(
    `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} mode=${mode} window=[${window[0].toFixed(3)},${window[1].toFixed(3)}] dur=${(window[1] - window[0]).toFixed(3)}s coords=${JSON.stringify(coords)} payload=${JSON.stringify(payload).slice(0, 800)}`,
  );

  let r = await fetch(`${SYNC_API_BASE}/generate`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  // Always surface rate-limit headers so we can detect plan throttling.
  const rl = {
    limit: r.headers.get("x-ratelimit-limit"),
    remaining: r.headers.get("x-ratelimit-remaining"),
    reset: r.headers.get("x-ratelimit-reset"),
    retryAfter: r.headers.get("retry-after"),
  };
  if (rl.limit || rl.remaining || rl.retryAfter) {
    console.log(
      `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} status=${r.status} rate-limit=${JSON.stringify(rl)}`,
    );
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    if (r.status === 429) {
      console.warn(
        `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} deferred_due_to_concurrency retryAfter=${rl.retryAfter ?? "?"} body=${txt.slice(0, 500)}`,
      );
      throw new SyncConcurrencyDeferredError(
        `sync.so concurrency limit: ${txt.slice(0, 240)}`,
        rl.retryAfter,
      );
    }
    console.error(
      `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} FAILED status=${r.status} body=${txt.slice(0, 1500)}`,
    );
    // Fallback: retry without segments_secs if Sync.so rejects the window.
    if (
      r.status === 400 &&
      /segments? configuration is invalid|only supported for video inputs|invalid.+segment/i.test(txt)
    ) {
      console.warn(
        `[poll-dialog-shots] segment rejected, retry without window: ${txt.slice(0, 200)}`,
      );
      const fallback = { ...payload };
      (fallback.input as any[])[0] = { type: "video", url: videoUrl };
      (fallback.input as any[])[1] = { type: "audio", url: audioUrl };
      r = await fetch(`${SYNC_API_BASE}/generate`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(fallback),
      });
      if (!r.ok) {
        const t2 = await r.text().catch(() => "");
        console.error(
          `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} fallback-FAILED status=${r.status} body=${t2.slice(0, 1500)}`,
        );
        throw new Error(`sync.so create ${r.status}: ${t2.slice(0, 300)}`);
      }
    } else {
      throw new Error(`sync.so create ${r.status}: ${txt.slice(0, 300)}`);
    }
  }

  const data = await r.json();
  console.log(
    `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} OK job_id=${data.id} status=${data.status ?? "?"}`,
  );
  return String(data.id);
}

async function pollSyncJob(
  apiKey: string,
  jobId: string,
): Promise<{ status: string; outputUrl?: string; error?: string }> {
  const r = await fetch(`${SYNC_API_BASE}/generate/${jobId}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    console.error(
      `[poll-dialog-shots] POLL ${jobId} http-error status=${r.status} body=${txt.slice(0, 600)}`,
    );
    return { status: "FAILED", error: `poll ${r.status}: ${txt.slice(0, 200)}` };
  }
  const data = await r.json();
  const status = String(data.status ?? "UNKNOWN");
  // On FAILED/REJECTED/CANCELED, dump the FULL body so we can finally diagnose
  // Sync.so's opaque "unknown error" responses.
  if (["FAILED", "REJECTED", "CANCELED"].includes(status)) {
    console.error(
      `[poll-dialog-shots] POLL ${jobId} terminal=${status} body=${JSON.stringify(data).slice(0, 1500)}`,
    );
  }
  // Robust error extraction — Sync.so spreads error info across many shapes.
  const inputErrors = Array.isArray(data.input)
    ? data.input
        .map((i: any, idx: number) => (i?.error ? `input[${idx}]:${i.error}` : null))
        .filter(Boolean)
        .join("; ")
    : "";
  const errorMsg =
    data.error ??
    data.errorMessage ??
    data.error_message ??
    data.failureReason ??
    data.failure_reason ??
    data.error_detail ??
    data.errorDetail ??
    data.message ??
    (inputErrors || undefined) ??
    (["FAILED", "REJECTED", "CANCELED"].includes(status)
      ? `body:${JSON.stringify(data).slice(0, 240)}`
      : undefined);
  return {
    status,
    outputUrl: data.outputUrl ?? data.output_url ?? undefined,
    error: errorMsg,
  };
}

async function refundIfNeeded(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  state: DialogShotsState,
): Promise<DialogShotsState> {
  if (state.refunded || !state.cost_credits) return state;
  try {
    const { data: w } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();
    if (w) {
      await supabase
        .from("wallets")
        .update({
          balance: Number(w.balance ?? 0) + state.cost_credits,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }
  } catch (e) {
    console.warn("[poll-dialog-shots] refund failed", (e as Error).message);
  }
  return { ...state, refunded: true };
}

// ── Lambda-side stitch (replaces forbidden Edge-Runtime ffmpeg) ────────
//
// poll-dialog-shots used to run `ffmpeg` via Deno.Command to time-slice
// per-turn outputs against the master plate and remux the WAV. Supabase
// Edge Runtime forbids spawning subprocesses ("Spawning subprocesses is
// not allowed on Supabase Edge Runtime."), so the stitch step now runs
// inside AWS Lambda via the DialogStitchVideo Remotion composition.
//
// We just delegate to render-dialog-stitch, which:
//   1. creates a video_renders row,
//   2. invokes Remotion Lambda with the composition,
//   3. lets remotion-webhook write the final clip_url back to the scene.
async function dispatchDialogStitch(
  supabase: ReturnType<typeof createClient>,
  sceneId: string,
): Promise<{ ok: true; render_id: string } | { ok: false; error: string; code?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resp = await fetch(`${supabaseUrl}/functions/v1/render-dialog-stitch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ sceneId }),
  });
  const raw = await resp.text().catch(() => "");
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!resp.ok) {
    const errStr = (data?.error ?? raw).toString();
    const code =
      data?.code === "aws_credentials_missing" ||
      /security token included in the request is invalid|unrecognizedclientexception|invalidsignatureexception|expiredtoken|http 403|aws_credentials/i.test(errStr)
        ? "aws_credentials_invalid"
        : undefined;
    return { ok: false, error: `render-dialog-stitch ${resp.status}: ${errStr.slice(0, 260)}`, code };
  }
  if (data && (data as any).render_id) {
    return { ok: true, render_id: String((data as any).render_id) };
  }
  return {
    ok: false,
    error: `unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
  };
}

// ── Per-scene processor ─────────────────────────────────────────────────

async function processScene(
  supabase: ReturnType<typeof createClient>,
  syncKey: string,
  sceneId: string,
): Promise<{ status: string; mutated: boolean }> {
  const { data: scene } = await supabase
    .from("composer_scenes")
    .select(
      "id, project_id, dialog_shots, lip_sync_applied_at, clip_url, lip_sync_source_clip_url",
    )
    .eq("id", sceneId)
    .single();
  if (!scene) return { status: "not_found", mutated: false };
  if (scene.lip_sync_applied_at) return { status: "already_done", mutated: false };

  const state = (scene.dialog_shots ?? null) as DialogShotsState | null;
  if (!state) return { status: "no_state", mutated: false };
  if (state.version !== 4) {
    // Legacy v1/v2/v3 state — ignore; user must reset via UI to migrate.
    return { status: `legacy_v${(state as any).version ?? "?"}_ignored`, mutated: false };
  }
  if (state.status === "done" || state.status === "failed") {
    return { status: state.status, mutated: false };
  }

  const { data: project } = await supabase
    .from("composer_projects")
    .select("user_id")
    .eq("id", scene.project_id)
    .single();
  const userId = project?.user_id;

  const shots = state.shots.map((s) => ({ ...s }));
  let mutated = false;
  let newState: DialogShotsState = { ...state, shots };

  // ── Step 1: poll every in-flight shot in parallel ───────────────────
  const inFlight = shots.filter((s) => s.status === "lipsyncing" && s.sync_job_id);
  if (inFlight.length > 0) {
    const polled = await Promise.allSettled(
      inFlight.map((s) => pollSyncJob(syncKey, s.sync_job_id!)),
    );
    polled.forEach((res, i) => {
      const shot = inFlight[i];
      if (res.status !== "fulfilled") {
        console.warn(
          `[poll-dialog-shots] turn ${shot.idx} poll error`,
          (res.reason as Error)?.message,
        );
        return;
      }
      const p = res.value;
      if (p.status === "COMPLETED" && p.outputUrl) {
        shot.output_url = p.outputUrl;
        shot.status = "ready";
        shot.completed_at = new Date().toISOString();
        mutated = true;
      } else if (["FAILED", "REJECTED", "CANCELED"].includes(p.status)) {
        if (!prepareShotRetry(shot, `sync_${p.status}`, shots)) {
          degradeShotToMaster(shot, `sync_${p.status}: ${p.error ?? "unknown"}`, shots);
        }
        mutated = true;
      }

    });

    // ── Step 1b: per-shot 4-min watchdog (v12 Stability) ─────────────
    // Sync.so jobs that don't finish in ~4 min are functionally dead —
    // they used to block the whole stitch for 15 min. Now we degrade fast.
    const PER_SHOT_TIMEOUT_MS = 4 * 60 * 1000;
    for (const shot of shots) {
      if (shot.status !== "lipsyncing" || !shot.started_at) continue;
      const ageMs = Date.now() - Date.parse(shot.started_at);
      if (!Number.isFinite(ageMs) || ageMs <= PER_SHOT_TIMEOUT_MS) continue;
      const timeoutReason = `sync_so_timeout_4min: job ${shot.sync_job_id ?? "?"} stuck ${Math.round(ageMs / 1000)}s`;
      if (!prepareShotRetry(shot, "sync_so_timeout_4min", shots)) {
        degradeShotToMaster(shot, timeoutReason, shots);
      }
      mutated = true;
      console.warn(
        `[poll-dialog-shots] turn ${shot.idx} sync_so_timeout_4min job=${shot.sync_job_id} ageMs=${ageMs}`,
      );
    }
  }

  // Webhook URL for B.1 — Sync.so will POST terminal status here, cutting
  // poll latency from ~60s (cron) to ~1s. The shared secret comes from
  // WEBHOOK_SHARED_SECRET via appendWebhookToken (same scheme as Remotion).
  const supabaseUrl0 = Deno.env.get("SUPABASE_URL") ?? "";
  const syncWebhookUrl = supabaseUrl0
    ? appendWebhookToken(`${supabaseUrl0}/functions/v1/sync-so-webhook?scene_id=${sceneId}`)
    : undefined;


  // ── Step 2: dispatch pending shots (v9 Artlist-style, NO chaining) ──
  // Every turn is lipsynced on the ORIGINAL pristine master plate with its
  // own isolated speaker WAV. Turns are independent → no chaining, no
  // re-encode generation stacking, no risk of a later pass overwriting an
  // earlier speaker's mouth animation. The deterministic Lambda stitch
  // (DialogStitchVideo) recombines them by timeline window afterwards.
  //
  // We dispatch strictly serial per scene: if any turn is still lipsyncing,
  // no new turn starts. This matches Artlist-style provider-pool behavior and
  // avoids Sync.so concurrency/race failures.
  const sortedShots = [...shots].sort((a, b) => a.idx - b.idx);
  const stillInFlight = sortedShots.some((s) => s.status === "lipsyncing" && s.sync_job_id);
  if (stillInFlight) {
    if (mutated) {
      newState = { ...newState, shots, status: "lipsyncing" };
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: newState,
          lip_sync_status: "running",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return { status: "lipsyncing", mutated: true };
    }
    return { status: "lipsyncing", mutated: false };
  }
  // ── Step 2a: trigger per-turn Preclips (v10 Artlist Pipeline) ──────
  // Bevor wir Sync.so anrufen, materialisieren wir jeden Turn als kurzen
  // MP4-Clip ab t=0 via Remotion Lambda (`DialogTurnClipVideo`). Damit
  // muss Sync.so kein langes Master mit `segments_secs` intern auseinander-
  // schneiden — der häufigste Auslöser für "An unknown error occurred".
  const MAX_PRECLIP_RETRIES = 1;
  const PRECLIP_RENDER_TIMEOUT_MS = 4 * 60 * 1000;
  const pendingForPreclip = sortedShots.filter(
    (s) => s.status === "pending" && !s.preclip_url,
  );
  for (const shot of pendingForPreclip) {
    if (!shot.render_window) {
      shot.render_window = expandWindow(shot, shots);
      mutated = true;
    }
    // Watchdog for stuck preclip renders.
    if (shot.preclip_status === "rendering" && shot.preclip_started_at) {
      const ageMs = Date.now() - Date.parse(shot.preclip_started_at);
      if (Number.isFinite(ageMs) && ageMs > PRECLIP_RENDER_TIMEOUT_MS) {
        shot.preclip_status = "failed";
        shot.preclip_render_id = undefined;
        shot.preclip_error = `preclip_timeout_${Math.round(ageMs / 1000)}s`;
        mutated = true;
      }
    }
    if (shot.preclip_status === "rendering") continue;
    if (shot.preclip_status === "failed") {
      const tries = Number(shot.preclip_retry_count) || 0;
      if (tries >= MAX_PRECLIP_RETRIES) {
        // Fall back to legacy master+segments_secs path for this shot.
        console.warn(
          `[poll-dialog-shots] turn ${shot.idx} preclip exhausted (${tries} tries) — falling back to master+segments_secs`,
        );
        shot.sync_source_kind = "master";
        mutated = true;
        continue;
      }
    }
    // Dispatch a new preclip render.
    try {
      const resp = await fetch(`${supabaseUrl0}/functions/v1/render-dialog-turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
        },
        body: JSON.stringify({ sceneId, shotIdx: shot.idx }),
      });
      if (resp.ok) {
        shot.preclip_status = "rendering";
        shot.preclip_started_at = shot.preclip_started_at || new Date().toISOString();
        mutated = true;
        console.log(
          `[poll-dialog-shots] turn ${shot.idx} preclip dispatched window=[${shot.render_window![0].toFixed(2)},${shot.render_window![1].toFixed(2)}]`,
        );
      } else {
        const t = await resp.text().catch(() => "");
        shot.preclip_status = "failed";
        shot.preclip_error = `dispatch ${resp.status}: ${t.slice(0, 180)}`;
        shot.preclip_retry_count = (Number(shot.preclip_retry_count) || 0) + 1;
        mutated = true;
        console.warn(
          `[poll-dialog-shots] turn ${shot.idx} preclip dispatch failed ${resp.status}: ${t.slice(0, 240)}`,
        );
      }
    } catch (e) {
      shot.preclip_status = "failed";
      shot.preclip_error = `dispatch crash: ${(e as Error)?.message ?? "unknown"}`;
      shot.preclip_retry_count = (Number(shot.preclip_retry_count) || 0) + 1;
      mutated = true;
    }
  }

  // ── Step 2b: dispatch pending shots (v10 Artlist-style) ────────────
  // Standard: preclip_url + noSegments=true (kurzer Clip ab t=0).
  // Fallback: master + segments_secs (Legacy-Pfad nach preclip-Erschöpfung
  // oder bei `sync_source_kind='master'`).
  const pending = sortedShots.filter((s) => {
    if (s.status !== "pending") return false;
    // Block until preclip ready OR fallback explicitly chosen.
    if (s.sync_source_kind === "master") return true;
    return !!s.preclip_url;
  });
  let dispatchedThisTick = 0;
  for (const nextShot of pending) {
    if (dispatchedThisTick >= MAX_NEW_SYNC_JOBS_PER_SCENE_PER_TICK) break;
    try {
      const usePreclip = !!nextShot.preclip_url && nextShot.sync_source_kind !== "master";
      const sourceUrl = usePreclip ? (nextShot.preclip_url as string) : state.source_clip_url;
      const win = (nextShot.render_window
        ?? expandWindow(nextShot, shots)) as [number, number];
      nextShot.render_window = win;
      // For preclips the Sync.so video starts at t=0, so we pass a
      // synthetic [0, dur] window for frame_number/audio length sizing.
      const dispatchWindow: [number, number] = usePreclip
        ? [0, Math.max(0.1, win[1] - win[0])]
        : win;
      nextShot.sync_source_kind = usePreclip ? "preclip" : "master";

      const mode = dispatchModeForShot(nextShot);
      const fullAudioUrl = nextShot.audio_url || state.master_audio_url;
      // Stufe B: audio is always normalized (mono, peak -1 dBFS, 0.25s lead-in,
      // min 3.0s tail-padded) — eliminates the most frequent Sync.so reject
      // causes (silence at t=0, audio too short, audio too quiet).
      let audioUrl = fullAudioUrl;
      let preparedAudio: PreparedAudio | null = null;
      let audioTrimmed = false;
      if (nextShot.audio_url && userId) {
        try {
          preparedAudio = await ensureNormalizedTurnAudio(
            supabase,
            userId,
            sceneId,
            nextShot,
            fullAudioUrl,
            win,
          );
          audioUrl = preparedAudio.url;
          audioTrimmed = true;
        } catch (trimErr) {
          console.warn(
            `[poll-dialog-shots] turn ${nextShot.idx} normalize FAILED, falling back to full track: ${(trimErr as Error)?.message}`,
          );
          audioUrl = fullAudioUrl;
        }
      }

      // Stufe B: HEAD-probe both assets before paying Sync.so. A 4xx/5xx
      // or absurdly small URL is a guaranteed "unknown error" otherwise.
      const [videoProbe, audioProbe] = await Promise.all([
        probeAsset(sourceUrl, "video", 50_000),
        probeAsset(audioUrl, "audio", 5_000),
      ]);
      if (!videoProbe.ok || !audioProbe.ok) {
        const reason = !videoProbe.ok
          ? `preflight_video_${videoProbe.error}`
          : `preflight_audio_${audioProbe.error}`;
        console.warn(
          `[poll-dialog-shots] turn ${nextShot.idx} PREFLIGHT BLOCK ${reason} video=${JSON.stringify(videoProbe)} audio=${JSON.stringify(audioProbe)}`,
        );
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          user_id: userId ?? null,
          engine: "cinematic-sync",
          turn_idx: nextShot.idx,
          attempt: nextShot.retry_count ?? 0,
          mode,
          sync_source_kind: nextShot.sync_source_kind ?? null,
          video_url: sourceUrl,
          audio_url: audioUrl,
          video_bytes: videoProbe.bytes,
          audio_bytes: audioProbe.bytes,
          video_content_type: videoProbe.contentType,
          audio_content_type: audioProbe.contentType,
          audio_dur_sec: preparedAudio?.durSec ?? null,
          audio_lead_in_sec: preparedAudio?.leadInSec ?? null,
          audio_peak_dbfs: preparedAudio?.peakDbFs ?? null,
          audio_channels: preparedAudio?.channels ?? null,
          audio_sample_rate: preparedAudio?.sampleRate ?? null,
          window_start_sec: dispatchWindow[0],
          window_end_sec: dispatchWindow[1],
          coords: nextShot.target_coords ?? null,
          frame_number: nextShot.frame_number_override ?? null,
          http_status: videoProbe.status || audioProbe.status,
          sync_status: "PREFLIGHT_BLOCKED",
          error_class: reason,
          error_message: `video=${videoProbe.error ?? "ok"} audio=${audioProbe.error ?? "ok"}`,
        });
        if (!prepareShotRetry(nextShot, reason, shots)) {
          degradeShotToMaster(nextShot, reason, shots);
        }
        mutated = true;
        continue;
      }

      // ── Stufe D: Face validation gate (coords mode only) ──────────
      // Before paying Sync.so for a `mode=coords` dispatch, verify a
      // face is actually visible at the requested frame. If not, shift
      // the frame by ±8/±16/±24 until we find one. After 3 shifts,
      // retry via prepareShotRetry which flips sync_source_kind.
      if (mode === "coords" && nextShot.target_coords) {
        const fpsHint = 24;
        const baseFrame = nextShot.frame_number_override
          ?? Math.round(((dispatchWindow[0] + dispatchWindow[1]) / 2) * fpsHint);
        const offsets = [0, -8, +8, -16, +16, -24, +24];
        let validFrame: number | null = null;
        let lastValidation: Awaited<ReturnType<typeof validateFrameFace>> | null = null;
        for (const off of offsets) {
          const tryFrame = Math.max(0, baseFrame + off);
          const v = await validateFrameFace({
            supabaseUrl: supabaseUrl0,
            serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            videoUrl: sourceUrl,
            frameNumber: tryFrame,
            fps: fpsHint,
            targetCoords: nextShot.target_coords,
          });
          lastValidation = v;
          // If validator itself failed (network/Gemini), do NOT block.
          if (!v.ok) break;
          // Permissive: faceVisible AND (no coords check OR coordsMatch)
          if (v.faceVisible && (v.coordsMatch === null || v.coordsMatch === true)) {
            validFrame = tryFrame;
            break;
          }
        }
        if (validFrame === null && lastValidation?.ok) {
          // No face anywhere near the configured frame → retry/flip source kind
          const reason = "face_validation_failed";
          console.warn(
            `[poll-dialog-shots] turn ${nextShot.idx} FACE-GATE blocked at baseFrame=${baseFrame} faces=${lastValidation.faceCount} coordsMatch=${lastValidation.coordsMatch}`,
          );
          await logSyncDispatch(supabase, {
            scene_id: sceneId,
            user_id: userId ?? null,
            engine: "cinematic-sync",
            turn_idx: nextShot.idx,
            attempt: nextShot.retry_count ?? 0,
            mode,
            sync_source_kind: nextShot.sync_source_kind ?? null,
            video_url: sourceUrl,
            audio_url: audioUrl,
            window_start_sec: dispatchWindow[0],
            window_end_sec: dispatchWindow[1],
            coords: nextShot.target_coords ?? null,
            frame_number: baseFrame,
            sync_status: "FACE_GATE_BLOCKED",
            error_class: reason,
            error_message: `faces=${lastValidation.faceCount} coordsMatch=${lastValidation.coordsMatch}`,
            meta: { faceBoxes: lastValidation.faceBoxes },
          });
          if (!prepareShotRetry(nextShot, reason, shots)) {
            degradeShotToMaster(nextShot, reason, shots);
          }
          mutated = true;
          continue;
        }
        if (validFrame !== null && validFrame !== baseFrame) {
          console.log(
            `[poll-dialog-shots] turn ${nextShot.idx} FACE-GATE shifted frame ${baseFrame} → ${validFrame}`,
          );
          nextShot.frame_number_override = validFrame;
        }
      }



      let jobId: string | null = null;
      let dispatchError: Error | null = null;
      try {
        jobId = await startSyncTurnJob(
          syncKey,
          sourceUrl,
          audioUrl,
          dispatchWindow,
          nextShot.target_coords,
          nextShot.temperature,
          nextShot.idx,
          mode,
          syncWebhookUrl,
          nextShot.frame_number_override,
          /* noSegments */ usePreclip,
        );
        nextShot.sync_job_id = jobId;
        nextShot.status = "lipsyncing";
        nextShot.started_at = new Date().toISOString();
        mutated = true;
        dispatchedThisTick++;
        console.log(
          `[poll-dialog-shots] v10 dispatched turn ${nextShot.idx} speaker=${nextShot.speaker_name} src=${usePreclip ? "PRECLIP" : "MASTER+segments"} mode=${mode} trimmed=${audioTrimmed} masterWin=[${win[0].toFixed(2)},${win[1].toFixed(2)}] dispatchWin=[${dispatchWindow[0].toFixed(2)},${dispatchWindow[1].toFixed(2)}] coords=${JSON.stringify(nextShot.target_coords)} temp=${nextShot.temperature} retry=${nextShot.retry_count ?? 0} frameOverride=${nextShot.frame_number_override ?? "default"}`,
        );
      } catch (e) {
        if (e instanceof SyncConcurrencyDeferredError) {
          nextShot.status = "pending";
          nextShot.sync_job_id = undefined;
          nextShot.last_deferred_at = new Date().toISOString();
          mutated = true;
          console.warn(
            `[poll-dialog-shots] turn ${nextShot.idx} deferred_due_to_concurrency retryAfter=${e.retryAfter ?? "?"}`,
          );
          // Log deferral and stop dispatching this tick.
          await logSyncDispatch(supabase, {
            scene_id: sceneId,
            user_id: userId ?? null,
            engine: "cinematic-sync",
            turn_idx: nextShot.idx,
            attempt: nextShot.retry_count ?? 0,
            mode,
            sync_source_kind: nextShot.sync_source_kind ?? null,
            video_url: sourceUrl,
            audio_url: audioUrl,
            window_start_sec: dispatchWindow[0],
            window_end_sec: dispatchWindow[1],
            sync_status: "DEFERRED",
            error_class: "rate_limited",
            error_message: e.message,
          });
          break;
        } else {
          dispatchError = e as Error;
          const reason = `dispatch: ${dispatchError?.message ?? "unknown"}`;
          if (!prepareShotRetry(nextShot, "dispatch_failed", shots)) {
            degradeShotToMaster(nextShot, reason, shots);
          }
          mutated = true;
        }
      }

      // Always log dispatch attempt (success OR hard failure that wasn't deferral).
      if (jobId || dispatchError) {
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          user_id: userId ?? null,
          engine: "cinematic-sync",
          job_id: jobId,
          turn_idx: nextShot.idx,
          attempt: nextShot.retry_count ?? 0,
          mode,
          sync_source_kind: nextShot.sync_source_kind ?? null,
          video_url: sourceUrl,
          audio_url: audioUrl,
          video_bytes: videoProbe.bytes,
          audio_bytes: audioProbe.bytes,
          video_content_type: videoProbe.contentType,
          audio_content_type: audioProbe.contentType,
          audio_dur_sec: preparedAudio?.durSec ?? null,
          audio_lead_in_sec: preparedAudio?.leadInSec ?? null,
          audio_peak_dbfs: preparedAudio?.peakDbFs ?? null,
          audio_channels: preparedAudio?.channels ?? null,
          audio_sample_rate: preparedAudio?.sampleRate ?? null,
          window_start_sec: dispatchWindow[0],
          window_end_sec: dispatchWindow[1],
          coords: nextShot.target_coords ?? null,
          frame_number: nextShot.frame_number_override ?? null,
          sync_status: jobId ? "DISPATCHED" : "DISPATCH_FAILED",
          error_class: dispatchError ? classifySyncError(dispatchError.message) : null,
          error_message: dispatchError ? dispatchError.message.slice(0, 500) : null,
        });
      }
    } catch (e) {
      // Outer safety — should not be reached because inner try/catch handles dispatch.
      console.error(`[poll-dialog-shots] turn ${nextShot.idx} unexpected dispatch crash`, e);
      const reason = `dispatch_crash: ${(e as Error)?.message ?? "unknown"}`;
      if (!prepareShotRetry(nextShot, "dispatch_crashed", shots)) {
        degradeShotToMaster(nextShot, reason, shots);
      }
      mutated = true;
    }
  }


  // ── Step 3: determine pipeline status ──────────────────────────────
  const allReady = shots.every((s) => s.status === "ready");
  const hasFailure = shots.some((s) => s.status === "failed");
  const hasActive = shots.some((s) => s.status === "lipsyncing" || s.status === "pending");

  let pipelineStatus: DialogShotsState["status"] = state.status;
  if (allReady) {
    // Don't mark "done" until the Lambda stitch finishes — only ready for
    // the stitch step.
    pipelineStatus = state.stitch?.render_id ? "stitching" : "stitching";
  } else if (hasFailure && !hasActive) {
    pipelineStatus = "failed";
  } else if (hasActive) {
    pipelineStatus = "lipsyncing";
  }

  newState = { ...newState, shots, status: pipelineStatus };

  // ── Step 4: all shots ready → Artlist-style Lambda stitch ───────────
  // We never use the last Sync.so output as the final clip. The Remotion
  // composition `DialogStitchVideo` overlays each per-turn Sync.so output
  // onto the original master plate, trimmed to that turn's window, and
  // remuxes the master WAV as the single canonical audio track.
  if (allReady) {
    // ── Multi-speaker integrity gate ──────────────────────────────────
    // For 2+ speakers, every shot MUST have been dispatched with
    // deterministic coords. A `ready` shot without deterministic_coords
    // means Sync.so ran in auto_detect and almost certainly animated the
    // wrong face. Refuse to ship that as final output.
    const multi = isMultiSpeakerScene(shots);
    if (multi) {
      const invalid = shots.filter(
        (s) =>
          (s as any).degraded !== true &&
          (!s.target_coords || s.deterministic_coords !== true),
      );
      if (invalid.length > 0) {
        const ids = invalid.map((s) => s.idx).join(",");
        console.error(
          `[poll-dialog-shots] scene ${sceneId} multi-speaker integrity FAIL — shots [${ids}] missing deterministic coords; refusing stitch.`,
        );
        invalid.forEach((s) =>
          markShotTerminalFailed(
            s,
            `multi_speaker_coords_missing: shot dispatched without deterministic face coords`,
          ),
        );
        const failedState: DialogShotsState = {
          ...newState,
          shots,
          status: "failed",
        };
        const refunded = userId
          ? await refundIfNeeded(supabase, userId, failedState)
          : failedState;
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: refunded,
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error: `lipsync_wrong_face_guard: shots ${ids} mis-targeted, bitte Szene neu rendern`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
        return { status: "failed", mutated: true };
      }
    }

    // Idempotency guard — if a stitch render is already in flight, just
    // persist state and wait for the webhook to write clip_url back. If the
    // previous dispatch failed or never created a render row, clear the stale
    // render_id and retry below — otherwise a scene can sit at 95% forever.
    if (state.stitch?.render_id) {
      const { data: existingRender } = await supabase
        .from("video_renders")
        .select("status")
        .eq("render_id", state.stitch.render_id)
        .maybeSingle();
      const renderStatus = String(existingRender?.status ?? "missing");
      if (!["pending", "rendering", "completed"].includes(renderStatus)) {
        console.warn(
          `[poll-dialog-shots] stale stitch render ${state.stitch.render_id} status=${renderStatus}; retrying dispatch`,
        );
        newState = {
          ...newState,
          stitch: undefined,
          status: "stitching",
          error: `stale_stitch_render:${renderStatus}`,
        } as DialogShotsState;
      } else {
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: newState,
          lip_sync_status: "stitching",
          twoshot_stage: "dialog_stitching",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return { status: "stitching", mutated: true };
      }
    }

    // Credential-blocked cooldown: if a previous tick saw AWS_INVALID, hold off
    // re-dispatching for 10 minutes so we don't spam Lambda once per minute.
    const blockedAt = (newState as any).stitch_blocked_at as string | undefined;
    const blockedCode = (newState as any).stitch_blocked_code as string | undefined;
    if (blockedCode === "aws_credentials_invalid" && blockedAt) {
      const ageMs = Date.now() - Date.parse(blockedAt);
      if (Number.isFinite(ageMs) && ageMs < 10 * 60 * 1000) {
        return { status: "stitching_blocked_credentials", mutated };
      }
    }

    const dispatch = await dispatchDialogStitch(supabase, sceneId);
    if (!dispatch.ok) {
      const isCredBlock = dispatch.code === "aws_credentials_invalid";
      console.warn(
        `[poll-dialog-shots] stitch dispatch failed${isCredBlock ? " (CREDENTIALS BLOCKED)" : ""}: ${dispatch.error}`,
      );
      const patched: any = {
        ...newState,
        stitch_error: dispatch.error.slice(0, 500),
      };
      if (isCredBlock) {
        patched.stitch_blocked_at = new Date().toISOString();
        patched.stitch_blocked_code = "aws_credentials_invalid";
      }
      const clipErrorMsg = isCredBlock
        ? "render_credentials_invalid: AWS Render-Credentials sind ungültig oder abgelaufen. Bitte AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (ggf. AWS_SESSION_TOKEN) erneuern."
        : `dialog_stitch_dispatch: ${dispatch.error}`;
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: patched,
          lip_sync_status: "stitching",
          twoshot_stage: "dialog_stitching",
          clip_error: clipErrorMsg.slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return {
        status: isCredBlock ? "stitching_blocked_credentials" : "stitching",
        mutated: true,
      };
    }

    console.log(
      `[poll-dialog-shots] v9 scene ${sceneId} all turns ready → stitch render ${dispatch.render_id} dispatched`,
    );
    // `render-dialog-stitch` already persists `dialog_shots.stitch.render_id`
    // and sets `lip_sync_status='stitching'`. `remotion-webhook` writes the
    // final clip_url + lip_sync_applied_at on completion.
    return { status: "stitching", mutated: true };
  }


  // ── Step 5: terminal failure → refund + persist ─────────────────────
  if (pipelineStatus === "failed") {
    if (userId) newState = await refundIfNeeded(supabase, userId, newState);
    const firstErr = shots.find((s) => s.error)?.error ?? "unknown";
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: newState,
        lip_sync_status: "failed",
        twoshot_stage: "failed",
        clip_error: `dialog_shots_failed: ${firstErr}`.slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);
    return { status: "failed", mutated: true };
  }

  // ── Step 6: mid-flight persist ─────────────────────────────────────
  if (mutated) {
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: newState,
        lip_sync_status: "running",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);
  }

  return { status: pipelineStatus, mutated };
}

// ── HTTP entry ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const syncKey =
      Deno.env.get("SYNC_API_KEY") ??
      Deno.env.get("SYNC_SO_API_KEY") ??
      Deno.env.get("SYNCSO_API_KEY");
    if (!syncKey) {
      return json(
        {
          error: "missing_sync_key",
          checked: ["SYNC_API_KEY", "SYNC_SO_API_KEY", "SYNCSO_API_KEY"],
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      /* empty body OK (pg_cron tick) */
    }
    const url = new URL(req.url);
    const querySceneId = url.searchParams.get("scene_id");
    const targetSceneId = (body?.scene_id as string) ?? querySceneId ?? null;

    let sceneIds: string[] = [];
    let kickstarted: string[] = [];
    if (targetSceneId) {
      sceneIds = [targetSceneId];
    } else {
      const { data: rows } = await supabase
        .from("composer_scenes")
        .select("id, dialog_shots")
        .in("lip_sync_status", ["running", "stitching"]);
      sceneIds = (rows ?? [])
        .filter(
          (r: any) =>
            r?.dialog_shots?.version === 4 &&
            ["queued", "lipsyncing", "stitching"].includes(
              String(r.dialog_shots?.status),
            ),
        )
        .map((r: any) => r.id);

      // ── Kickstart sweep ────────────────────────────────────────────────
      // Cinematic-Sync scenes whose master clip is ready but whose Lip-Sync
      // never started (no dialog_shots, lip_sync_status pending/null) get
      // stuck because the post-render handoff (compose-clip-webhook fire-and-
      // forget) sometimes drops. We sweep them here on every cron tick.
      // Guard with a 30s grace so we don't race the in-flight handoff.
      const { data: stuckRows } = await supabase
        .from("composer_scenes")
        .select("id, updated_at")
        .eq("engine_override", "cinematic-sync")
        .eq("clip_status", "ready")
        .is("dialog_shots", null)
        .is("lip_sync_applied_at", null)
        .not("clip_url", "is", null)
        .or("lip_sync_status.is.null,lip_sync_status.eq.pending");
      const GRACE_MS = 30_000;
      const now = Date.now();
      const toKick = (stuckRows ?? []).filter((r: any) => {
        const ts = r?.updated_at ? Date.parse(r.updated_at) : 0;
        return !ts || now - ts > GRACE_MS;
      });
      if (toKick.length > 0) {
        console.log(
          `[poll-dialog-shots] kickstart sweep: ${toKick.length} scene(s) need compose-dialog-scene`,
        );
        for (const r of toKick) {
          kickstarted.push(r.id);
          // Fire-and-forget; compose-dialog-scene returns 202 and handles its own state.
          const kickPromise = fetch(
            `${supabaseUrl}/functions/v1/compose-dialog-scene`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ scene_id: r.id }),
            },
          ).then(async (resp) => {
            if (!resp.ok) {
              const t = await resp.text().catch(() => "");
              console.warn(
                `[poll-dialog-shots] kickstart compose-dialog-scene ${r.id} failed ${resp.status}: ${t.slice(0, 300)}`,
              );
              // Stop the endless cron loop: if compose-dialog-scene rejects
              // with a permanent precondition error, mark the scene as failed
              // with a clear clip_error so the UI shows a retry hint instead
              // of spinning forever.
              const permanent =
                resp.status === 422 ||
                resp.status === 400 ||
                resp.status === 404 ||
                resp.status === 403;
              if (permanent) {
                let code = `compose_dialog_scene_${resp.status}`;
                try {
                  const j = JSON.parse(t);
                  if (j?.error) code = String(j.error);
                } catch { /* keep default */ }
                await supabase
                  .from("composer_scenes")
                  .update({
                    lip_sync_status: "failed",
                    clip_error: `lipsync_kickstart_failed:${code}`,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", r.id);
              }
            }
          }).catch((e) => {
            console.warn(
              `[poll-dialog-shots] kickstart compose-dialog-scene ${r.id} threw: ${(e as Error).message}`,
            );
          });
          // @ts-ignore EdgeRuntime is global
          if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
            // @ts-ignore
            EdgeRuntime.waitUntil(kickPromise);
          }
        }
      }
    }


    if (sceneIds.length === 0) {
      return json({ ok: true, processed: 0, kickstarted });
    }

    const results: any[] = [];
    for (const id of sceneIds) {
      try {
        const r = await processScene(supabase, syncKey, id);
        results.push({ scene_id: id, ...r });
      } catch (e) {
        console.error(`[poll-dialog-shots] scene ${id} crashed`, e);
        results.push({ scene_id: id, error: (e as Error).message });
      }
    }

    return json({ ok: true, processed: sceneIds.length, results });
  } catch (e) {
    console.error("[poll-dialog-shots] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
