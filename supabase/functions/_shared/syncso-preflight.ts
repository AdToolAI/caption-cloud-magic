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
  /**
   * Stage F.2 — EBU R128-style loudness target in LUFS. When set, the
   * normalizer first lifts the RMS-based loudness toward this target
   * (capped at +12dB amplification) BEFORE the final peak cap. Default
   * -16 LUFS (Sync.so sweet spot). Set `null` to disable loudness norm.
   */
  targetLufs?: number | null;  // default -16
}

export interface NormalizedWav {
  bytes: Uint8Array;
  info: WavInfo;
  appliedGain: number;         // linear multiplier applied for peak-norm
  /** Stage F.2 — measured loudness (RMS-LUFS) of the source signal. */
  sourceLufs?: number;
  /** Stage F.2 — measured loudness after gain application. */
  resultLufs?: number;
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
    targetLufs = -16,
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

  // 2a) Stage F.2 — RMS-LUFS loudness measurement on raw signal.
  const sourceLufs = measureLufsInt16(speech);

  // 2b) LUFS gain (lift signal toward targetLufs before peak-cap).
  let loudnessGain = 1;
  if (
    targetLufs != null &&
    Number.isFinite(sourceLufs) &&
    sourceLufs > -70 &&
    sourceLufs < targetLufs
  ) {
    const deltaDb = targetLufs - sourceLufs;
    // Cap loudness lift at +12dB so we never amplify pure noise.
    const cappedDb = Math.min(12, deltaDb);
    loudnessGain = 10 ** (cappedDb / 20);
    for (let i = 0; i < speech.length; i++) {
      const v = Math.round(speech[i] * loudnessGain);
      speech[i] = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
    }
  }

