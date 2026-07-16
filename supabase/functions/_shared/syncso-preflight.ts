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

// ── Sync.so API key lookup ──────────────────────────────────────────────
// The Supabase Vault secret is historically named SYNC_API_KEY (used by
// poll-dialog-shots, compose-twoshot-lipsync, poll-twoshot-lipsync since
// the legacy days). Newer functions must check this name FIRST or they
// will return 500 on every dispatch even though the project is configured.
export const SYNC_API_KEY_ENV_NAMES = [
  "SYNC_API_KEY",
  "SYNC_SO_API_KEY",
  "SYNCSO_API_KEY",
] as const;

export function getSyncApiKey(): string {
  for (const name of SYNC_API_KEY_ENV_NAMES) {
    const v = Deno.env.get(name);
    if (v) return v;
  }
  return "";
}

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

// ── VAD voiced-range (v129.3) ───────────────────────────────────────────

export interface VoicedRange {
  /** Seconds from t=0 to the first voiced 20ms window. -1 if no voice. */
  firstVoicedSec: number;
  /** Seconds from t=0 to the END of the last voiced 20ms window. -1 if none. */
  lastVoicedSec: number;
  /** Total voiced seconds (== voicedWindows * 0.02). */
  voicedSec: number;
  /** Total audio duration in seconds. */
  totalSec: number;
  /** Tail silence in seconds (totalSec - lastVoicedSec). */
  tailSilenceSec: number;
}

/**
 * v129.3 — Walk the same 20ms energy-gate as `detectVoicedFrames`, but
 * return the first/last voiced window timestamps so callers can build a
 * "voiced-window" sync audio: slice `[max(first - pre, 0), min(last + post, total)]`
 * before sending to Sync.so. Avoids feeding a 9s timeline-style WAV with
 * 6.7s leading silence into a 1.78s preclip (root cause of scene
 * `7aed09f4-…` `provider_unknown_error` terminal in June 2026).
 */
