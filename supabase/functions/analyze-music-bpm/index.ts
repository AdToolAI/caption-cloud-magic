import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Beat {
  time: number;
  strength: number;
  type: 'beat' | 'downbeat' | 'transition-point';
}

interface BeatAnalysisResult {
  bpm: number;
  beats: Beat[];
  downbeats: number[];
  transitionPoints: number[];
  duration: number;
  confidence: number;
  analysisMethod: 'waveform' | 'estimated';
}

/**
 * Energy-based onset detection algorithm
 * Analyzes audio amplitude envelope to detect beats
 */
function detectBeatsFromEnergy(
  samples: Float32Array,
  sampleRate: number,
  sensitivity: number = 0.5
): { beats: number[]; energyProfile: number[] } {
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms windows
  const hopSize = Math.floor(windowSize / 2); // 50% overlap
  const energyProfile: number[] = [];
  
  // Calculate energy for each window
  for (let i = 0; i < samples.length - windowSize; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      energy += samples[i + j] * samples[i + j];
    }
    energyProfile.push(Math.sqrt(energy / windowSize));
  }
  
  // Normalize energy profile
  const maxEnergy = Math.max(...energyProfile);
  const normalizedEnergy = energyProfile.map(e => e / (maxEnergy || 1));
  
  // Calculate local average energy (adaptive threshold)
  const avgWindowSize = Math.floor(sampleRate / hopSize * 0.5); // 500ms average window
  const beats: number[] = [];
  const threshold = 0.15 + (sensitivity * 0.3); // Adjust threshold based on sensitivity
  
  for (let i = avgWindowSize; i < normalizedEnergy.length - avgWindowSize; i++) {
    // Calculate local average
    let localSum = 0;
    for (let j = i - avgWindowSize; j < i + avgWindowSize; j++) {
      localSum += normalizedEnergy[j];
    }
    const localAvg = localSum / (avgWindowSize * 2);
    
    // Detect onset: current energy significantly higher than local average
    const currentEnergy = normalizedEnergy[i];
    const prevEnergy = normalizedEnergy[i - 1];
    
    // Check for onset (energy increase above threshold)
    if (currentEnergy > localAvg + threshold && 
        currentEnergy > prevEnergy &&
        currentEnergy > normalizedEnergy[i + 1]) {
      
      // Convert window index to time
      const timeInSeconds = (i * hopSize) / sampleRate;
      
      // Minimum gap between beats (prevents double detection)
      const minGap = 0.15; // 150ms minimum between beats (~400 BPM max)
      if (beats.length === 0 || timeInSeconds - beats[beats.length - 1] >= minGap) {
        beats.push(timeInSeconds);
      }
    }
  }
  
  return { beats, energyProfile: normalizedEnergy };
}

/**
 * Calculate BPM from beat intervals
 */
function calculateBPMFromBeats(beats: number[]): { bpm: number; confidence: number } {
  if (beats.length < 4) {
    return { bpm: 120, confidence: 0.1 }; // Fallback
  }
  
  // Calculate intervals between consecutive beats
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    intervals.push(beats[i] - beats[i - 1]);
  }
  
  // Filter out outliers (intervals too short or too long)
  const filteredIntervals = intervals.filter(i => i >= 0.25 && i <= 1.5); // 40-240 BPM range
  
  if (filteredIntervals.length < 3) {
    return { bpm: 120, confidence: 0.2 };
  }
  
  // Calculate median interval (more robust than mean)
  const sorted = [...filteredIntervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  
  // Calculate BPM from median interval
  const bpm = Math.round(60 / median);
  
  // Calculate confidence based on interval consistency
  const variance = filteredIntervals.reduce((sum, i) => sum + Math.pow(i - median, 2), 0) / filteredIntervals.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / median;
  
  // Confidence: 1.0 = perfect consistency, lower for more variance
  const confidence = Math.max(0.1, Math.min(1.0, 1.0 - coefficientOfVariation * 2));
  
  return { bpm: Math.max(60, Math.min(200, bpm)), confidence };
}

/**
 * Decode audio from various formats to raw samples
 */
async function decodeAudioToSamples(
  audioBuffer: ArrayBuffer,
  contentType: string
): Promise<{ samples: Float32Array; sampleRate: number } | null> {
  try {
    // For MP3/WAV, we need to extract raw audio data
    // This is a simplified approach that works with most formats
    
    const dataView = new DataView(audioBuffer);
    const bytes = new Uint8Array(audioBuffer);
    
    // Try to detect WAV format
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      // WAV file detected
      return decodeWAV(dataView);
    }
    
    // For MP3 and other formats, use amplitude envelope estimation
    // This is less accurate but works without full decode
    return estimateAmplitudeEnvelope(bytes);
    
  } catch (error) {
    console.error('Audio decode error:', error);
    return null;
  }
}

