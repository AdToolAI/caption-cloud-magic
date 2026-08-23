import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  buildSpeechEnvelope,
  computeSpeechLock,
  decodeWavMono,
  envelopeAt,
  pearson,
  perSampleMouthEdit,
  V467_HIGH_CONFIDENCE_SAMPLES,
} from "./v467-speech-lock.ts";

/** 20 ms windows at 16 kHz; `pattern[i]` is the amplitude of window i. */
function envelopeFrom(pattern: number[], sampleRateHz = 16000) {
  const win = Math.round(0.02 * sampleRateHz);
  const pcm = new Float32Array(pattern.length * win);
  for (let w = 0; w < pattern.length; w++) {
    for (let i = 0; i < win; i++) pcm[w * win + i] = pattern[w];
  }
  return buildSpeechEnvelope(pcm, sampleRateHz);
}

/** N sample times at 30 fps starting at 0.02 s, one per 20 ms window index. */
function times(n: number, stepSec = 0.02) {
  return Array.from({ length: n }, (_, i) => i * stepSec);
}

Deno.test("speech-synchronous mouth edit → v_over_u > 2 and positive correlation", () => {
  const pattern = Array.from({ length: 20 }, (_, i) => (i % 4 < 2 ? 0.5 : 0.0));
  const env = envelopeFrom(pattern);
  const edits = pattern.map((p) => (p > 0 ? 12 : 3));
  const r = computeSpeechLock({
    mouthEdits: edits,
    sampleTimesVideoSec: times(20),
    envelope: env,
  });
  assert(r.v_over_u !== null && r.v_over_u > 2, `v_over_u=${r.v_over_u}`);
  assert((r.corr_rms_best_lag ?? 0) > 0.8);
  assertEquals(r.confidence, "high_confidence");
  assertEquals(r.guards.length, 0);
  assertEquals(r.timeline_mapping, "identity");
});

Deno.test("constant mouth edit → v_over_u ≈ 1, correlation ≈ 0 (V466-B pass-1 shape)", () => {
  const pattern = Array.from({ length: 20 }, (_, i) => (i % 4 < 2 ? 0.5 : 0.0));
  const env = envelopeFrom(pattern);
  const r = computeSpeechLock({
    mouthEdits: pattern.map(() => 9),
    sampleTimesVideoSec: times(20),
    envelope: env,
  });
  assertAlmostEquals(r.v_over_u ?? 0, 1, 1e-9);
  assertEquals(r.corr_rms_zero_lag, null, "constant series has no correlation");
});

Deno.test("silent track → low confidence, no inflated ratio", () => {
  const env = envelopeFrom(Array.from({ length: 20 }, () => 0));
  const r = computeSpeechLock({
    mouthEdits: Array.from({ length: 20 }, (_, i) => 5 + i),
    sampleTimesVideoSec: times(20),
    envelope: env,
  });
  assertEquals(r.confidence, "low_confidence");
  assert(r.guards.includes("audio_peak_below_floor"));
  assertEquals(r.v_over_u, null);
});

Deno.test("degenerate unvoiced denominator is refused, never a huge ratio", () => {
  const pattern = Array.from({ length: 20 }, (_, i) => (i % 4 < 2 ? 0.5 : 0.0));
  const env = envelopeFrom(pattern);
  const r = computeSpeechLock({
    mouthEdits: pattern.map((p) => (p > 0 ? 20 : 0.01)),
    sampleTimesVideoSec: times(20),
    envelope: env,
  });
  assertEquals(r.v_over_u, null);
  assert(r.guards.includes("unvoiced_denominator_degenerate"));
  assertEquals(r.low_confidence, true);
});

Deno.test("too few voiced or unvoiced samples → low confidence", () => {
  const pattern = Array.from({ length: 20 }, (_, i) => (i < 18 ? 0.5 : 0.0));
  const env = envelopeFrom(pattern);
  const r = computeSpeechLock({
    mouthEdits: pattern.map((p) => (p > 0 ? 10 : 4)),
    sampleTimesVideoSec: times(20),
    envelope: env,
  });
  assert(r.guards.includes("unvoiced_samples_below_min"));
  assertEquals(r.v_over_u, null);
});

