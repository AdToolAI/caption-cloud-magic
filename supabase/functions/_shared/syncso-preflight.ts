/**
 * Sync.so Preflight Guard (Stufe B + C of the input-hardening plan).
 *
 * Goal: ensure every payload sent to Sync.so `/generate` has been
 * validated and normalized so the provider stops returning opaque
 * "An unknown error occurred" / REJECTED responses.
 *
 * This module is intentionally Deno-pure: no ffmpeg, no Replicate, no
 * binary deps. We work directly on PCM WAV bytes and HTTP HEAD probes.
 *
 * Used by:
 *   - poll-dialog-shots  (per-turn cinematic-sync pipeline)
 *   - compose-dialog-segments (1-call sync-segments pipeline)
 *   - compose-lipsync-scene   (legacy two-shot path, when present)
 */

// ── HTTP asset probe ────────────────────────────────────────────────────

export interface AssetProbe {
  ok: boolean;
  status: number;
  bytes: number;
  contentType: string;
  error?: string;
}

/**
 * HEAD-probe a remote asset. Returns `ok=true` only if status is 2xx,
 * Content-Length is >= minBytes, and Content-Type matches `kind`
 * (when the server returns a content-type at all).
 */
export async function probeAsset(
  url: string,
  kind: "video" | "audio",
  minBytes = 10_000,
): Promise<AssetProbe> {
  if (!url || typeof url !== "string") {
    return { ok: false, status: 0, bytes: 0, contentType: "", error: "empty_url" };
  }
  try {
    const r = await fetch(url, { method: "HEAD" });
    const len = Number(r.headers.get("content-length") ?? "0") || 0;
    const ct = (r.headers.get("content-type") ?? "").toLowerCase();
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        bytes: len,
        contentType: ct,
        error: `http_${r.status}`,
      };
    }
    if (len > 0 && len < minBytes) {
      return {
        ok: false,
        status: r.status,
        bytes: len,
        contentType: ct,
        error: `too_small_${len}`,
      };
    }
    if (kind === "video" && ct && !/(video|octet-stream|mpegurl|mp4)/.test(ct)) {
      return {
        ok: false,
        status: r.status,
        bytes: len,
        contentType: ct,
        error: `bad_content_type_${ct}`,
      };
    }
    if (kind === "audio" && ct && !/(audio|octet-stream|wav|mpeg|mp4)/.test(ct)) {
      return {
        ok: false,
        status: r.status,
        bytes: len,
        contentType: ct,
        error: `bad_content_type_${ct}`,
      };
    }
    return { ok: true, status: r.status, bytes: len, contentType: ct };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      bytes: 0,
      contentType: "",
      error: (e as Error)?.message ?? "fetch_failed",
    };
  }
}

// ── WAV inspect ─────────────────────────────────────────────────────────

export interface WavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  totalFrames: number;
  durSec: number;
  dataOff: number;
  dataLen: number;
  peakDbFs: number;        // -inf..0
  /** seconds from t=0 until first sample with abs > -45 dBFS. */
  leadInSec: number;
}

const SILENCE_THRESHOLD_AMP = 10 ** (-45 / 20); // ~0.00562
const PEAK_TARGET_DBFS = -1;                    // normalize to -1 dBFS

export function inspectWav(wav: Uint8Array): WavInfo {
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
  // Sample-walk: peak + lead-in.
  let peak = 0;
  let firstVoicedFrame = -1;
  const stride = Math.max(1, Math.floor(totalFrames / 200_000)); // cap CPU for huge files
  for (let f = 0; f < totalFrames; f += stride) {
    let maxC = 0;
    for (let c = 0; c < channels; c++) {
      const s = dv.getInt16(dataOff + (f * channels + c) * 2, true);
      const a = Math.abs(s) / 32768;
      if (a > maxC) maxC = a;
    }
    if (maxC > peak) peak = maxC;
    if (firstVoicedFrame < 0 && maxC > SILENCE_THRESHOLD_AMP) firstVoicedFrame = f;
  }
  const peakDbFs = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  const leadInSec = firstVoicedFrame > 0 ? firstVoicedFrame / sampleRate : 0;
  return {
    channels,
    sampleRate,
    bitsPerSample,
    totalFrames,
    durSec: totalFrames / sampleRate,
    dataOff,
    dataLen,
    peakDbFs,
    leadInSec,
  };
}

