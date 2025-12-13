/**
 * Audio Resampler Utility
 * Uses Web Audio API to resample audio to target sample rate
 * Required because resemble-enhance outputs 44.1kHz regardless of input
 */

/**
 * Resample audio from a URL to a target sample rate
 * @param audioUrl - URL of the audio to resample
 * @param targetSampleRate - Target sample rate (e.g., 16000 for 16kHz)
 * @returns Blob URL of resampled audio
 */
export async function resampleAudio(
  audioUrl: string,
  targetSampleRate: number
): Promise<string> {
  console.log(`Resampling audio from URL to ${targetSampleRate}Hz...`);
  
  // Fetch the audio file
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  
  // Decode with standard AudioContext (uses browser's native sample rate)
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  console.log(`Original audio: ${audioBuffer.sampleRate}Hz, ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} channels`);
  
  // If already at target rate, no resampling needed
  if (audioBuffer.sampleRate === targetSampleRate) {
    console.log('Audio already at target sample rate, no resampling needed');
    audioContext.close();
    return audioUrl;
  }
  
  // Calculate new length based on target sample rate
  const targetLength = Math.ceil(audioBuffer.duration * targetSampleRate);
  
  // Create OfflineAudioContext for resampling
  const offlineContext = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    targetLength,
    targetSampleRate
  );
  
  // Create buffer source and connect
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start(0);
  
  // Render the resampled audio
  const resampledBuffer = await offlineContext.startRendering();
  console.log(`Resampled audio: ${resampledBuffer.sampleRate}Hz, ${resampledBuffer.duration.toFixed(2)}s`);
  
  // Convert to WAV blob
  const wavBlob = audioBufferToWav(resampledBuffer);
  const blobUrl = URL.createObjectURL(wavBlob);
  
  // Cleanup
  audioContext.close();
  
  return blobUrl;
}

/**
 * Convert AudioBuffer to WAV Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  // Interleave channels
  const length = buffer.length * numChannels * 2;
  const outputBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(outputBuffer);
  
  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, format, true); // AudioFormat
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);
  
  // Write interleaved audio data
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  
  return new Blob([outputBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