/**
 * Decode WAV file to samples
 */
function decodeWAV(dataView: DataView): { samples: Float32Array; sampleRate: number } | null {
  try {
    // Read WAV header
    const sampleRate = dataView.getUint32(24, true);
    const bitsPerSample = dataView.getUint16(34, true);
    const numChannels = dataView.getUint16(22, true);
    
    // Find data chunk
    let dataOffset = 44; // Standard WAV header size
    const dataLength = dataView.byteLength - dataOffset;
    
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = Math.floor(dataLength / (bytesPerSample * numChannels));
    
    const samples = new Float32Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const offset = dataOffset + (i * numChannels + ch) * bytesPerSample;
        
        if (bitsPerSample === 16) {
          const sample = dataView.getInt16(offset, true);
          sum += sample / 32768;
        } else if (bitsPerSample === 8) {
          const sample = dataView.getUint8(offset);
          sum += (sample - 128) / 128;
        }
      }
      samples[i] = sum / numChannels;
    }
    
    return { samples, sampleRate };
  } catch (error) {
    console.error('WAV decode error:', error);
    return null;
  }
}

/**
 * Estimate amplitude envelope from raw bytes (for MP3 etc.)
 * This provides approximate beat detection without full decode
 */
function estimateAmplitudeEnvelope(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  // Assume ~44100 Hz, downsample to ~1000 samples per second for efficiency
  const targetSampleRate = 1000;
  const estimatedDuration = bytes.length / 16000; // Rough estimate for MP3
  const numSamples = Math.floor(estimatedDuration * targetSampleRate);
  
  const samples = new Float32Array(numSamples);
  const bytesPerSample = Math.floor(bytes.length / numSamples);
  
  for (let i = 0; i < numSamples; i++) {
    const start = i * bytesPerSample;
    const end = Math.min(start + bytesPerSample, bytes.length);
    
    // Calculate RMS energy of this window
    let sum = 0;
    for (let j = start; j < end; j++) {
      // Convert byte to signed value and normalize
      const value = (bytes[j] - 128) / 128;
      sum += value * value;
    }
    
    samples[i] = Math.sqrt(sum / (end - start));
  }
  
  return { samples, sampleRate: targetSampleRate };
}

/**
 * Identify downbeats (first beat of each bar) from beat sequence
 */
function identifyDownbeats(beats: number[], bpm: number): number[] {
  const beatsPerBar = 4; // Assume 4/4 time signature
  const beatInterval = 60 / bpm;
  const barInterval = beatInterval * beatsPerBar;
  
  const downbeats: number[] = [];
  
  if (beats.length === 0) return downbeats;
  
  // Start from first beat
  let currentBarStart = beats[0];
  downbeats.push(currentBarStart);
  
  for (const beat of beats) {
    // Check if this beat is close to expected next downbeat
    const expectedNextDownbeat = currentBarStart + barInterval;
    
    if (beat >= expectedNextDownbeat - beatInterval * 0.5) {
      // This could be a downbeat
      currentBarStart = beat;
      downbeats.push(beat);
    }
  }
  
  return downbeats;
}

/**
 * Calculate optimal transition points for scene changes
 */
