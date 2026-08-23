/**
 * V467-A — SPEECH-LOCKED MOUTH EDIT (TELEMETRY ONLY, NEVER A VERDICT)
 * ---------------------------------------------------------------------------
 * `mouth_over_frame` (V465) asks: did the provider change the MOUTH more than
 * the rest of the frame? — spatial specificity.
 *
 * V467 asks the orthogonal question: does that mouth change happen WHEN speech
 * happens? — temporal speech coupling. Evidence: `docs/v466b-noop-vs-moved-same-scene.md`
 * (scene be60d106, one plate, 5 passes): NOOP v/u 1.22 / 1.53 (corr 0.20 / 0.42)
 * against MOVED+GRAY 2.01 / 2.21 / 2.26 (corr 0.57 / 0.59 / 0.67).
 *
 * HARD CONTRACT for V467-A:
 *   - PURE + telemetry. Nothing here may terminalize a pass, refund, retry,
 *     dispatch, or influence `resolveV465Verdict`.
 *   - No extra Lambda stills are rendered for this metric. It rides on the
 *     stills the V465 measurement already decoded. With the production default
 *     of N=6 the result is ALWAYS `low_confidence`; `high_confidence` requires
 *     N >= 16, which today only the V466-A gray-band re-measure produces.
 *   - Audio and video are sampled on ONE explicit timeline; the mapping is
 *     reported (`timeline_mapping`, `sample_times_video`, `sample_times_audio`,
 *     `audio_offset_sec`) instead of assumed silently.
 *   - Degenerate ratios are refused, never inflated: too few voiced/unvoiced
 *     samples, a near-zero unvoiced denominator or a silent track all yield
 *     `low_confidence` with a null `v_over_u`.
 */

export const V467_HIGH_CONFIDENCE_SAMPLES = 16;
/** RMS window used to build the speech envelope. */
export const V467_ENVELOPE_WINDOW_SEC = 0.02;
/** Voiced when window RMS exceeds this fraction of the track peak. */
export const V467_VOICED_PEAK_FRACTION = 0.15;
/** Absolute floor for the track peak — below this the track is silence. */
export const V467_AUDIO_PEAK_FLOOR = 1e-3;
export const V467_MIN_VOICED_SAMPLES = 4;
export const V467_MIN_UNVOICED_SAMPLES = 3;
/** Luma units. Below this the unvoiced denominator is degenerate. */
export const V467_UNVOICED_FLOOR = 0.5;
/** Lag search window for `corr_rms_best_lag`, in frames at 30 fps (±100 ms). */
export const V467_MAX_LAG_FRAMES = 3;
export const V467_FPS = 30;

export interface V467DecodedStill {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray | number[];
}

export interface V467RoiBox {
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

export interface V467SpeechEnvelope {
  /** RMS per window, in track order. */
  rms: number[];
  windowSec: number;
  durationSec: number;
  peak: number;
  sampleRateHz: number;
}

export type V467Confidence = "high_confidence" | "low_confidence";

export interface V467SpeechLock {
  /** voiced mouth edit / unvoiced mouth edit — null when degenerate. */
  v_over_u: number | null;
  voiced_mouth_edit: number | null;
  unvoiced_mouth_edit: number | null;
  corr_rms_zero_lag: number | null;
  corr_rms_best_lag: number | null;
  best_lag_ms: number | null;
  lag_window_ms: number;
  samples: number;
  voiced_samples: number;
  unvoiced_samples: number;
  confidence: V467Confidence;
  low_confidence: boolean;
  /** Every guard that fired, in evaluation order. Empty on a clean measurement. */
  guards: string[];
  reason: string;
  timeline_mapping: "identity" | "offset";
  audio_offset_sec: number;
  sample_times_video: number[];
  sample_times_audio: number[];
  audio_peak: number;
  audio_duration_sec: number | null;
  mouth_edit_series: number[];
  rms_series: number[];
  high_confidence_samples: number;
}

const EPS = 1e-9;

function luma(img: V467DecodedStill, off: number): number {
  return 0.299 * (img.data[off] as number) +
    0.587 * (img.data[off + 1] as number) +
    0.114 * (img.data[off + 2] as number);
}

/**
 * PURE — per-sample mean |out - in| inside the mouth ROI. One value per still
 * pair, in sample order. Same pixels V465 aggregates, kept resolved in time.
 */
export function perSampleMouthEdit(
  preclipStills: V467DecodedStill[],
  providerStills: V467DecodedStill[],
  roi: V467RoiBox,
): number[] {
  const n = Math.min(preclipStills.length, providerStills.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = preclipStills[i];
    const b = providerStills[i];
    let sum = 0;
    let count = 0;
    for (let y = roi.by; y < roi.by + roi.bh; y++) {
      for (let x = roi.bx; x < roi.bx + roi.bw; x++) {
        sum += Math.abs(luma(a, (y * a.width + x) * 4) - luma(b, (y * b.width + x) * 4));
        count++;
      }
    }
    out.push(count > 0 ? sum / count : NaN);
  }
  return out;
}

/**
 * PURE — RMS envelope of mono PCM. `windowSec` fixed at 20 ms so every pass in
 * the cohort is measured identically.
 */
export function buildSpeechEnvelope(
  samples: Float32Array | number[],
  sampleRateHz: number,
  windowSec = V467_ENVELOPE_WINDOW_SEC,
): V467SpeechEnvelope {
  const win = Math.max(1, Math.round(windowSec * sampleRateHz));
  const count = Math.floor(samples.length / win);
  const rms: number[] = [];
  for (let w = 0; w < count; w++) {
    let acc = 0;
    for (let i = w * win; i < (w + 1) * win; i++) {
      const v = samples[i] as number;
      acc += v * v;
    }
    rms.push(Math.sqrt(acc / win));
  }
  return {
    rms,
    windowSec: win / sampleRateHz,
    durationSec: samples.length / sampleRateHz,
    peak: rms.length ? Math.max(...rms) : 0,
    sampleRateHz,
  };
}

/** PURE — envelope value at an absolute audio timestamp (0 outside the track). */
export function envelopeAt(env: V467SpeechEnvelope, tSec: number): number {
  if (!env.rms.length || !Number.isFinite(tSec) || tSec < 0) return 0;
  const idx = Math.floor(tSec / env.windowSec);
  return idx >= 0 && idx < env.rms.length ? env.rms[idx] : 0;
}

/** PURE — Pearson correlation; null when either series is constant. */
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da <= EPS || db <= EPS) return null;
  return num / Math.sqrt(da * db);
}

