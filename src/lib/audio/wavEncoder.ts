/**
 * Minimal WAV encoder: PCM 16-bit mono at a chosen sample rate.
 * Concatenates Float32 chunks from getUserMedia and writes a
 * self-contained RIFF/WAVE Blob — no MediaRecorder-fragment issues,
 * decodable on every browser (incl. Safari) and by ElevenLabs.
 */

function flattenChunks(chunks: Float32Array[]): Float32Array {
  let length = 0;
  for (const c of chunks) length += c.length;
  const out = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function downsample(buffer: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate === inRate) return buffer;
  const ratio = inRate / outRate;
  const outLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(outLength);
  let iOut = 0;
  let iIn = 0;
  while (iOut < outLength) {
    const nextIn = Math.round((iOut + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let i = iIn; i < nextIn && i < buffer.length; i++) {
      sum += buffer[i];
      count++;
    }
    result[iOut] = count > 0 ? sum / count : 0;
    iOut++;
    iIn = nextIn;
  }
  return result;
}

export function encodeWav(
  chunks: Float32Array[],
  sourceSampleRate: number,
  targetSampleRate = 16000,
): { blob: Blob; durationSec: number; sampleCount: number } {
  const flat = flattenChunks(chunks);
  const resampled = downsample(flat, sourceSampleRate, targetSampleRate);
  const sampleCount = resampled.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const byteRate = targetSampleRate * blockAlign;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bit depth
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < sampleCount; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return {
    blob: new Blob([buffer], { type: "audio/wav" }),
    durationSec: sampleCount / targetSampleRate,
    sampleCount,
  };
}

export function computeRms(chunks: Float32Array[]): number {
  let sum = 0;
  let n = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      sum += c[i] * c[i];
      n++;
    }
  }
  return n > 0 ? Math.sqrt(sum / n) : 0;
}
