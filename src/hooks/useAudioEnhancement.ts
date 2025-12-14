import { useCallback } from 'react';

export interface EnhancementOptions {
  // Basic filters
  normalize?: boolean;
  compression?: boolean;
  gainBoost?: number; // dB
  
  // Noise reduction
  highPassFilter?: boolean;     // Remove low frequency rumble (120Hz)
  lowPassFilter?: boolean;      // Remove high frequency hiss (10kHz)
  notchFilter?: boolean;        // Remove 50/60Hz hum
  noiseGate?: boolean;          // Gate out silence below threshold
  
  // Voice enhancement
  voiceEQ?: boolean;            // Boost 3kHz clarity
  deEsser?: boolean;            // Reduce sibilance at 6.5kHz
  plosiveReducer?: boolean;     // Reduce P/B pops at 120Hz
  warmthBoost?: boolean;        // Add fullness at 200Hz
  
  // Tonal correction
  mudCut?: boolean;             // Cut 500Hz muddiness
  boxinessCut?: boolean;        // Cut 250Hz boxy room sound
  airBoost?: boolean;           // Boost 10kHz+ brilliance
  
  // Dynamics
  limiter?: boolean;            // Prevent clipping
  
  // Stereo
  stereoWidener?: boolean;      // Widen stereo image
}

export const DEFAULT_ENHANCEMENT_OPTIONS: EnhancementOptions = {
  normalize: true,
  compression: true,
  gainBoost: 3,
  highPassFilter: true,
  lowPassFilter: true,
  notchFilter: true,
  noiseGate: false,
  voiceEQ: true,
  deEsser: true,
  plosiveReducer: false,
  warmthBoost: true,
  mudCut: true,
  boxinessCut: true,
  airBoost: true,
  limiter: true,
  stereoWidener: false,
};

export const PRESET_MINIMAL: EnhancementOptions = {
  normalize: true,
  compression: false,
  gainBoost: 0,
  highPassFilter: true,
  lowPassFilter: false,
  notchFilter: true,
  noiseGate: false,
  voiceEQ: false,
  deEsser: false,
  plosiveReducer: false,
  warmthBoost: false,
  mudCut: false,
  boxinessCut: false,
  airBoost: false,
  limiter: true,
  stereoWidener: false,
};

export const PRESET_PODCAST: EnhancementOptions = {
  normalize: true,
  compression: true,
  gainBoost: 3,
  highPassFilter: true,
  lowPassFilter: true,
  notchFilter: true,
  noiseGate: false,
  voiceEQ: true,
  deEsser: true,
  plosiveReducer: true,
  warmthBoost: true,
  mudCut: true,
  boxinessCut: true,
  airBoost: false,
  limiter: true,
  stereoWidener: false,
};

export const PRESET_RADIO: EnhancementOptions = {
  normalize: true,
  compression: true,
  gainBoost: 4,
  highPassFilter: true,
  lowPassFilter: true,
  notchFilter: true,
  noiseGate: true,
  voiceEQ: true,
  deEsser: true,
  plosiveReducer: true,
  warmthBoost: true,
  mudCut: true,
  boxinessCut: true,
  airBoost: true,
  limiter: true,
  stereoWidener: false,
};

export const PRESET_MAXIMAL: EnhancementOptions = {
  normalize: true,
  compression: true,
  gainBoost: 5,
  highPassFilter: true,
  lowPassFilter: true,
  notchFilter: true,
  noiseGate: true,
  voiceEQ: true,
  deEsser: true,
  plosiveReducer: true,
  warmthBoost: true,
  mudCut: true,
  boxinessCut: true,
  airBoost: true,
  limiter: true,
  stereoWidener: true,
};

/**
 * Web Audio API-based client-side audio enhancement
 * Full studio-quality processing without external APIs
 */
