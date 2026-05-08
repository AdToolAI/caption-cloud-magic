/**
 * stitchSpeakerSegments — Client-side WebAudio stitching for multi-speaker VO.
 *
 * Decodes each per-segment MP3 (returned as base64 by `generate-multi-speaker-vo`),
 * concatenates with optional inter-speaker gap, and outputs a single sample-accurate
 * WAV blob — ready for the existing voiceover-audio bucket pipeline.
 *
 * Why client-side?
 *   • Reuses the proven WAV path (Lambda renderer prefers WAV).
 *   • No server-side audio decoding (no ffmpeg dep in Deno edge runtime).
 *   • Per-segment files stay small → low memory.
 */

export interface StitchSegment {
  speakerId: string;
  audioBase64: string;
  mime: string; // 'audio/mpeg'
}

export interface StitchResult {
  /** Final WAV blob (44.1 kHz, mono, 16-bit PCM). */
  wavBlob: Blob;
  /** Total duration in seconds (excluding any silence tail). */
  durationSeconds: number;
  /** Per-segment timing — useful for subtitle alignment & UI cards. */
  segmentTimings: Array<{ speakerId: string; startSec: number; endSec: number }>;
}

const TARGET_SAMPLE_RATE = 44100;

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function audioBufferToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  // Mono 16-bit PCM WAV.
  const numFrames = samples.length;
  const byteLen = 44 + numFrames * 2;
  const ab = new ArrayBuffer(byteLen);
  const dv = new DataView(ab);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + numFrames * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);              // PCM
  dv.setUint16(22, 1, true);              // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true);              // block align
  dv.setUint16(34, 16, true);             // bits per sample
  writeStr(36, 'data');
  dv.setUint32(40, numFrames * 2, true);

  let off = 44;
  for (let i = 0; i < numFrames; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    off += 2;
  }
  return new Blob([ab], { type: 'audio/wav' });
}

/** Down-mix to mono and resample to TARGET_SAMPLE_RATE via linear interp. */
function toMono44k(buf: AudioBuffer): Float32Array {
  const ch = buf.numberOfChannels;
  const src = buf.getChannelData(0);
  const mono = new Float32Array(src.length);
  if (ch === 1) {
    mono.set(src);
  } else {
    const right = buf.getChannelData(1);
    for (let i = 0; i < src.length; i++) mono[i] = (src[i] + right[i]) * 0.5;
  }
  if (buf.sampleRate === TARGET_SAMPLE_RATE) return mono;

  const ratio = buf.sampleRate / TARGET_SAMPLE_RATE;
  const outLen = Math.floor(mono.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, mono.length - 1);
    const frac = idx - i0;
    out[i] = mono[i0] * (1 - frac) + mono[i1] * frac;
  }
  return out;
}

export async function stitchSpeakerSegments(
  segments: StitchSegment[],
  opts: { gapMs?: number } = {},
): Promise<StitchResult> {
  if (!segments.length) throw new Error('No segments to stitch');
  const gapMs = Math.max(0, Math.min(2000, opts.gapMs ?? 180));

  const ACtor: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!ACtor) throw new Error('WebAudio not supported in this browser');
  const ctx = new ACtor({ sampleRate: TARGET_SAMPLE_RATE });

  try {
    const decoded: Float32Array[] = [];
    const timings: StitchResult['segmentTimings'] = [];
    const gapSamples = Math.round((gapMs / 1000) * TARGET_SAMPLE_RATE);
    let cursorSamples = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const ab = base64ToArrayBuffer(seg.audioBase64);
      // decodeAudioData mutates the buffer reference — use a copy.
      const buf = await ctx.decodeAudioData(ab.slice(0));
      const mono = toMono44k(buf);
      decoded.push(mono);

      const startSec = cursorSamples / TARGET_SAMPLE_RATE;
      const endSec = (cursorSamples + mono.length) / TARGET_SAMPLE_RATE;
      timings.push({ speakerId: seg.speakerId, startSec, endSec });

      cursorSamples += mono.length;
      if (i < segments.length - 1) cursorSamples += gapSamples;
    }

    const total = new Float32Array(cursorSamples);
    let off = 0;
    for (let i = 0; i < decoded.length; i++) {
      total.set(decoded[i], off);
      off += decoded[i].length;
      if (i < decoded.length - 1) off += gapSamples;
    }

    const wavBlob = audioBufferToWavBlob(total, TARGET_SAMPLE_RATE);
    return {
      wavBlob,
      durationSeconds: total.length / TARGET_SAMPLE_RATE,
      segmentTimings: timings,
    };
  } finally {
    try { await ctx.close(); } catch { /* noop */ }
  }
}