export interface ComputeSpeechLockArgs {
  /** One mouth-edit value per still pair, in sample order. */
  mouthEdits: number[];
  /** Video timestamps of those samples, seconds from the pre-clip start. */
  sampleTimesVideoSec: number[];
  envelope: V467SpeechEnvelope | null;
  /**
   * t_audio = t_video + audioOffsetSec. Explicit, never assumed: trims,
   * lead-in and `cut_off` all land here. 0 means the provider contract is a
   * shared timeline (`timeline_mapping: "identity"`).
   */
  audioOffsetSec?: number;
  fps?: number;
  maxLagFrames?: number;
  highConfidenceSamples?: number;
}

function empty(reason: string, partial: Partial<V467SpeechLock> = {}): V467SpeechLock {
  return {
    v_over_u: null,
    voiced_mouth_edit: null,
    unvoiced_mouth_edit: null,
    corr_rms_zero_lag: null,
    corr_rms_best_lag: null,
    best_lag_ms: null,
    lag_window_ms: (V467_MAX_LAG_FRAMES / V467_FPS) * 1000,
    samples: 0,
    voiced_samples: 0,
    unvoiced_samples: 0,
    confidence: "low_confidence",
    low_confidence: true,
    guards: [reason],
    reason,
    timeline_mapping: "identity",
    audio_offset_sec: 0,
    sample_times_video: [],
    sample_times_audio: [],
    audio_peak: 0,
    audio_duration_sec: null,
    mouth_edit_series: [],
    rms_series: [],
    high_confidence_samples: V467_HIGH_CONFIDENCE_SAMPLES,
    ...partial,
  };
}

/**
 * PURE — the V467-A telemetry record. Never throws, never returns a verdict.
 */