export function detectVoicedRange(wav: Uint8Array): VoicedRange {
  const info = inspectWav(wav);
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const frameLenSec = 0.02;
  const framesPerWindow = Math.max(1, Math.floor(info.sampleRate * frameLenSec));
  const voicedThresh = 10 ** (-35 / 20);
  let firstVoicedWindowIdx = -1;
  let lastVoicedWindowIdx = -1;
  let voicedWindows = 0;
  let windowIdx = 0;
  for (let f = 0; f < info.totalFrames; f += framesPerWindow) {
    const end = Math.min(info.totalFrames, f + framesPerWindow);
    let peak = 0;
    for (let g = f; g < end; g += 2) {
      let maxC = 0;
      for (let c = 0; c < info.channels; c++) {
        const s = dv.getInt16(info.dataOff + (g * info.channels + c) * 2, true);
        const a = Math.abs(s) / 32768;
        if (a > maxC) maxC = a;
      }
      if (maxC > peak) peak = maxC;
    }
    if (peak >= voicedThresh) {
      if (firstVoicedWindowIdx < 0) firstVoicedWindowIdx = windowIdx;
      lastVoicedWindowIdx = windowIdx;
      voicedWindows++;
    }
    windowIdx++;
  }
  const firstVoicedSec = firstVoicedWindowIdx >= 0 ? firstVoicedWindowIdx * frameLenSec : -1;
  const lastVoicedSec = lastVoicedWindowIdx >= 0 ? (lastVoicedWindowIdx + 1) * frameLenSec : -1;
  const tailSilenceSec = lastVoicedSec >= 0
    ? Math.max(0, info.durSec - lastVoicedSec)
    : info.durSec;
  return {
    firstVoicedSec,
    lastVoicedSec,
    voicedSec: voicedWindows * frameLenSec,
    totalSec: info.durSec,
    tailSilenceSec,
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

/**
 * v169 Stage A — Stale-Job Reconcile.
 * Sync.so concurrency slots are blocked by jobs that locally already failed
 * but are still "processing" on the provider side. Before a fresh dispatch
 * we GET each old inflight job and clear it from the local table when
 * Sync.so reports a terminal state. Best-effort, time-bounded.
 *
 * Returns the number of inflight rows freed (for logging).
 */
export async function reconcileStaleSyncJobs(
  supabase: { from: (t: string) => any },
  opts: {
    userId: string;
    syncApiKey: string;
    minAgeMs?: number;     // default 6 min — only touch jobs older than this
    maxJobs?: number;      // default 10
    budgetMs?: number;     // default 500
    apiBase?: string;      // default https://api.sync.so/v2
  },
): Promise<number> {
  const enabled = (Deno.env.get("FEATURE_STALE_JOB_RECONCILE") ?? "true")
    .toLowerCase() !== "false";
  if (!enabled) return 0;
  const minAgeMs = opts.minAgeMs ?? 6 * 60 * 1000;
  const maxJobs = opts.maxJobs ?? 10;
  const budgetMs = opts.budgetMs ?? 500;
  const apiBase = opts.apiBase ?? "https://api.sync.so/v2";
  const cutoff = new Date(Date.now() - minAgeMs).toISOString();
  const t0 = Date.now();
  let freed = 0;
  try {
    const { data: rows, error } = await supabase
      .from("syncso_inflight_jobs")
      .select("job_id, started_at")
      .eq("user_id", opts.userId)
      .lt("started_at", cutoff)
      .order("started_at", { ascending: true })
      .limit(maxJobs);
    if (error || !rows || rows.length === 0) return 0;
    for (const r of rows) {
      if (Date.now() - t0 > budgetMs) break;
      const jobId = String((r as any).job_id ?? "");
      if (!jobId) continue;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 1200);
        const resp = await fetch(`${apiBase}/generate/${jobId}`, {
          method: "GET",
          headers: { "x-api-key": opts.syncApiKey },
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (resp.status === 404) {
          // Sync.so doesn't know it anymore → free local slot.
          await supabase.from("syncso_inflight_jobs").delete().eq("job_id", jobId);
          freed++;
          continue;
        }
        if (!resp.ok) continue;
        const body = await resp.json().catch(() => null) as any;
        const status = String(body?.status ?? "").toUpperCase();
        if (status === "COMPLETED" || status === "FAILED" || status === "CANCELED" || status === "REJECTED") {
          await supabase.from("syncso_inflight_jobs").delete().eq("job_id", jobId);
          freed++;
        }
      } catch (_e) {
        // ignore per-job — best-effort
      }
    }
  } catch (e) {
    console.warn(`[syncso-preflight] reconcile crash: ${(e as Error).message}`);
  }
  if (freed > 0) {
    console.log(`[syncso-preflight] STALE_JOB_RECONCILED user=${opts.userId} freed=${freed} budget_ms=${Date.now() - t0}`);
  }
  return freed;
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
  // v247 — face-anchor + noop observability
  face_share_in_preclip?: number | null;
  mouth_center_offset_px?: number | null;
  noop_mouth_yavg?: number | null;
  detector_used?: string | null;
  retry_count?: number | null;
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
  // v143 — explicit Sync.so 422 for inaccessible inputs (the real root cause of
  // weeks of phantom "NOOP" debugging). Map BEFORE the generic auth/4xx rules.
  if (/generation_input_video_inaccessible|generation_input_audio_inaccessible|video url is inaccessible|url is inaccessible|publicly fetchable|not expired or auth-gated/.test(m)) return "input_inaccessible";
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

/**
 * Map the OFFICIAL Sync.so `error_code` enum (from the webhook spec) to a
 * routing bucket. Source of truth:
 *   https://sync.so/docs/developer-guides/error-handling
 *
 * Returns:
 *   - "retry_transient"   → safe to retry as-is (infra / provider blips)
 *   - "retry_with_repair" → retry after re-encoding the input audio (WAV repair)
 *   - "fail_fast"         → permanent: refund + surface code to user
 *   - "unknown"           → no official code → fall back to message classifier
 */
export type SyncCodeBucket = "retry_transient" | "retry_with_repair" | "fail_fast" | "unknown";

export function classifySyncErrorCode(code?: string | null): SyncCodeBucket {
  if (!code) return "unknown";
  const c = String(code).trim().toLowerCase();
  // Transient — provider/infra issues, retry with same payload
  if ([
    "generation_timeout",
    "generation_pipeline_failed",
    "generation_unhandled_error",
    "generation_database_error",
    "generation_infra_storage_error",
    "generation_infra_resource_exhausted",
    "generation_infra_service_unavailable",
  ].includes(c)) return "retry_transient";
  // Audio invalid — re-encode WAV (pcm_s16le) and retry once
  if ([
    "generation_input_audio_invalid",
    "generation_media_metadata_missing",
  ].includes(c)) return "retry_with_repair";
  // Permanent input errors — no retry helps
  if ([
    "generation_audio_length_exceeded",
    "generation_text_length_exceeded",
    "generation_unsupported_model",
    "generation_audio_missing",
    "generation_video_missing",
    "generation_input_validation_failed",
    "generation_internal_auth",
    // v143 — Sync.so could not fetch the input video URL (expired presigned S3
    // is the most common cause). Retrying with the same URL never helps; the
    // upstream caller must rehost into stable storage (see _shared/rehostPlate).
    "generation_input_video_inaccessible",
    "generation_input_audio_inaccessible",
  ].includes(c)) return "fail_fast";
  return "unknown";
}

/** Human-readable explanation for a Sync.so error_code (UI/diagnostics). */
export function explainSyncErrorCode(code?: string | null): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    generation_timeout: "Sync.so timed out (provider under load) — retrying",
    generation_pipeline_failed: "Sync.so pipeline error — retrying with variant ladder",
    generation_unhandled_error: "Sync.so unexpected error — retrying",
    generation_database_error: "Sync.so database error — retrying",
    generation_infra_storage_error: "Sync.so storage error — retrying",
    generation_infra_resource_exhausted: "Sync.so capacity full — retrying",
    generation_infra_service_unavailable: "Sync.so service unavailable — retrying",
    generation_input_audio_invalid: "Audio metadata invalid — re-encoding and retrying",
    generation_media_metadata_missing: "Audio/video metadata missing — re-encoding and retrying",
    generation_audio_length_exceeded: "Audio over 300s — cannot lipsync (split the dialog)",
    generation_text_length_exceeded: "Script over 5000 chars — shorten the dialog",
    generation_unsupported_model: "Selected lipsync model not available",
    generation_audio_missing: "Voiceover audio missing — regenerate the dialog",
    generation_video_missing: "Source video missing — regenerate the scene clip",
    generation_input_validation_failed: "Sync.so rejected the input — check audio/video format",
    generation_internal_auth: "Sync.so authentication failed — contact support",
    generation_input_video_inaccessible: "Plate-URL war beim Dispatch nicht mehr abrufbar (Quelle abgelaufen) — Szene bitte neu rendern",
    generation_input_audio_inaccessible: "Audio-URL war beim Dispatch nicht mehr abrufbar (Quelle abgelaufen) — Szene bitte neu rendern",
  };
  return map[String(code).toLowerCase()] ?? null;
}

/**
 * GET-fallback: when a FAILED webhook arrives with an empty payload, hit
 * `https://api.sync.so/v2/generate/{job_id}` to fetch the official
 * `error` + `error_code` fields. Returns null on any failure (callers
 * keep the original webhook fields).
 */
export async function fetchSyncJobError(jobId: string): Promise<{
  error?: string | null;
  error_code?: string | null;
} | null> {
  const apiKey = Deno.env.get("SYNC_API_KEY") ?? Deno.env.get("SYNCSO_API_KEY");
  if (!apiKey || !jobId) return null;
  try {
    const r = await fetch(`https://api.sync.so/v2/generate/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) {
      console.warn(`[syncso-preflight] GET generation ${jobId} → HTTP ${r.status}`);
      return null;
    }
    const j = await r.json().catch(() => null);
    if (!j) return null;
    return {
      error: typeof j.error === "string" ? j.error : null,
      error_code: typeof j.error_code === "string" ? j.error_code : null,
    };
  } catch (e) {
    console.warn(`[syncso-preflight] GET generation ${jobId} crash: ${(e as Error)?.message ?? e}`);
    return null;
  }
}

// ── WAV lead-in trim (Stage v28) ────────────────────────────────────────
/**
 * Strip leading silence from a 16-bit PCM WAV so the voice starts at
 * `keepLeadInSec` (default 0.2s). Sync.so `lipsync-2-pro` fails opaquely
 * ("An unknown error occurred." with no error_code) when given a 9s WAV
 * whose voice only starts at t=2.7s on a multi-face plate with manual
 * `active_speaker_detection`. Trimming to voice-onset removes the trigger
 * without changing voice content. Returns a fresh RIFF/WAVE.
 */
export function trimWavLeadIn(
  wav: Uint8Array,
  opts: { keepLeadInSec?: number; force?: boolean } = {},
): { bytes: Uint8Array; info: WavInfo; trimmedSec: number } {
  const keep = Math.max(0, opts.keepLeadInSec ?? 0.2);
  const info = inspectWav(wav);
  if (info.leadInSec <= keep + 0.05 && !opts.force) {
    // Nothing meaningful to trim.
    return { bytes: wav, info, trimmedSec: 0 };
  }
  const sr = info.sampleRate;
  const channels = info.channels;
  const bytesPerFrame = channels * 2;
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

  const dropFrames = Math.max(0, Math.round((info.leadInSec - keep) * sr));
  const remainingFrames = Math.max(0, info.totalFrames - dropFrames);
  const outDataLen = remainingFrames * bytesPerFrame;

  const out = new ArrayBuffer(44 + outDataLen);
  const ov = new DataView(out);
  ov.setUint32(0, 0x52494646, false);
  ov.setUint32(4, 36 + outDataLen, true);
  ov.setUint32(8, 0x57415645, false);
  ov.setUint32(12, 0x666d7420, false);
  ov.setUint32(16, 16, true);
  ov.setUint16(20, 1, true);
  ov.setUint16(22, channels, true);
  ov.setUint32(24, sr, true);
  ov.setUint32(28, sr * bytesPerFrame, true);
  ov.setUint16(32, bytesPerFrame, true);
  ov.setUint16(34, 16, true);
  ov.setUint32(36, 0x64617461, false);
  ov.setUint32(40, outDataLen, true);

  const srcByteOff = info.dataOff + dropFrames * bytesPerFrame;
  const srcSlice = new Uint8Array(
    wav.buffer,
    wav.byteOffset + srcByteOff,
    outDataLen,
  );
  new Uint8Array(out, 44, outDataLen).set(srcSlice);

  const outBytes = new Uint8Array(out);
  const outInfo: WavInfo = {
    ...info,
    totalFrames: remainingFrames,
    durSec: remainingFrames / sr,
    leadInSec: keep,
    dataOff: 44,
    dataLen: outDataLen,
  };
  return { bytes: outBytes, info: outInfo, trimmedSec: dropFrames / sr };
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
  /** Stage G F.4: composite face quality 0..1 (≥0.6 = safe for Sync.so). null when scorer didn't run. */
  faceScore?: number | null;
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
      faceScore: Number.isFinite(json.faceScore) ? Number(json.faceScore) : null,
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


// ── Stage F.3 — Provider Circuit Breaker ────────────────────────────────

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitDecision {
  /** true if dispatch is allowed; false if breaker is OPEN. */
  allow: boolean;
  state: CircuitState;
  /** Suggested defer in ms when allow=false. */
  retryInMs?: number;
  /** Why we're blocking (for telemetry / UI). */
  reason?: string;
  /** Recent failure count from rolling window. */
  recentFailures?: number;
}

const CIRCUIT_FAIL_THRESHOLD = 5;          // 5 fails in 5min trips breaker
const CIRCUIT_OPEN_DURATION_MS = 30 * 60_000; // 30 min
const CIRCUIT_HALF_OPEN_PROBE_MS = 30 * 60_000;

/**
 * Returns whether a dispatch to `provider` may proceed.
 *  - state=closed → always allow.
 *  - state=open & opened_at + 30min > now → block (defer).
 *  - state=open & opened_at + 30min <= now → flip to half_open + allow (probe).
 *  - state=half_open → allow exactly one probe, caller updates via record*.
 *
 * Also evaluates the rolling-window failure count: if state=closed but
 * recent failures ≥ threshold, we open the circuit synchronously and
 * block this call too.
 */
export async function evaluateCircuit(
  supabase: any,
  provider = "sync.so",
): Promise<CircuitDecision> {
  try {
    const { data: row, error } = await supabase
      .from("provider_circuit_state")
      .select("state, opened_at, fail_count, last_failure_at")
      .eq("provider", provider)
      .maybeSingle();
    if (error) {
      console.warn(`[circuit] read failed: ${error.message}`);
      return { allow: true, state: "closed", reason: "read_failed" };
    }
    const state = (row?.state ?? "closed") as CircuitState;
    const now = Date.now();

    if (state === "open") {
      const openedAt = row?.opened_at ? Date.parse(row.opened_at) : 0;
      const elapsed = now - openedAt;
      if (elapsed < CIRCUIT_OPEN_DURATION_MS) {
        return {
          allow: false,
          state: "open",
          retryInMs: Math.max(60_000, CIRCUIT_OPEN_DURATION_MS - elapsed),
          reason: "circuit_open",
        };
      }
      // Promote to half_open + let this call probe.
      await supabase
        .from("provider_circuit_state")
        .update({ state: "half_open", half_open_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("provider", provider);
      return { allow: true, state: "half_open", reason: "probe" };
    }

    // closed (or half_open) — also check rolling window for runaway failures
    const { data: countRow } = await supabase
      .rpc("syncso_recent_failure_count", { _window_min: 5 });
    const recent = typeof countRow === "number" ? countRow : Number(countRow) || 0;
    if (state === "closed" && recent >= CIRCUIT_FAIL_THRESHOLD) {
      await openCircuit(supabase, provider, "rolling_threshold", recent);
      await emitSystemAlert(supabase, {
        alert_type: "circuit_breaker_opened",
        severity: "critical",
        source: provider,
        message: `Circuit breaker OPEN: ${recent} failures in last 5 min`,
        payload: { recent_failures: recent, threshold: CIRCUIT_FAIL_THRESHOLD },
      });
      return {
        allow: false,
        state: "open",
        retryInMs: CIRCUIT_OPEN_DURATION_MS,
        reason: "rolling_threshold",
        recentFailures: recent,
      };
    }
    return { allow: true, state, recentFailures: recent };
  } catch (e) {
    console.warn(`[circuit] eval crash: ${(e as Error).message}`);
    return { allow: true, state: "closed", reason: "eval_crash" };
  }
}

export async function openCircuit(
  supabase: any,
  provider: string,
  errorClass: string,
  failCount?: number,
): Promise<void> {
  try {
    await supabase
      .from("provider_circuit_state")
      .update({
        state: "open",
        opened_at: new Date().toISOString(),
        last_failure_at: new Date().toISOString(),
        last_error_class: errorClass,
        fail_count: failCount ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", provider);
  } catch (e) {
    console.warn(`[circuit] open crash: ${(e as Error).message}`);
  }
}

export async function recordCircuitSuccess(
  supabase: any,
  provider = "sync.so",
): Promise<void> {
  try {
    await supabase
      .from("provider_circuit_state")
      .update({
        state: "closed",
        fail_count: 0,
        last_success_at: new Date().toISOString(),
        opened_at: null,
        half_open_at: null,
        last_error_class: null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", provider);
  } catch (e) {
    console.warn(`[circuit] success crash: ${(e as Error).message}`);
  }
}

export async function recordCircuitFailure(
  supabase: any,
  provider: string,
  errorClass: string,
): Promise<void> {
  try {
    // Read fail_count first to increment (no atomic increment in supabase-js)
    const { data } = await supabase
      .from("provider_circuit_state")
      .select("state, fail_count")
      .eq("provider", provider)
      .maybeSingle();
    const nextFail = (data?.fail_count ?? 0) + 1;
    const updates: Record<string, unknown> = {
      fail_count: nextFail,
      last_failure_at: new Date().toISOString(),
      last_error_class: errorClass,
      updated_at: new Date().toISOString(),
    };
    // If we're in half_open and the probe failed, slam back to open.
    if (data?.state === "half_open") {
      updates.state = "open";
      updates.opened_at = new Date().toISOString();
    }
    await supabase.from("provider_circuit_state").update(updates).eq("provider", provider);
  } catch (e) {
    console.warn(`[circuit] failure crash: ${(e as Error).message}`);
  }
}

// ── Stage F.6 — Schema-drift Detector + System Alerts ───────────────────

export interface SyncResponseShapeCheck {
  ok: boolean;
  missingKeys: string[];
}

const SYNC_REQUIRED_KEYS = ["id", "status"] as const;

/**
 * Validate that Sync.so /generate response carries the keys we depend on.
 * Returns { ok:false, missingKeys } if Sync.so changed their schema.
 * Caller MUST emit a system_alert + keep the job pending (no refund).
 */
export function validateSyncResponseShape(json: unknown): SyncResponseShapeCheck {
  const missingKeys: string[] = [];
  if (!json || typeof json !== "object") {
    return { ok: false, missingKeys: [...SYNC_REQUIRED_KEYS] };
  }
  const obj = json as Record<string, unknown>;
  for (const k of SYNC_REQUIRED_KEYS) {
    if (!(k in obj)) missingKeys.push(k);
  }
  return { ok: missingKeys.length === 0, missingKeys };
}

export interface SystemAlertInput {
  alert_type: string;
  severity?: "info" | "warning" | "critical";
  source: string;
  message: string;
  payload?: Record<string, unknown>;
}

/** Best-effort fire-and-forget system alert insert. Dedupe at type+source within 1h. */
export async function emitSystemAlert(
  supabase: any,
  alert: SystemAlertInput,
): Promise<void> {
  try {
    // Dedupe: skip if same alert_type + source raised within last 60 min and unacknowledged
    const sinceIso = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: dupes } = await supabase
      .from("system_alerts")
      .select("id")
      .eq("alert_type", alert.alert_type)
      .eq("source", alert.source)
      .eq("acknowledged", false)
      .gte("created_at", sinceIso)
      .limit(1);
    if (Array.isArray(dupes) && dupes.length > 0) return;
    await supabase.from("system_alerts").insert({
      alert_type: alert.alert_type,
      severity: alert.severity ?? "warning",
      source: alert.source,
      message: alert.message,
      payload: alert.payload ?? {},
    });
  } catch (e) {
    console.warn(`[system-alert] emit crash: ${(e as Error).message}`);
  }
}

// ── Stage F.7 — Auto-Tuner read ─────────────────────────────────────────

/**
 * Read the auto-tuner's preferred sync_source_kind from system_config.
 * Returns null if no signal yet — caller should fall back to its own default.
 */
export async function readPreferredSyncSourceKind(
  supabase: any,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "syncso.preferred_source_kind")
      .maybeSingle();
    const v = data?.value?.value;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

// ── v39 — Per-Turn Tight WAV slicer ─────────────────────────────────────

export interface SliceWindow {
  startSec: number;
  endSec: number;
}

/**
 * v39 — Slice a 16-bit PCM mono/stereo WAV to the union of [start,end]
 * windows and return a fresh RIFF/WAVE. Discontiguous windows are joined
 * with `gapSec` of silence (default 0.05s) so a single speaker with
 * multiple turns still gets one tight audio file. The output keeps the
 * source sample rate, bit depth and channel count.
 *
 * Used by compose-dialog-segments to convert silence-padded full-length
 * per-speaker WAVs into tight per-turn WAVs so Sync.so naturally returns
 * an output equal to the turn duration (no `startFrom` seek needed in the
 * Remotion compositor, bundle-version-independent).
 */
export function sliceWavToWindows(
  wav: Uint8Array,
  windows: SliceWindow[],
  opts: { gapSec?: number } = {},
): { bytes: Uint8Array; durSec: number; info: WavInfo } {
  const { gapSec = 0.05 } = opts;
  const info = inspectWav(wav);
  const { channels, sampleRate, bitsPerSample, dataOff, dataLen } = info;
  if (bitsPerSample !== 16) throw new Error(`sliceWav: unsupported bits=${bitsPerSample}`);
  const bytesPerFrame = channels * 2;
  const totalFrames = Math.floor(dataLen / bytesPerFrame);

  // Sort + clamp + drop empty windows.
  const norm = windows
    .map((w) => ({
      s: Math.max(0, Math.min(totalFrames / sampleRate, Number(w.startSec))),
      e: Math.max(0, Math.min(totalFrames / sampleRate, Number(w.endSec))),
    }))
    .filter((w) => Number.isFinite(w.s) && Number.isFinite(w.e) && w.e > w.s + 0.01)
    .sort((a, b) => a.s - b.s);
  if (norm.length === 0) throw new Error("sliceWav: no valid windows");

  // Merge overlapping windows.
  const merged: { s: number; e: number }[] = [];
  for (const w of norm) {
    const last = merged[merged.length - 1];
    if (last && w.s <= last.e + 0.01) last.e = Math.max(last.e, w.e);
    else merged.push({ s: w.s, e: w.e });
  }

  const gapFrames = Math.max(0, Math.round(gapSec * sampleRate));

  // v67 — Frame-exact slicing. Derive integer frame boundaries ONCE and
  // reuse them for both buffer allocation and the sample copy. Previously
  // allocation used `round((e-s)*sr)` while the copy used
  // `floor(e*sr) - floor(s*sr)`. For windows like [3.717, 6.71] @ 44100
  // these disagree by 1 frame, so `out.set()` writes past the allocated
  // buffer and throws "offset is out of bounds" — failing the whole pass
  // for 4-speaker scenes where short turn windows hit this rounding edge.
  const segs = merged.map((w) => {
    const startFrame = Math.max(0, Math.min(totalFrames, Math.floor(w.s * sampleRate)));
    const endFrame = Math.max(startFrame, Math.min(totalFrames, Math.floor(w.e * sampleRate)));
    return { startFrame, nFrames: endFrame - startFrame };
  });

  let outFrames = 0;
  for (let i = 0; i < segs.length; i++) {
    outFrames += Math.max(1, segs[i].nFrames);
    if (i < segs.length - 1) outFrames += gapFrames;
  }

  const outDataLen = outFrames * bytesPerFrame;
  const out = new Uint8Array(44 + outDataLen);
  const odv = new DataView(out.buffer);

  // RIFF header
  odv.setUint32(0, 0x52494646, false); // "RIFF"
  odv.setUint32(4, 36 + outDataLen, true);
  odv.setUint32(8, 0x57415645, false); // "WAVE"
  odv.setUint32(12, 0x666d7420, false); // "fmt "
  odv.setUint32(16, 16, true);
  odv.setUint16(20, 1, true); // PCM
  odv.setUint16(22, channels, true);
  odv.setUint32(24, sampleRate, true);
  odv.setUint32(28, sampleRate * bytesPerFrame, true);
  odv.setUint16(32, bytesPerFrame, true);
  odv.setUint16(34, bitsPerSample, true);
  odv.setUint32(36, 0x64617461, false); // "data"
  odv.setUint32(40, outDataLen, true);

  // Copy samples — same frame boundaries computed above, plus defensive
  // bounds so the destination offset can never exceed `out`.
  let writeFrame = 0;
  for (let i = 0; i < segs.length; i++) {
    const { startFrame, nFrames } = segs[i];
    if (nFrames > 0) {
      const srcByteOff = dataOff + startFrame * bytesPerFrame;
      const dstByteOff = 44 + writeFrame * bytesPerFrame;
      const copyLen = Math.min(
        nFrames * bytesPerFrame,
        Math.max(0, wav.length - srcByteOff),
        Math.max(0, out.length - dstByteOff),
      );
      if (copyLen > 0) {
        out.set(wav.subarray(srcByteOff, srcByteOff + copyLen), dstByteOff);
        writeFrame += Math.floor(copyLen / bytesPerFrame);
      }
    }
    if (i < segs.length - 1) writeFrame += gapFrames; // silence gap = zeroes (already zero-initialised)
  }

  const outInfo: WavInfo = {
    channels,
    sampleRate,
    bitsPerSample,
    totalFrames: outFrames,
    durSec: outFrames / sampleRate,
    dataOff: 44,
    dataLen: outDataLen,
    peakDbFs: info.peakDbFs,
    leadInSec: 0,
  };
  return { bytes: out, durSec: outInfo.durSec, info: outInfo };
}