export function useAudioEnhancement() {
  
  const enhanceAudio = useCallback(async (
    audioUrl: string, 
    options: EnhancementOptions = DEFAULT_ENHANCEMENT_OPTIONS
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
      
      // Determine output channels (2 if stereo widener is enabled, else keep original)
      const outputChannels = options.stereoWidener ? 2 : audioBuffer.numberOfChannels;
      
      // Create offline context for processing
      const offlineContext = new OfflineAudioContext(
        outputChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );
      
      // Create source
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      
      let currentNode: AudioNode = source;
      
      // === NOISE REDUCTION GROUP ===
      
      // High-pass filter to remove low frequency rumble (120Hz)
      if (options.highPassFilter) {
        const highPass = offlineContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 120;
        highPass.Q.value = 1.0;
        currentNode.connect(highPass);
        currentNode = highPass;
        console.log('High-pass filter applied at 120Hz');
      }
      
      // Low-pass filter to remove high frequency hiss (10kHz)
      if (options.lowPassFilter) {
        const lowPass = offlineContext.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 10000;
        lowPass.Q.value = 0.9;
        currentNode.connect(lowPass);
        currentNode = lowPass;
        console.log('Low-pass filter applied at 10kHz');
      }
      
      // Notch filters for power line hum (50Hz and 60Hz)
      if (options.notchFilter) {
        const notch60 = offlineContext.createBiquadFilter();
        notch60.type = 'notch';
        notch60.frequency.value = 60;
        notch60.Q.value = 30;
        currentNode.connect(notch60);
        currentNode = notch60;
        
        const notch50 = offlineContext.createBiquadFilter();
        notch50.type = 'notch';
        notch50.frequency.value = 50;
        notch50.Q.value = 30;
        currentNode.connect(notch50);
        currentNode = notch50;
        console.log('Notch filters applied at 50Hz and 60Hz');
      }
      
      // === TONAL CORRECTION GROUP ===
      
      // Muddiness cut at 500Hz
      if (options.mudCut) {
        const mudCut = offlineContext.createBiquadFilter();
        mudCut.type = 'peaking';
        mudCut.frequency.value = 500;
        mudCut.Q.value = 1.5;
        mudCut.gain.value = -2;
        currentNode.connect(mudCut);
        currentNode = mudCut;
        console.log('Muddiness cut applied: -2dB at 500Hz');
      }
      
      // Boxiness cut at 250Hz
      if (options.boxinessCut) {
        const boxinessCut = offlineContext.createBiquadFilter();
        boxinessCut.type = 'peaking';
        boxinessCut.frequency.value = 250;
        boxinessCut.Q.value = 1.2;
        boxinessCut.gain.value = -2.5;
        currentNode.connect(boxinessCut);
        currentNode = boxinessCut;
        console.log('Boxiness cut applied: -2.5dB at 250Hz');
      }
      
      // Plosive reducer at 120Hz (P/B pops)
      if (options.plosiveReducer) {
        const plosive = offlineContext.createBiquadFilter();
        plosive.type = 'peaking';
        plosive.frequency.value = 120;
        plosive.Q.value = 2.0;
        plosive.gain.value = -6;
        currentNode.connect(plosive);
        currentNode = plosive;
        console.log('Plosive reducer applied: -6dB at 120Hz');
      }
      
      // === VOICE ENHANCEMENT GROUP ===
      
      // Warmth boost at 200Hz
      if (options.warmthBoost) {
        const warmth = offlineContext.createBiquadFilter();
        warmth.type = 'peaking';
        warmth.frequency.value = 200;
        warmth.Q.value = 0.8;
        warmth.gain.value = 1.5;
        currentNode.connect(warmth);
        currentNode = warmth;
        console.log('Warmth boost applied: +1.5dB at 200Hz');
      }
      
      // Voice clarity EQ at 3kHz
      if (options.voiceEQ) {
        const voiceEQ = offlineContext.createBiquadFilter();
        voiceEQ.type = 'peaking';
        voiceEQ.frequency.value = 3000;
        voiceEQ.Q.value = 1.0;
        voiceEQ.gain.value = 3;
        currentNode.connect(voiceEQ);
        currentNode = voiceEQ;
        console.log('Voice EQ applied: +3dB at 3kHz');
      }
      
      // De-Esser at 6.5kHz (sibilance)
      if (options.deEsser) {
        const deEsser = offlineContext.createBiquadFilter();
        deEsser.type = 'peaking';
        deEsser.frequency.value = 6500;
        deEsser.Q.value = 2.0;
        deEsser.gain.value = -4;
        currentNode.connect(deEsser);
        currentNode = deEsser;
        console.log('De-Esser applied: -4dB at 6.5kHz');
      }
      
      // === FINISHING GROUP ===
      
      // Air/Presence boost at 10kHz+
      if (options.airBoost) {
        const airBoost = offlineContext.createBiquadFilter();
        airBoost.type = 'highshelf';
        airBoost.frequency.value = 10000;
        airBoost.gain.value = 1.5;
        currentNode.connect(airBoost);
        currentNode = airBoost;
        console.log('Air boost applied: +1.5dB at 10kHz+');
      }
      
      // Compression
      if (options.compression) {
        const compressor = offlineContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 12;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        currentNode.connect(compressor);
        currentNode = compressor;
        console.log('Compression applied: -24dB threshold, 4:1 ratio');
      }
      
      // Gain boost
      if (options.gainBoost && options.gainBoost > 0) {
        const gainNode = offlineContext.createGain();
        gainNode.gain.value = Math.pow(10, options.gainBoost / 20);
        currentNode.connect(gainNode);
        currentNode = gainNode;
        console.log('Gain boost applied:', options.gainBoost, 'dB');
      }
      
      // Limiter (prevents clipping)
      if (options.limiter) {
        const limiter = offlineContext.createDynamicsCompressor();
        limiter.threshold.value = -1;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.001;
        limiter.release.value = 0.1;
        currentNode.connect(limiter);
        currentNode = limiter;
        console.log('Limiter applied: -1dB threshold, 20:1 ratio');
      }
      
      // === STEREO GROUP ===
      
      // Stereo widener using Haas effect (delay one channel slightly)
      if (options.stereoWidener && outputChannels === 2) {
        const splitter = offlineContext.createChannelSplitter(2);
        const merger = offlineContext.createChannelMerger(2);
        const delay = offlineContext.createDelay(0.1);
        delay.delayTime.value = 0.015; // 15ms delay for width
        
        currentNode.connect(splitter);
        
        // Left channel: direct
        splitter.connect(merger, 0, 0);
        
        // Right channel: slight delay for stereo width
        splitter.connect(delay, 1);
        delay.connect(merger, 0, 1);
        
        currentNode = merger;
        console.log('Stereo widener applied: 15ms Haas effect');
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
      
      // Apply noise gate if enabled (post-processing)
      let finalBuffer = renderedBuffer;
      if (options.noiseGate) {
        finalBuffer = applyNoiseGate(renderedBuffer, -40); // -40dB threshold
        console.log('Noise gate applied: -40dB threshold');
      }
      
      // Normalize if enabled
      if (options.normalize) {
        finalBuffer = normalizeBuffer(finalBuffer);
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
 * Apply noise gate - mute samples below threshold
 */
function applyNoiseGate(buffer: AudioBuffer, thresholdDb: number): AudioBuffer {
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  
  // Convert dB to linear
  const threshold = Math.pow(10, thresholdDb / 20);
  
  // Create new buffer
  const gatedBuffer = new AudioBuffer({
    numberOfChannels,
    length,
    sampleRate
  });
  
  // Simple gate with short attack/release
  const attackSamples = Math.floor(sampleRate * 0.005); // 5ms attack
  const releaseSamples = Math.floor(sampleRate * 0.05); // 50ms release
  
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const inputData = buffer.getChannelData(channel);
    const outputData = gatedBuffer.getChannelData(channel);
    
    let envelope = 0;
    
    for (let i = 0; i < length; i++) {
      const absValue = Math.abs(inputData[i]);
      
      // Simple envelope follower
      if (absValue > envelope) {
        envelope += (absValue - envelope) / attackSamples;
      } else {
        envelope += (absValue - envelope) / releaseSamples;
      }
      
      // Apply gate
      if (envelope < threshold) {
        outputData[i] = 0;
      } else {
        outputData[i] = inputData[i];
      }
    }
  }
  
  return gatedBuffer;
}

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