// ── WAV normalize (mono downmix + peak-norm + lead-in + min-dur) ────────

export interface NormalizeOptions {
  /** Prepend this many seconds of silence (helps Sync.so VAD onset). */
  leadInSec?: number;          // default 0.25
  /** Pad tail with silence until total >= this duration. */
  minTotalSec?: number;        // default 3.0
  /** Peak-normalize to this dBFS (set to null to skip). */
  peakDbFs?: number | null;    // default -1
  /** Force mono downmix if input has >1 channel. */
  forceMono?: boolean;         // default true
}

export interface NormalizedWav {
  bytes: Uint8Array;
  info: WavInfo;
  appliedGain: number;         // linear multiplier applied for peak-norm
}

/**
 * Pure Deno WAV normalizer. Operates on 16-bit PCM WAVs (the format
 * compose-twoshot-audio already emits). Returns a fresh RIFF/WAVE.
 */
export function normalizeWav(
  wav: Uint8Array,
  opts: NormalizeOptions = {},
): NormalizedWav {
  const {
    leadInSec = 0.25,
    minTotalSec = 3.0,
    peakDbFs = -1,
    forceMono = true,
  } = opts;

  const info = inspectWav(wav);
  const inChannels = info.channels;
  const outChannels = forceMono ? 1 : inChannels;
  const sampleRate = info.sampleRate;
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

  // 1) Read frames into Int16Array (mono if forceMono).
  const speechFrames = info.totalFrames;
  const speech = new Int16Array(speechFrames * outChannels);
  if (outChannels === inChannels) {
    // straight copy
    for (let f = 0; f < speechFrames; f++) {
      for (let c = 0; c < outChannels; c++) {
        speech[f * outChannels + c] = dv.getInt16(
          info.dataOff + (f * inChannels + c) * 2,
          true,
        );
      }
    }
  } else {
    // mono downmix (average across input channels)
    for (let f = 0; f < speechFrames; f++) {
      let sum = 0;
      for (let c = 0; c < inChannels; c++) {
        sum += dv.getInt16(info.dataOff + (f * inChannels + c) * 2, true);
      }
      speech[f] = Math.max(-32768, Math.min(32767, Math.round(sum / inChannels)));
    }
  }

  // 2) Peak-normalize (skip if already loud or peakDbFs null or signal is silent).
  let gain = 1;
  if (peakDbFs != null && Number.isFinite(info.peakDbFs)) {
    const currentPeak = 10 ** (info.peakDbFs / 20);
    const targetPeak = 10 ** (peakDbFs / 20);
    if (currentPeak > 0 && currentPeak < targetPeak) {
      gain = targetPeak / currentPeak;
      // Safety: never amplify by more than 12 dB (avoid noise blow-ups on near-silent input).
      const maxGain = 10 ** (12 / 20);
      if (gain > maxGain) gain = maxGain;
      for (let i = 0; i < speech.length; i++) {
        const v = Math.round(speech[i] * gain);
        speech[i] = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
      }
    } else {
      gain = 1;
    }
  }

  // 3) Compute frame counts.
  const leadInFrames = Math.max(0, Math.round(leadInSec * sampleRate));
  const minTotalFrames = Math.max(0, Math.ceil(minTotalSec * sampleRate));
  const contentFrames = leadInFrames + speechFrames;
  const tailFrames = Math.max(0, minTotalFrames - contentFrames);
  const outFrames = contentFrames + tailFrames;
  const bytesPerFrame = outChannels * 2;
  const outDataLen = outFrames * bytesPerFrame;

  // 4) Build output buffer with leading silence + speech + trailing silence.
  const out = new ArrayBuffer(44 + outDataLen);
  const ov = new DataView(out);
  ov.setUint32(0, 0x52494646, false); // "RIFF"
  ov.setUint32(4, 36 + outDataLen, true);
  ov.setUint32(8, 0x57415645, false); // "WAVE"
  ov.setUint32(12, 0x666d7420, false); // "fmt "
  ov.setUint32(16, 16, true);
  ov.setUint16(20, 1, true);            // PCM
  ov.setUint16(22, outChannels, true);
  ov.setUint32(24, sampleRate, true);
  ov.setUint32(28, sampleRate * bytesPerFrame, true);
  ov.setUint16(32, bytesPerFrame, true);
  ov.setUint16(34, 16, true);
  ov.setUint32(36, 0x64617461, false); // "data"
  ov.setUint32(40, outDataLen, true);

  // leading silence is zero-init.
  const speechByteOff = 44 + leadInFrames * bytesPerFrame;
  new Uint8Array(out, speechByteOff, speech.byteLength).set(
    new Uint8Array(speech.buffer, speech.byteOffset, speech.byteLength),
  );
  // tail silence is zero-init.

  const outBytes = new Uint8Array(out);
  return {
    bytes: outBytes,
    info: { ...info, totalFrames: outFrames, durSec: outFrames / sampleRate, channels: outChannels, leadInSec },
    appliedGain: gain,
  };
}

