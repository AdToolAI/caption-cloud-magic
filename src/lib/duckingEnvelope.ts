/**
 * Audio Ducking — pure helpers for computing speech intervals
 * and translating them into a Web Audio gain automation.
 *
 * No DOM, no AudioContext side-effects — easy to test.
 */

export interface SpeechInterval {
  start: number; // seconds
  end: number;   // seconds
}

export interface DuckingSettings {
  /** Reduction in dB (positive number, e.g. 12 = -12 dB) */
  reductionDb: number;
  /** Attack in milliseconds (ramp from full → ducked) */
  attackMs: number;
  /** Release in milliseconds (ramp from ducked → full) */
  releaseMs: number;
  /** RMS threshold (0..1) used by the RMS-fallback detector only */
  threshold: number;
}

export interface AutomationPoint {
  time: number;  // seconds
  gain: number;  // linear (0..1)
}

export const DUCKING_PRESETS = {
  subtle:    { reductionDb: 6,  attackMs: 100, releaseMs: 600,  threshold: 0.05 },
  standard:  { reductionDb: 12, attackMs: 80,  releaseMs: 500,  threshold: 0.05 },
  aggressive:{ reductionDb: 18, attackMs: 50,  releaseMs: 400,  threshold: 0.05 },
} as const satisfies Record<string, DuckingSettings>;

export type DuckingPresetKey = keyof typeof DUCKING_PRESETS;

/** Convert a positive dB reduction value to a linear gain (e.g. 12 → ~0.251). */
export function dbReductionToGain(db: number): number {
  return Math.pow(10, -Math.abs(db) / 20);
}

/**
 * Group transcript words into continuous speech intervals.
 * Words separated by less than `gapMs` of silence are merged.
 */
export function transcriptToSpeechIntervals(
  transcript: Array<{ start: number; end: number; type?: string }>,
  gapMs = 300,
): SpeechInterval[] {
  if (!transcript || transcript.length === 0) return [];

  // Filter to spoken words only (skip pauses / non-words)
  const words = transcript
    .filter(w => (!w.type || w.type === 'normal' || w.type === 'filler') && w.end > w.start)
    .sort((a, b) => a.start - b.start);

  if (words.length === 0) return [];

  const gap = gapMs / 1000;
  const intervals: SpeechInterval[] = [];
  let cur: SpeechInterval = { start: words[0].start, end: words[0].end };

  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (w.start - cur.end <= gap) {
      cur.end = Math.max(cur.end, w.end);
    } else {
      intervals.push(cur);
      cur = { start: w.start, end: w.end };
    }
  }
  intervals.push(cur);
  return intervals;
}

/**
 * Detect speech intervals from raw audio via RMS-energy thresholding.
 * Used as fallback when no transcript is available.
 *
 * Chunks of `chunkMs` are scanned; chunks where RMS > threshold are
 * marked as speech, then merged with the same gap-merging strategy.
 */
export function rmsBasedSpeechDetection(
  buffer: AudioBuffer,
  threshold = 0.05,
  chunkMs = 50,
  gapMs = 300,
): SpeechInterval[] {
  const sampleRate = buffer.sampleRate;
  const chunkSamples = Math.max(1, Math.round((chunkMs / 1000) * sampleRate));
  const totalSamples = buffer.length;
  const numChannels = buffer.numberOfChannels;

  // Get all channel data once
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  const rawIntervals: SpeechInterval[] = [];
  let activeStart: number | null = null;

  for (let i = 0; i < totalSamples; i += chunkSamples) {
    let sumSq = 0;
    let count = 0;
    const end = Math.min(i + chunkSamples, totalSamples);
    for (let j = i; j < end; j++) {
      for (let c = 0; c < numChannels; c++) {
        const s = channels[c][j];
        sumSq += s * s;
        count++;
      }
    }
    const rms = Math.sqrt(sumSq / Math.max(1, count));
    const tSec = i / sampleRate;
    const tEnd = end / sampleRate;

    if (rms >= threshold) {
      if (activeStart === null) activeStart = tSec;
    } else if (activeStart !== null) {
      rawIntervals.push({ start: activeStart, end: tEnd });
      activeStart = null;
    }
  }
  if (activeStart !== null) {
    rawIntervals.push({ start: activeStart, end: totalSamples / sampleRate });
  }

  // Merge close intervals
  const gap = gapMs / 1000;
  const merged: SpeechInterval[] = [];
  for (const iv of rawIntervals) {
    const last = merged[merged.length - 1];
    if (last && iv.start - last.end <= gap) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

/**
 * Convert speech intervals into a list of (time, gain) automation points
 * suitable for `GainNode.gain.linearRampToValueAtTime`.
 *
 * Output starts at gain=1 at t=0 and ends at gain=1 at trackDuration.
 */
export function intervalsToGainAutomation(
  intervals: SpeechInterval[],
  totalDurationSec: number,
  settings: DuckingSettings,
): AutomationPoint[] {
  const fullGain = 1;
  const duckGain = dbReductionToGain(settings.reductionDb);
  const attack = settings.attackMs / 1000;
  const release = settings.releaseMs / 1000;

  const points: AutomationPoint[] = [{ time: 0, gain: fullGain }];

  for (const iv of intervals) {
    // Start ramp BEFORE the speech starts so we're already ducked when it begins
    const rampDownStart = Math.max(0, iv.start - attack);
    const rampDownEnd = iv.start;
    const rampUpStart = iv.end;
    const rampUpEnd = Math.min(totalDurationSec, iv.end + release);

    // Anchor full gain right before ramping down (avoid overlap with previous up-ramp)
    const last = points[points.length - 1];
    if (last.time < rampDownStart) {
      points.push({ time: rampDownStart, gain: fullGain });
    }
    points.push({ time: rampDownEnd, gain: duckGain });
    points.push({ time: rampUpStart, gain: duckGain });
    points.push({ time: rampUpEnd, gain: fullGain });
  }

  if (points[points.length - 1].time < totalDurationSec) {
    points.push({ time: totalDurationSec, gain: fullGain });
  }
  return points;
}

/**
 * Sample the gain automation at uniform time steps — used for SVG rendering.
 */
export function sampleAutomation(
  points: AutomationPoint[],
  durationSec: number,
  steps = 400,
): Array<{ t: number; g: number }> {
  if (points.length === 0 || durationSec <= 0) return [];
  const out: Array<{ t: number; g: number }> = [];
  const dt = durationSec / steps;
  let idx = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    while (idx < points.length - 1 && points[idx + 1].time <= t) idx++;
    const a = points[idx];
    const b = points[Math.min(idx + 1, points.length - 1)];
    if (b.time === a.time) {
      out.push({ t, g: a.gain });
    } else {
      const f = Math.max(0, Math.min(1, (t - a.time) / (b.time - a.time)));
      out.push({ t, g: a.gain + (b.gain - a.gain) * f });
    }
  }
  return out;
}
