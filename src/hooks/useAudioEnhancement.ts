import { useCallback } from 'react';

interface EnhancementOptions {
  normalize?: boolean;
  compression?: boolean;
  gainBoost?: number; // dB
  highPassFilter?: boolean; // Remove low frequency rumble
  lowPassFilter?: boolean; // Remove high frequency hiss
  voiceEQ?: boolean; // Boost voice clarity frequencies
}

/**
 * Web Audio API-based client-side audio enhancement
 * Full studio-quality processing without external APIs
 * - High-pass filter: Removes low frequency rumble (80Hz)
 * - Low-pass filter: Removes high frequency hiss (12kHz)
 * - Voice EQ: Boosts clarity frequencies (2-4kHz)
 * - Compression: Reduces dynamic range for consistent loudness
 * - Gain boost: Increases overall volume
 * - Normalization: Adjusts volume to consistent level
 */
export function useAudioEnhancement() {
  
  const enhanceAudio = useCallback(async (
    audioUrl: string, 
    options: EnhancementOptions = { 
      normalize: true, 
      compression: true, 
      gainBoost: 3,
      highPassFilter: true,
      lowPassFilter: true,
      voiceEQ: true
    }
  ): Promise<string> => {
    console.log('Starting client-side audio enhancement with Web Audio API');
    console.log('Enhancement options:', options);
    
    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    try {
      // Fetch and decode the audio
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      console.log('Audio decoded:', {
        sampleRate: audioBuffer.sampleRate,
        duration: audioBuffer.duration,
        numberOfChannels: audioBuffer.numberOfChannels,
        length: audioBuffer.length
      });
      
      // Create offline context for processing
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );
      
      // Create source
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      
      let currentNode: AudioNode = source;
      
      // Apply high-pass filter to remove low frequency rumble (120Hz - aggressive)
      if (options.highPassFilter) {
        const highPass = offlineContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 120;  // Increased from 80Hz for better noise reduction
        highPass.Q.value = 1.0;  // Sharper cutoff
        
        currentNode.connect(highPass);
        currentNode = highPass;
        console.log('High-pass filter applied at 120Hz');
      }
      
      // Apply low-pass filter to remove high frequency hiss (10kHz - aggressive)
      if (options.lowPassFilter) {
        const lowPass = offlineContext.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 10000;  // Reduced from 12kHz for better hiss removal
        lowPass.Q.value = 0.9;
        
        currentNode.connect(lowPass);
        currentNode = lowPass;
        console.log('Low-pass filter applied at 10kHz');
      }
      
      // Notch filter to remove 60Hz hum from power lines (US)
      const notch60 = offlineContext.createBiquadFilter();
      notch60.type = 'notch';
      notch60.frequency.value = 60;
      notch60.Q.value = 30;  // Very narrow
      currentNode.connect(notch60);
      currentNode = notch60;
      console.log('Notch filter applied at 60Hz');
      
      // Notch filter to remove 50Hz hum (European power frequency)
      const notch50 = offlineContext.createBiquadFilter();
      notch50.type = 'notch';
      notch50.frequency.value = 50;
      notch50.Q.value = 30;
      currentNode.connect(notch50);
      currentNode = notch50;
      console.log('Notch filter applied at 50Hz');
      
      // Muddiness reduction at 500Hz (reduces background noise)
      const mudCut = offlineContext.createBiquadFilter();
      mudCut.type = 'peaking';
      mudCut.frequency.value = 500;
      mudCut.Q.value = 1.5;
      mudCut.gain.value = -2;  // -2dB cut
      currentNode.connect(mudCut);
      currentNode = mudCut;
      console.log('Muddiness cut applied: -2dB at 500Hz');
      
      // Apply voice clarity EQ (boost 2-4kHz range)
      if (options.voiceEQ) {
        const voiceEQ = offlineContext.createBiquadFilter();
        voiceEQ.type = 'peaking';
        voiceEQ.frequency.value = 3000; // 3kHz - voice presence
        voiceEQ.Q.value = 1.0;
        voiceEQ.gain.value = 3; // +3dB boost
        
        currentNode.connect(voiceEQ);
        currentNode = voiceEQ;
        console.log('Voice EQ applied: +3dB at 3kHz');
      }
      
      // Apply compression if enabled
      if (options.compression) {
        const compressor = offlineContext.createDynamicsCompressor();
        compressor.threshold.value = -24;  // Start compressing at -24dB
        compressor.knee.value = 12;        // Soft knee
        compressor.ratio.value = 4;        // 4:1 compression ratio
        compressor.attack.value = 0.003;   // 3ms attack
        compressor.release.value = 0.25;   // 250ms release
        
        currentNode.connect(compressor);
        currentNode = compressor;
        console.log('Compression applied');
      }
      
      // Apply gain boost if specified
      if (options.gainBoost && options.gainBoost > 0) {
        const gainNode = offlineContext.createGain();
        // Convert dB to linear gain
        gainNode.gain.value = Math.pow(10, options.gainBoost / 20);
        
        currentNode.connect(gainNode);
        currentNode = gainNode;
        console.log('Gain boost applied:', options.gainBoost, 'dB');
      }
      
      // Connect to destination
      currentNode.connect(offlineContext.destination);
      
      // Start and render
      source.start(0);
      const renderedBuffer = await offlineContext.startRendering();
      
      console.log('Rendered buffer:', {
        duration: renderedBuffer.duration,
        length: renderedBuffer.length,
        sampleRate: renderedBuffer.sampleRate
      });
      
      // Normalize if enabled
      let finalBuffer = renderedBuffer;
      if (options.normalize) {
        finalBuffer = normalizeBuffer(renderedBuffer);
        console.log('Normalization applied');
      }
      
      // Convert to WAV blob
      const wavBlob = audioBufferToWav(finalBuffer);
      const enhancedUrl = URL.createObjectURL(wavBlob);
      
      console.log('Client-side enhancement complete, output size:', wavBlob.size, 'bytes');
      
      return enhancedUrl;
      
    } finally {
      await audioContext.close();
    }
  }, []);
  
  return { enhanceAudio };
}

/**
 * Normalize audio buffer to -1dB peak
 */
/**
 * Normalize audio buffer to -1dB peak
 */
function normalizeBuffer(buffer: AudioBuffer): AudioBuffer {
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  
  // Find peak amplitude across all channels
  let peak = 0;
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > peak) peak = abs;
    }
  }
  
  // Target peak at -1dB (0.891)
  const targetPeak = 0.891;
  const gain = peak > 0 ? targetPeak / peak : 1;
  
  console.log('Normalization: peak =', peak.toFixed(4), 'gain =', gain.toFixed(4));
  
  // Create new buffer with normalized data
  const normalizedBuffer = new AudioBuffer({
    numberOfChannels,
    length,
    sampleRate
  });
  
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const inputData = buffer.getChannelData(channel);
    const outputData = normalizedBuffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      outputData[i] = inputData[i] * gain;
    }
  }
  
  return normalizedBuffer;
}

/**
 * Convert AudioBuffer to WAV Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);
  
  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  
  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  
  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Write interleaved audio data
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      // Clamp and convert to 16-bit
      const clamped = Math.max(-1, Math.min(1, sample));
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
