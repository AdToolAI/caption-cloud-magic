/**
 * Audio-to-WAV pre-render utility.
 *
 * Why this exists:
 * Remotion Lambda renders a composition in parallel chunks. Each worker
 * decodes the source audio independently. With MP3 (CBR or VBR), tiny
 * decoder discrepancies at chunk boundaries can cause sample drift —
 * audible as micro-stutters/clicks at scene transitions.
 *
 * Solution: convert the generated MP3 voiceover to a WAV file with
 * EXACT length = ceil(targetDurationSeconds * 48000) samples, padded
 * with silence if the source is shorter. WAV is uncompressed and
 * sample-deterministic — every Lambda worker reads bit-identical samples
 * at the same byte offsets, so concat is glitch-free.
 */

const TARGET_SAMPLE_RATE = 48000;
const TARGET_CHANNELS = 2; // stereo

/**
 * Fetch + decode + pad/trim + re-encode an MP3 (or any decodable audio)
 * to a deterministic WAV Blob with exact target length.
 *
 * @param sourceUrl  URL of the source audio (e.g. generated MP3)
 * @param targetDurationSeconds  Desired exact length of output WAV
 */
export async function padAudioToExactWav(
  sourceUrl: string,
  targetDurationSeconds: number,
): Promise<{ blob: Blob; exactSeconds: number; samples: number }> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();

  // OfflineAudioContext at the target sample rate guarantees a deterministic,
  // sample-accurate render regardless of the browser's hardware rate.
  const targetSamples = Math.max(1, Math.ceil(targetDurationSeconds * TARGET_SAMPLE_RATE));

  // Decode using a regular AudioContext (most browsers won't decode in offline ctx)
  const decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  await decodeCtx.close();

  // Render through OfflineAudioContext at TARGET_SAMPLE_RATE / TARGET_CHANNELS
  // and exactly targetSamples frames — anything shorter gets silence-padded,
  // anything longer gets cleanly truncated.
  const offline = new OfflineAudioContext(TARGET_CHANNELS, targetSamples, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();

  const blob = audioBufferToWavBlob(rendered);
  return {
    blob,
    exactSeconds: targetSamples / TARGET_SAMPLE_RATE,
    samples: targetSamples,
  };
}

/** Encode an AudioBuffer as a 16-bit PCM WAV Blob. */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const bufferSize = 44 + dataSize;

  const ab = new ArrayBuffer(bufferSize);
  const view = new DataView(ab);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleaved PCM
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let s = channels[c][i];
      if (s > 1) s = 1; else if (s < -1) s = -1;
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([ab], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