export function computeSpeechLock(args: ComputeSpeechLockArgs): V467SpeechLock {
  const fps = args.fps ?? V467_FPS;
  const maxLag = args.maxLagFrames ?? V467_MAX_LAG_FRAMES;
  const highN = args.highConfidenceSamples ?? V467_HIGH_CONFIDENCE_SAMPLES;
  const offset = Number.isFinite(args.audioOffsetSec) ? Number(args.audioOffsetSec) : 0;
  const lagWindowMs = (maxLag / fps) * 1000;

  const edits = (args.mouthEdits ?? []).filter((v) => Number.isFinite(v));
  if (!edits.length || edits.length !== (args.mouthEdits ?? []).length) {
    return empty("v467_unavailable:mouth_edit_series_invalid", { lag_window_ms: lagWindowMs });
  }
  const env = args.envelope;
  if (!env || !env.rms.length) {
    return empty("v467_unavailable:no_audio_envelope", {
      samples: edits.length,
      mouth_edit_series: edits,
      lag_window_ms: lagWindowMs,
    });
  }
  const timesVideo = (args.sampleTimesVideoSec ?? []).slice(0, edits.length);
  if (timesVideo.length !== edits.length) {
    return empty("v467_unavailable:sample_time_mismatch", { lag_window_ms: lagWindowMs });
  }
  const timesAudio = timesVideo.map((t) => t + offset);
  const rmsSeries = timesAudio.map((t) => envelopeAt(env, t));

  const base: V467SpeechLock = {
    ...empty("measured"),
    guards: [],
    reason: "measured",
    samples: edits.length,
    timeline_mapping: offset === 0 ? "identity" : "offset",
    audio_offset_sec: offset,
    sample_times_video: timesVideo,
    sample_times_audio: timesAudio,
    audio_peak: env.peak,
    audio_duration_sec: env.durationSec,
    mouth_edit_series: edits,
    rms_series: rmsSeries,
    lag_window_ms: lagWindowMs,
    high_confidence_samples: highN,
  };

  const guards: string[] = [];
  if (edits.length < highN) guards.push("samples_below_high_confidence");
  if (env.peak < V467_AUDIO_PEAK_FLOOR) guards.push("audio_peak_below_floor");

  // ── voiced / unvoiced split ───────────────────────────────────────────────
  const voicedThreshold = env.peak * V467_VOICED_PEAK_FRACTION;
  const voiced: number[] = [];
  const unvoiced: number[] = [];
  for (let i = 0; i < edits.length; i++) {
    (rmsSeries[i] > voicedThreshold ? voiced : unvoiced).push(edits[i]);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const voicedMean = voiced.length ? mean(voiced) : null;
  const unvoicedMean = unvoiced.length ? mean(unvoiced) : null;

  if (voiced.length < V467_MIN_VOICED_SAMPLES) guards.push("voiced_samples_below_min");
  if (unvoiced.length < V467_MIN_UNVOICED_SAMPLES) guards.push("unvoiced_samples_below_min");
  if (unvoicedMean != null && unvoicedMean < V467_UNVOICED_FLOOR) {
    guards.push("unvoiced_denominator_degenerate");
  }

  const ratioAllowed = voiced.length >= V467_MIN_VOICED_SAMPLES &&
    unvoiced.length >= V467_MIN_UNVOICED_SAMPLES &&
    unvoicedMean != null && unvoicedMean >= V467_UNVOICED_FLOOR &&
    env.peak >= V467_AUDIO_PEAK_FLOOR;

  // ── correlation, zero lag and inside the fixed ±window ───────────────────
  const corrZero = pearson(edits, rmsSeries);
  let bestCorr = corrZero;
  let bestLagFrames = corrZero == null ? null : 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    if (lag === 0) continue;
    const shifted = timesAudio.map((t) => envelopeAt(env, t + lag / fps));
    const c = pearson(edits, shifted);
    if (c != null && (bestCorr == null || c > bestCorr)) {
      bestCorr = c;
      bestLagFrames = lag;
    }
  }

  return {
    ...base,
    v_over_u: ratioAllowed && voicedMean != null && unvoicedMean != null
      ? voicedMean / unvoicedMean
      : null,
    voiced_mouth_edit: voicedMean,
    unvoiced_mouth_edit: unvoicedMean,
    corr_rms_zero_lag: corrZero,
    corr_rms_best_lag: bestCorr,
    best_lag_ms: bestLagFrames == null ? null : (bestLagFrames / fps) * 1000,
    voiced_samples: voiced.length,
    unvoiced_samples: unvoiced.length,
    confidence: guards.length === 0 && edits.length >= highN
      ? "high_confidence"
      : "low_confidence",
    low_confidence: !(guards.length === 0 && edits.length >= highN),
    guards,
    reason: guards.length ? `measured:${guards.join(",")}` : "measured",
  };
}

/**
 * PURE — minimal RIFF/WAVE reader (PCM16, PCM24, PCM32, IEEE float32),
 * downmixed to mono. Returns null for anything it does not understand instead
 * of guessing — an unreadable track is telemetry-absent, not a verdict.
 */
export function decodeWavMono(
  bytes: Uint8Array,
): { samples: Float32Array; sampleRateHz: number } | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) =>
    String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let pos = 12;
  let format = 0;
  let channels = 0;
  let sampleRateHz = 0;
  let bits = 0;
  let dataOffset = -1;
  let dataLength = 0;
  while (pos + 8 <= bytes.byteLength) {
    const id = tag(pos);
    const size = view.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt ") {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRateHz = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === "data") {
      dataOffset = body;
      dataLength = Math.min(size, bytes.byteLength - body);
    }
    pos = body + size + (size % 2);
  }
  if (dataOffset < 0 || !channels || !sampleRateHz) return null;

  const bytesPerSample = bits / 8;
  if (![2, 3, 4].includes(bytesPerSample)) return null;
  const frameBytes = bytesPerSample * channels;
  const frames = Math.floor(dataLength / frameBytes);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) {
      const o = dataOffset + f * frameBytes + c * bytesPerSample;
      if (format === 3 && bytesPerSample === 4) acc += view.getFloat32(o, true);
      else if (bytesPerSample === 2) acc += view.getInt16(o, true) / 32768;
      else if (bytesPerSample === 3) {
        const v = (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16)) << 8;
        acc += (v >> 8) / 8388608;
      } else acc += view.getInt32(o, true) / 2147483648;
    }
    out[f] = acc / channels;
  }
  return { samples: out, sampleRateHz };
}