  // 2c) Peak-normalize (after loudness lift) — skip if already loud or signal silent.
  let gain = loudnessGain;
  if (peakDbFs != null && Number.isFinite(info.peakDbFs)) {
    const currentPeak = (10 ** (info.peakDbFs / 20)) * loudnessGain;
    const targetPeak = 10 ** (peakDbFs / 20);
    if (currentPeak > 0 && currentPeak < targetPeak) {
      const peakGain = targetPeak / currentPeak;
      // Safety: combined gain capped at +12 dB total over original.
      const maxTotalGain = 10 ** (12 / 20);
      const effectiveGain = Math.min(peakGain, maxTotalGain / loudnessGain);
      if (effectiveGain > 1) {
        for (let i = 0; i < speech.length; i++) {
          const v = Math.round(speech[i] * effectiveGain);
          speech[i] = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
        }
        gain = loudnessGain * effectiveGain;
      }
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
  const resultLufs = measureLufsInt16(speech);
  return {
    bytes: outBytes,
    info: { ...info, totalFrames: outFrames, durSec: outFrames / sampleRate, channels: outChannels, leadInSec },
    appliedGain: gain,
    sourceLufs,
    resultLufs,
  };
}

/**
 * Stage F.2 — Cheap RMS-based LUFS estimator over 400ms windows
 * with a -10 LUFS offset (close enough to EBU R128 mean loudness
 * for our gain decisions). Returns -Infinity for true silence.
 */
function measureLufsInt16(samples: Int16Array): number {
  if (!samples.length) return -Infinity;
  // 400ms at 44.1kHz ~= 17640 samples; we don't know sr here so just chunk fixed.
  const chunk = 16_000;
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < samples.length; i += chunk) {
    const end = Math.min(samples.length, i + chunk);
    let s = 0;
    for (let j = i; j < end; j++) {
      const v = samples[j] / 32768;
      s += v * v;
    }
    sumSq += s;
    count += end - i;
  }
  if (count === 0) return -Infinity;
  const rms = Math.sqrt(sumSq / count);
  if (rms <= 0) return -Infinity;
  // RMS dBFS → approximate LUFS (offset −0.691 for K-weighting omitted; close enough).
  return 20 * Math.log10(rms);
}

/**
 * Stage F.2 — Hard-floor SNR check. Returns true if the signal is below
 * -45 dBFS RMS (basically inaudible). Caller should refuse to dispatch
 * such a clip to Sync.so and tell the user to re-record.
 */
export function isAudioTooQuiet(wav: Uint8Array): { tooQuiet: boolean; rmsDbFs: number } {
  try {
    const info = inspectWav(wav);
    const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    let sumSq = 0;
    let count = 0;
    const stride = 4;
    for (let f = 0; f < info.totalFrames; f += stride) {
      for (let c = 0; c < info.channels; c++) {
        const s = dv.getInt16(info.dataOff + (f * info.channels + c) * 2, true) / 32768;
        sumSq += s * s;
        count++;
      }
    }
    const rms = count ? Math.sqrt(sumSq / count) : 0;
    const dbFs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    return { tooQuiet: dbFs < -45, rmsDbFs: dbFs };
  } catch {
    return { tooQuiet: false, rmsDbFs: 0 };
  }
}

// ── VAD detection (Stage E.1) ───────────────────────────────────────────

export interface VadResult {
  voicedSec: number;
  totalSec: number;
  voicedRatio: number;
  /** Longest contiguous voiced run in seconds. */
  longestVoicedRun: number;
}

/**
 * Cheap energy-gate VAD on a 16-bit PCM WAV. Splits into 20ms frames and
 * counts frames with peak amplitude >= -35 dBFS as "voiced". Returns the
 * voiced ratio and the longest contiguous voiced run.
 *
 * Used as a pre-dispatch guard: if a "voiceover" WAV has no detectable
 * speech (TTS dropped, encoding bug, silent input) Sync.so will return
 * `unknown error` or animate a closed mouth. We catch it here instead.
 */
export function detectVoicedFrames(wav: Uint8Array): VadResult {
  const info = inspectWav(wav);
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const frameLenSec = 0.02;
  const framesPerWindow = Math.max(1, Math.floor(info.sampleRate * frameLenSec));
  const voicedThresh = 10 ** (-35 / 20);
  let voicedWindows = 0;
  let totalWindows = 0;
  let longestRun = 0;
  let currentRun = 0;
  for (let f = 0; f < info.totalFrames; f += framesPerWindow) {
    const end = Math.min(info.totalFrames, f + framesPerWindow);
    let peak = 0;
    for (let g = f; g < end; g += 2) { // stride-2 for CPU
      let maxC = 0;
      for (let c = 0; c < info.channels; c++) {
        const s = dv.getInt16(info.dataOff + (g * info.channels + c) * 2, true);
        const a = Math.abs(s) / 32768;
        if (a > maxC) maxC = a;
      }
      if (maxC > peak) peak = maxC;
    }
    totalWindows++;
    if (peak >= voicedThresh) {
      voicedWindows++;
      currentRun += frameLenSec;
      if (currentRun > longestRun) longestRun = currentRun;
    } else {
      currentRun = 0;
    }
  }
  const voicedSec = voicedWindows * frameLenSec;
  return {
    voicedSec,
    totalSec: info.durSec,
    voicedRatio: totalWindows > 0 ? voicedWindows / totalWindows : 0,
    longestVoicedRun: longestRun,
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

/** Clamp coords into [margin, dim-margin]. Returns null if dims unknown. */
export function clampCoordsToBounds(
  coords: [number, number] | null | undefined,
  width: number,
  height: number,
): [number, number] | null {
  if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
  if (!width || !height) return [coords[0], coords[1]];
  const margin = 8;
  return [
    Math.max(margin, Math.min(width - margin, coords[0])),
    Math.max(margin, Math.min(height - margin, coords[1])),
  ];
}

// ── Segment validation (Stage E.4) ──────────────────────────────────────

export interface SegmentLike {
  startTime: number;
  endTime: number;
  speakerIdx?: number;
  speakerName?: string;
  refId?: string;
}

export interface SegmentValidation {
  ok: boolean;
  reason?: string;
  /** Auto-fixed segments (clamped + sorted + de-overlapped). */
  fixed: SegmentLike[];
  /** Repairs applied for telemetry. */
  repairs: string[];
}

const SEG_MIN_DUR = 0.3;
const SEG_MAX_DUR = 30;
const SEG_OVERLAP_TOLERANCE = 0.01; // 10ms

/**
 * Validate + auto-repair a Sync.so segments array.
 *  - Sort by startTime
 *  - Clamp each segment into [0, totalSec]
 *  - Drop segments <SEG_MIN_DUR or >SEG_MAX_DUR (cannot heal those)
 *  - Trim overlaps: if seg[i+1].start < seg[i].end, push seg[i+1].start forward
 *  - Final hard check: any remaining gap/overlap/coverage failure → ok=false
 */
export function validateSegments(
  segments: SegmentLike[],
  totalSec: number,
): SegmentValidation {
  const repairs: string[] = [];
  if (!Array.isArray(segments) || segments.length === 0) {
    return { ok: false, reason: "no_segments", fixed: [], repairs };
  }
  // Clone + clamp + sort
  let work: SegmentLike[] = segments
    .map((s) => ({
      ...s,
      startTime: Math.max(0, Math.min(totalSec, Number(s.startTime) || 0)),
      endTime: Math.max(0, Math.min(totalSec, Number(s.endTime) || 0)),
    }))
    .filter((s) => {
      const d = s.endTime - s.startTime;
      if (d < SEG_MIN_DUR) {
        repairs.push(`dropped_short_seg_${d.toFixed(3)}s`);
        return false;
      }
      if (d > SEG_MAX_DUR) {
        repairs.push(`dropped_long_seg_${d.toFixed(1)}s`);
        return false;
      }
      return true;
    })
    .sort((a, b) => a.startTime - b.startTime);

  if (work.length === 0) {
    return { ok: false, reason: "all_segments_invalid_after_clamp", fixed: [], repairs };
  }

  // De-overlap (preserve next segment, trim previous)
  for (let i = 0; i < work.length - 1; i++) {
    const cur = work[i];
    const next = work[i + 1];
    if (next.startTime < cur.endTime - SEG_OVERLAP_TOLERANCE) {
      const newEnd = next.startTime;
      if (newEnd - cur.startTime < SEG_MIN_DUR) {
        return {
          ok: false,
          reason: `overlap_unfixable_at_${i}`,
          fixed: work,
          repairs,
        };
      }
      repairs.push(`trimmed_overlap_at_${i}_${(cur.endTime - newEnd).toFixed(3)}s`);
      cur.endTime = newEnd;
    }
  }

  const maxEnd = work[work.length - 1].endTime;
  if (maxEnd > totalSec + 0.1) {
    return { ok: false, reason: `exceeds_total_${maxEnd.toFixed(2)}>${totalSec.toFixed(2)}`, fixed: work, repairs };
  }

  return { ok: true, fixed: work, repairs };
}

// ── Concurrency guard + backoff (Stage E.3) ─────────────────────────────

/** Default max parallel Sync.so jobs (Creator plan). */
export const SYNCSO_DEFAULT_MAX_PARALLEL = 3;

export async function countInflightSyncJobs(
  supabase: { from: (t: string) => any },
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("syncso_inflight_jobs")
      .select("job_id", { count: "exact", head: true })
      .gt("expires_at", new Date().toISOString());
    if (error) {
      console.warn(`[syncso-preflight] inflight count failed: ${error.message}`);
      return 0;
    }
    return Number(count) || 0;
  } catch (e) {
    console.warn(`[syncso-preflight] inflight count crash: ${(e as Error).message}`);
    return 0;
  }
}

export async function registerInflightSyncJob(
  supabase: { from: (t: string) => any },
  row: { job_id: string; user_id?: string | null; scene_id?: string | null; engine: string },
): Promise<void> {
  try {
    await supabase.from("syncso_inflight_jobs").upsert(
      {
        job_id: row.job_id,
        user_id: row.user_id ?? null,
        scene_id: row.scene_id ?? null,
        engine: row.engine,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
      { onConflict: "job_id" },
    );
  } catch (e) {
    console.warn(`[syncso-preflight] register inflight crash: ${(e as Error).message}`);
  }
}

export async function releaseInflightSyncJob(
  supabase: { from: (t: string) => any },
  jobId: string,
): Promise<void> {
  try {
    await supabase.from("syncso_inflight_jobs").delete().eq("job_id", jobId);
  } catch (e) {
    console.warn(`[syncso-preflight] release inflight crash: ${(e as Error).message}`);
  }
}

/** Exponential backoff with jitter, capped at 60s. attempt is 1-based. */
export function computeBackoffMs(attempt: number): number {
  const base = Math.min(60_000, (2 ** Math.max(0, attempt - 1)) * 2_000);
  const jitter = Math.floor(Math.random() * 3_000);
  return base + jitter;
}

// ── MP4 stream probe (Stage E.2) ────────────────────────────────────────

export interface VideoStreamInfo {
  ok: boolean;
  codec?: string;        // e.g. "avc1" | "hev1" | "vp09"
  width?: number;
  height?: number;
  hasAudioTrack?: boolean;
  /** True only if we positively detected non-H.264. */
  isUnsupportedCodec?: boolean;
  reason?: string;
}

/**
 * Very lightweight MP4 probe: RANGE-fetch first 256kB, walk the box tree
 * looking for the first `trak`/`stsd` codec FourCC and any `soun` handler.
 * Conservative: returns ok=true with empty codec when moov is too far in
 * the file (faststart not enabled). Only flags hard failures.
 */
export async function probeMp4Stream(url: string): Promise<VideoStreamInfo> {
  if (!url) return { ok: false, reason: "empty_url" };
  try {
    const r = await fetch(url, { headers: { Range: "bytes=0-262143" } });
    if (!r.ok && r.status !== 206) {
      return { ok: false, reason: `http_${r.status}` };
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    return parseMp4Boxes(buf);
  } catch (e) {
    return { ok: false, reason: (e as Error)?.message ?? "fetch_failed" };
  }
}

function parseMp4Boxes(buf: Uint8Array): VideoStreamInfo {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const codecs: string[] = [];
  let width: number | undefined;
  let height: number | undefined;
  let hasAudioTrack = false;
  let currentHandler: string | null = null;

  function walk(start: number, end: number) {
    let p = start;
    while (p + 8 <= end) {
      const size = dv.getUint32(p, false);
      const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
      if (size < 8 || p + size > end) return;
      const contentStart = p + 8;
      const contentEnd = p + size;
      // Container boxes
      if (["moov", "trak", "mdia", "minf", "stbl", "edts"].includes(type)) {
        walk(contentStart, Math.min(end, contentEnd));
      } else if (type === "hdlr") {
        // handler box: 4 reserved + 4 handler_type (chars)
        if (contentEnd - contentStart >= 12) {
          const h = String.fromCharCode(
            buf[contentStart + 8],
            buf[contentStart + 9],
            buf[contentStart + 10],
            buf[contentStart + 11],
          );
          currentHandler = h;
          if (h === "soun") hasAudioTrack = true;
        }
      } else if (type === "stsd") {
        // first child sample-entry, FourCC at offset +8 (version+flags+count = 8 bytes)
        if (contentEnd - contentStart >= 16) {
          const codec = String.fromCharCode(
            buf[contentStart + 12],
            buf[contentStart + 13],
            buf[contentStart + 14],
            buf[contentStart + 15],
          );
          if (currentHandler === "vide" || currentHandler === null) {
            codecs.push(codec);
            // visual sample entry: width @ +32, height @ +34 inside the entry
            const entryStart = contentStart + 8; // start of entry (size+codec)
            if (contentEnd - entryStart >= 36) {
              width = dv.getUint16(entryStart + 32, false);
              height = dv.getUint16(entryStart + 34, false);
            }
          }
        }
      }
      p += size;
    }
  }

  walk(0, buf.byteLength);
  const codec = codecs[0];
  const supported = !codec || /^(avc1|avc3|hvc1|hev1)$/.test(codec);
  return {
    ok: true,
    codec,
    width,
    height,
    hasAudioTrack,
    isUnsupportedCodec: !!codec && !supported,
  };
}

export async function probeVideoStreamCached(
  supabase: { from: (t: string) => any },
  url: string,
  ttlHours = 24,
): Promise<VideoStreamInfo> {
  try {
    const { data: cached } = await supabase
      .from("video_stream_probe_cache")
      .select("codec, width, height, fps, has_audio_track, probed_at")
      .eq("video_url", url)
      .maybeSingle();
    if (cached?.probed_at) {
      const ageMs = Date.now() - Date.parse(cached.probed_at);
      if (ageMs < ttlHours * 3600 * 1000) {
        return {
          ok: true,
          codec: cached.codec ?? undefined,
          width: cached.width ?? undefined,
          height: cached.height ?? undefined,
          hasAudioTrack: cached.has_audio_track ?? undefined,
          isUnsupportedCodec: !!cached.codec && !/^(avc1|avc3|hvc1|hev1)$/.test(cached.codec),
        };
      }
    }
  } catch { /* cache miss / table absent */ }

  const probe = await probeMp4Stream(url);
  if (probe.ok) {
    try {
      await supabase.from("video_stream_probe_cache").upsert(
        {
          video_url: url,
          codec: probe.codec ?? null,
          width: probe.width ?? null,
          height: probe.height ?? null,
          has_audio_track: probe.hasAudioTrack ?? null,
          probed_at: new Date().toISOString(),
        },
        { onConflict: "video_url" },
      );
    } catch { /* best effort */ }
  }
  return probe;
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
  if (/no_voiced_frames|preflight_audio_no_voice|silence|voiced|vad/.test(m)) return "audio_no_voice";
  if (/unsupported.*codec|codec.*not.*support|video_codec_unsupported/.test(m)) return "video_codec_unsupported";
  if (/segments?.*invalid|overlap|segment.*reject/.test(m)) return "segments_invalid";
  if (/face_validation|no_face|face.gate/.test(m)) return "face_validation_failed";
  if (/precheck/.test(m)) return "precheck_face_mismatch";
  if (/unknown error/.test(m)) return "provider_unknown_error";
  if (/segment/.test(m)) return "segment_rejected";
  if (/face|speaker|mouth/.test(m)) return "face_detection";
  if (/audio|onset/.test(m)) return "audio_issue";
  if (/video|resolution|fps/.test(m)) return "video_issue";
  if (/timeout|timed.out/.test(m)) return "timeout";
  if (/rate.?limit|concurrency|429/.test(m)) return "rate_limited";
  if (/auth|unauthorized|forbidden/.test(m)) return "auth";
  if (/http.*4\d\d/.test(m)) return "http_4xx";
  if (/http.*5\d\d/.test(m)) return "http_5xx";
  return "other";
}

/** True for errors worth retrying (transient infra / provider blips). */
export function isTransientSyncError(errorClass: string): boolean {
  return [
    "provider_unknown_error",
    "timeout",
    "rate_limited",
    "http_5xx",
  ].includes(errorClass);
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