// ── Coords sanity ───────────────────────────────────────────────────────

export interface CoordsCheck {
  ok: boolean;
  reason?: string;
  clamped?: [number, number];
}

/** Validate face coords are inside the master clip dims (with 8px margin). */
export function checkCoordsBounds(
  coords: [number, number] | null | undefined,
  width: number,
  height: number,
): CoordsCheck {
  if (!coords) return { ok: false, reason: "no_coords" };
  if (!width || !height) return { ok: true }; // can't check
  const [x, y] = coords;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, reason: "non_finite" };
  }
  const margin = 8;
  if (x < margin || y < margin || x > width - margin || y > height - margin) {
    const cx = Math.max(margin, Math.min(width - margin, x));
    const cy = Math.max(margin, Math.min(height - margin, y));
    return { ok: false, reason: "out_of_bounds", clamped: [cx, cy] };
  }
  return { ok: true };
}

// ── Dispatch log writer ─────────────────────────────────────────────────

export interface SyncDispatchLogRow {
  scene_id?: string | null;
  user_id?: string | null;
  engine: string;
  job_id?: string | null;
  turn_idx?: number | null;
  attempt?: number | null;
  mode?: string | null;
  sync_source_kind?: string | null;
  video_url?: string | null;
  audio_url?: string | null;
  video_bytes?: number | null;
  audio_bytes?: number | null;
  video_content_type?: string | null;
  audio_content_type?: string | null;
  audio_dur_sec?: number | null;
  audio_lead_in_sec?: number | null;
  audio_peak_dbfs?: number | null;
  audio_channels?: number | null;
  audio_sample_rate?: number | null;
  window_start_sec?: number | null;
  window_end_sec?: number | null;
  coords?: [number, number] | null;
  frame_number?: number | null;
  preflight_repairs?: string[] | null;
  http_status?: number | null;
  sync_status?: string | null;
  error_class?: string | null;
  error_message?: string | null;
  meta?: Record<string, unknown> | null;
}

/** Best-effort fire-and-forget log. Never throws. */
export async function logSyncDispatch(
  supabase: { from: (t: string) => any },
  row: SyncDispatchLogRow,
): Promise<void> {
  try {
    const payload = {
      ...row,
      audio_peak_dbfs:
        row.audio_peak_dbfs != null && Number.isFinite(row.audio_peak_dbfs)
          ? row.audio_peak_dbfs
          : null,
    };
    const { error } = await supabase
      .from("syncso_dispatch_log")
      .insert(payload as Record<string, unknown>);
    if (error) {
      console.warn(`[syncso-preflight] log insert failed: ${error.message}`);
    }
  } catch (e) {
    console.warn(`[syncso-preflight] log crash: ${(e as Error)?.message ?? e}`);
  }
}