function calculateTransitionPoints(
  downbeats: number[],
  videoDuration: number,
  sceneCount: number
): number[] {
  const sceneDuration = videoDuration / sceneCount;
  const transitionPoints: number[] = [0]; // First scene starts at 0
  
  for (let i = 1; i < sceneCount; i++) {
    const idealTime = i * sceneDuration;
    
    // Find the nearest downbeat to the ideal transition time
    let nearestDownbeat = downbeats[0] || idealTime;
    let minDistance = Math.abs((downbeats[0] || idealTime) - idealTime);
    
    for (const downbeat of downbeats) {
      const distance = Math.abs(downbeat - idealTime);
      if (distance < minDistance) {
        minDistance = distance;
        nearestDownbeat = downbeat;
      }
    }
    
    // Only adjust if the nearest downbeat is within ±3 seconds of ideal
    if (minDistance <= 3) {
      transitionPoints.push(Math.round(nearestDownbeat * 1000) / 1000);
    } else {
      transitionPoints.push(Math.round(idealTime * 1000) / 1000);
    }
  }
  
  return transitionPoints;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { musicUrl, videoDuration = 60, sceneCount = 5, sensitivity = 0.5 } = await req.json();

    console.log('🎵 Real BPM analysis request:', { musicUrl, videoDuration, sceneCount, sensitivity });

    if (!musicUrl) {
      throw new Error('No music URL provided');
    }

    let analysisResult: BeatAnalysisResult;
    let analysisMethod: 'waveform' | 'estimated' = 'estimated';

    try {
      // Fetch the audio file
      console.log('📥 Fetching audio file...');
      const audioResponse = await fetch(musicUrl, {
        headers: { 'Accept': 'audio/*' }
      });

      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
      }

      const contentType = audioResponse.headers.get('content-type') || 'audio/mpeg';
      const audioBuffer = await audioResponse.arrayBuffer();
      
      console.log(`📊 Audio file size: ${audioBuffer.byteLength} bytes, type: ${contentType}`);

      // Decode audio to samples
      const decoded = await decodeAudioToSamples(audioBuffer, contentType);
      
      if (decoded && decoded.samples.length > 0) {
        console.log(`🔊 Decoded ${decoded.samples.length} samples at ${decoded.sampleRate} Hz`);
        
        // Detect beats from audio waveform
        const { beats: rawBeats, energyProfile } = detectBeatsFromEnergy(
          decoded.samples, 
          decoded.sampleRate,
          sensitivity
        );
        
        console.log(`🥁 Detected ${rawBeats.length} raw beats from waveform`);
        
        if (rawBeats.length >= 4) {
          // Calculate BPM from detected beats
          const { bpm, confidence } = calculateBPMFromBeats(rawBeats);
          console.log(`🎼 Calculated BPM: ${bpm} (confidence: ${(confidence * 100).toFixed(1)}%)`);
          
          // Identify downbeats
          const downbeats = identifyDownbeats(rawBeats, bpm);
          console.log(`📍 Identified ${downbeats.length} downbeats`);
          
          // Calculate transition points for scenes
          const transitionPoints = calculateTransitionPoints(downbeats, videoDuration, sceneCount);
          console.log(`🎬 Calculated ${transitionPoints.length} transition points`);
          
          // Build beats array with types
          const beats: Beat[] = rawBeats
            .filter(time => time < videoDuration)
            .map(time => {
              const isTransition = transitionPoints.some(tp => Math.abs(tp - time) < 0.1);
              const isDownbeat = downbeats.some(db => Math.abs(db - time) < 0.05);
              
              return {
                time: Math.round(time * 1000) / 1000,
                strength: isTransition ? 1.0 : isDownbeat ? 0.9 : 0.6,
                type: isTransition ? 'transition-point' : isDownbeat ? 'downbeat' : 'beat'
              };
            });
          
          analysisResult = {
            bpm,
            beats,
            downbeats: downbeats.filter(d => d < videoDuration),
            transitionPoints,
            duration: videoDuration,
            confidence,
            analysisMethod: 'waveform'
          };
          
          analysisMethod = 'waveform';
        } else {
          throw new Error('Insufficient beats detected, falling back to estimation');
        }
      } else {
        throw new Error('Could not decode audio, falling back to estimation');
      }
      
    } catch (audioError) {
      console.warn('⚠️ Waveform analysis failed, using estimation:', audioError);
      
      // Fallback to BPM estimation (original algorithm)
      const baseBpm = 110;
      const bpmVariation = Math.random() * 20 - 10;
      const bpm = Math.round(baseBpm + bpmVariation);
      const beatInterval = 60 / bpm;
      
      const beats: Beat[] = [];
      
      for (let time = 0; time < videoDuration; time += beatInterval) {
        const beatNumber = Math.floor(time / beatInterval);
        const isDownbeat = beatNumber % 4 === 0;
        const isStrongBeat = beatNumber % 2 === 0;
        
        let strength = 0.5;
        if (isDownbeat) strength = 1.0;
        else if (isStrongBeat) strength = 0.75;
        
        beats.push({
          time: Math.round(time * 1000) / 1000,
          strength,
          type: isDownbeat ? 'downbeat' : 'beat',
        });
      }
      
      const downbeats = beats.filter(b => b.type === 'downbeat').map(b => b.time);
      const transitionPoints = calculateTransitionPoints(downbeats, videoDuration, sceneCount);
      
      // Mark transition points
      for (const beat of beats) {
        if (transitionPoints.includes(beat.time)) {
          beat.type = 'transition-point';
          beat.strength = 1.0;
        }
      }
      
      analysisResult = {
        bpm,
        beats,
        downbeats,
        transitionPoints,
        duration: videoDuration,
        confidence: 0.3,
        analysisMethod: 'estimated'
      };
    }

    console.log(`✅ Analysis complete: ${analysisResult.beats.length} beats at ${analysisResult.bpm} BPM (${analysisResult.analysisMethod})`);

    return new Response(
      JSON.stringify({
        success: true,
        ...analysisResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Beat analysis error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