Deno.test("production N=6 is always low confidence (no forced 16-still live measure)", () => {
  const pattern = [0.5, 0.5, 0.0, 0.0, 0.5, 0.5];
  const env = envelopeFrom(pattern);
  const r = computeSpeechLock({
    mouthEdits: [12, 12, 3, 3, 12, 12],
    sampleTimesVideoSec: times(6),
    envelope: env,
  });
  assertEquals(r.samples, 6);
  assert(r.samples < V467_HIGH_CONFIDENCE_SAMPLES);
  assertEquals(r.confidence, "low_confidence");
  assert(r.guards.includes("samples_below_high_confidence"));
});

Deno.test("audio offset is carried explicitly, not assumed", () => {
  const pattern = Array.from({ length: 20 }, (_, i) => (i % 4 < 2 ? 0.5 : 0.0));
  const env = envelopeFrom(pattern);
  const r = computeSpeechLock({
    mouthEdits: pattern.map((p) => (p > 0 ? 12 : 3)),
    sampleTimesVideoSec: times(20),
    envelope: env,
    audioOffsetSec: 0.25,
  });
  assertEquals(r.timeline_mapping, "offset");
  assertEquals(r.audio_offset_sec, 0.25);
  assertEquals(r.sample_times_audio[0], 0.25);
  assertEquals(r.sample_times_video[0], 0);
});

Deno.test("best lag is searched only inside the fixed ±3-frame window", () => {
  const pattern = Array.from({ length: 24 }, (_, i) => (i % 6 < 3 ? 0.5 : 0.0));
  const env = envelopeFrom(pattern);
  // Mouth edit trails the audio by exactly one 20 ms window.
  const edits = pattern.map((_, i) => (i > 0 && pattern[i - 1] > 0 ? 12 : 3));
  const r = computeSpeechLock({
    mouthEdits: edits,
    sampleTimesVideoSec: times(24),
    envelope: env,
    fps: 50, // 20 ms per frame, so ±3 frames == ±60 ms
  });
  assert(Math.abs(r.best_lag_ms ?? 0) <= r.lag_window_ms + 1e-9);
  assert((r.corr_rms_best_lag ?? -1) >= (r.corr_rms_zero_lag ?? -1));
});

Deno.test("missing audio envelope yields telemetry-absent, never a verdict", () => {
  const r = computeSpeechLock({
    mouthEdits: [1, 2, 3],
    sampleTimesVideoSec: [0, 0.1, 0.2],
    envelope: null,
  });
  assertEquals(r.reason, "v467_unavailable:no_audio_envelope");
  assertEquals(r.v_over_u, null);
  assertEquals(r.confidence, "low_confidence");
});

Deno.test("per-sample mouth edit resolves the series in time", () => {
  const mk = (v: number) => ({
    width: 2,
    height: 2,
    data: new Uint8Array([v, v, v, 255, v, v, v, 255, v, v, v, 255, v, v, v, 255]),
  });
  const series = perSampleMouthEdit(
    [mk(10), mk(10)],
    [mk(10), mk(40)],
    { bx: 0, by: 0, bw: 2, bh: 2 },
  );
  assertAlmostEquals(series[0], 0, 1e-6);
  assertAlmostEquals(series[1], 30, 1e-6);
});

Deno.test("wav decoder reads PCM16 mono and rejects garbage", () => {
  const sr = 16000;
  const n = 320;
  const buf = new Uint8Array(44 + n * 2);
  const dv = new DataView(buf.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (buf[o + i] = c.charCodeAt(0)));
  w(0, "RIFF");
  dv.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, "data");
  dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, 16384, true);
  const decoded = decodeWavMono(buf);
  assert(decoded !== null);
  assertEquals(decoded!.sampleRateHz, sr);
  assertAlmostEquals(decoded!.samples[0], 0.5, 1e-3);
  assertEquals(decodeWavMono(new Uint8Array(10)), null);
});

Deno.test("envelope lookups outside the track return 0, pearson needs 3 points", () => {
  const env = envelopeFrom([0.4, 0.4, 0.0]);
  assertEquals(envelopeAt(env, 99), 0);
  assertEquals(envelopeAt(env, -1), 0);
  assertEquals(pearson([1, 2], [1, 2]), null);
});