/** Classify a Sync.so error message into a coarse bucket for analytics. */
export function classifySyncError(message?: string | null): string {
  if (!message) return "unknown";
  const m = message.toLowerCase();
  if (/unknown error/.test(m)) return "provider_unknown_error";
  if (/segment/.test(m)) return "segment_rejected";
  if (/face|speaker|mouth/.test(m)) return "face_detection";
  if (/audio|silence|voiced|onset|vad/.test(m)) return "audio_issue";
  if (/video|codec|resolution|fps/.test(m)) return "video_issue";
  if (/timeout|timed.out/.test(m)) return "timeout";
  if (/rate.?limit|concurrency|429/.test(m)) return "rate_limited";
  if (/auth|unauthorized|forbidden/.test(m)) return "auth";
  if (/http.*4\d\d/.test(m)) return "http_4xx";
  if (/http.*5\d\d/.test(m)) return "http_5xx";
  if (/face_validation|no_face/.test(m)) return "face_validation_failed";
  if (/precheck/.test(m)) return "precheck_face_mismatch";
  return "other";
}

// ── Face validation helper (Stage D) ────────────────────────────────────

export interface FaceValidationResult {
  ok: boolean;
  cached?: boolean;
  faceVisible: boolean;
  faceCount: number;
  faceBoxes: Array<{ x: number; y: number; w: number; h: number; confidence: number }>;
  /** null when no target_coords provided. */
  coordsMatch: boolean | null;
  error?: string;
}

/**
 * Validate that a face is visible at the given frame in the given video.
 * Calls our internal `validate-frame-face` edge function (which is Gemini
 * Vision + 24h cache backed). Returns a permissive `faceVisible: true`
 * result on validator failure so callers don't double-block on a flaky
 * vision model.
 */
export async function validateFrameFace(opts: {
  supabaseUrl: string;
  serviceKey: string;
  videoUrl: string;
  frameNumber: number;
  fps?: number;
  targetCoords?: [number, number] | [number, number, number, number] | null;
}): Promise<FaceValidationResult> {
  const target = opts.targetCoords;
  // Normalize Sync.so [x, y] pixel coords into a 0..1 box ~ 12% wide
  // around the mouth so the overlap check has something meaningful.
  // Caller can also pass [x, y, w, h] directly (already normalized).
  let coords: [number, number, number, number] | null = null;
  if (Array.isArray(target)) {
    if (target.length === 4) coords = target as [number, number, number, number];
    else if (target.length === 2) {
      // We don't know the master clip dimensions here. We treat the
      // [x, y] as already-normalized 0..1 center and build a ±6% box.
      const [cx, cy] = target as [number, number];
      const isNorm = cx <= 1.0 && cy <= 1.0;
      if (isNorm) {
        coords = [
          Math.max(0, cx - 0.06),
          Math.max(0, cy - 0.06),
          0.12,
          0.12,
        ];
      }
      // Pixel coords: skip the overlap check (caller decides on faceVisible only).
    }
  }

  try {
    const resp = await fetch(`${opts.supabaseUrl}/functions/v1/validate-frame-face`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_url: opts.videoUrl,
        frame_number: opts.frameNumber,
        fps: opts.fps ?? 24,
        target_coords: coords,
      }),
    });
    const json = (await resp.json().catch(() => ({}))) as any;
    if (!resp.ok || json?.ok === false) {
      return {
        ok: false,
        faceVisible: true, // permissive
        faceCount: Number(json?.faceCount) || 0,
        faceBoxes: Array.isArray(json?.faceBoxes) ? json.faceBoxes : [],
        coordsMatch: null,
        error: json?.error ?? `http_${resp.status}`,
      };
    }
    return {
      ok: true,
      cached: !!json.cached,
      faceVisible: !!json.faceVisible,
      faceCount: Number(json.faceCount) || 0,
      faceBoxes: Array.isArray(json.faceBoxes) ? json.faceBoxes : [],
      coordsMatch: json.coordsMatch == null ? null : !!json.coordsMatch,
    };
  } catch (e) {
    return {
      ok: false,
      faceVisible: true,
      faceCount: 0,
      faceBoxes: [],
      coordsMatch: null,
      error: (e as Error)?.message ?? "fetch_failed",
    };
  }
}

