import { useRef, useEffect, useCallback } from 'react';

export interface AudioEffects {
  reverb: number;  // 0-100
  echo: number;    // 0-100
  pitch: number;   // -12 to +12 semitones
  bass: number;    // -12 to +12 dB
  mid: number;     // -12 to +12 dB
  treble: number;  // -12 to +12 dB
}

export const DEFAULT_AUDIO_EFFECTS: AudioEffects = {
  reverb: 0,
  echo: 0,
  pitch: 0,
  bass: 0,
  mid: 0,
  treble: 0,
};

interface UseWebAudioEffectsOptions {
  audioEffects: AudioEffects;
  enabled?: boolean;
}

export function useWebAudioEffects({ audioEffects, enabled = true }: UseWebAudioEffectsOptions) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bassFilterRef = useRef<BiquadFilterNode | null>(null);
  const midFilterRef = useRef<BiquadFilterNode | null>(null);
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const delayGainRef = useRef<GainNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const reverbGainRef = useRef<GainNode | null>(null);
  const connectedElementRef = useRef<HTMLMediaElement | null>(null);

  // Create and connect audio graph to a media element
  const connectToMediaElement = useCallback(async (mediaElement: HTMLMediaElement) => {
    if (!enabled) return;
    
    // Prevent double-connection
    if (connectedElementRef.current === mediaElement && audioContextRef.current) {
      return;
    }

    // Clean up previous connection
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        console.log('AudioContext close error:', e);
      }
    }

    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Create source from media element
      const source = ctx.createMediaElementSource(mediaElement);
      sourceNodeRef.current = source;
      connectedElementRef.current = mediaElement;

      // === EQ FILTERS ===
      
      // Bass (Low-shelf filter at 100Hz)
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 100;
      bassFilter.gain.value = audioEffects.bass;
      bassFilterRef.current = bassFilter;

      // Mid (Peaking filter at 1000Hz)
      const midFilter = ctx.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.frequency.value = 1000;
      midFilter.Q.value = 1;
      midFilter.gain.value = audioEffects.mid;
      midFilterRef.current = midFilter;

      // Treble (High-shelf filter at 4000Hz)
      const trebleFilter = ctx.createBiquadFilter();
      trebleFilter.type = 'highshelf';
      trebleFilter.frequency.value = 4000;
      trebleFilter.gain.value = audioEffects.treble;
      trebleFilterRef.current = trebleFilter;

      // === DELAY/ECHO ===
      const delayNode = ctx.createDelay(1.0);
      delayNode.delayTime.value = 0.3; // 300ms delay
      delayNodeRef.current = delayNode;

      const delayGain = ctx.createGain();
      delayGain.gain.value = audioEffects.echo / 100 * 0.5; // Wet signal 0-50%
      delayGainRef.current = delayGain;

      const dryGain = ctx.createGain();
      dryGain.gain.value = 1;
      dryGainRef.current = dryGain;

      // Feedback loop for echo
      const feedbackGain = ctx.createGain();
      feedbackGain.gain.value = 0.3; // 30% feedback

      // === REVERB (using convolver with generated impulse) ===
      const convolver = ctx.createConvolver();
      const impulseResponse = createImpulseResponse(ctx, 2, 2, false);
      convolver.buffer = impulseResponse;
      convolverRef.current = convolver;

      const reverbGain = ctx.createGain();
      reverbGain.gain.value = audioEffects.reverb / 100 * 0.6; // Wet signal 0-60%
      reverbGainRef.current = reverbGain;

      // === CONNECT AUDIO GRAPH ===
      // Source -> EQ chain
      source.connect(bassFilter);
      bassFilter.connect(midFilter);
      midFilter.connect(trebleFilter);

      // EQ -> Dry path (direct to output)
      trebleFilter.connect(dryGain);
      dryGain.connect(ctx.destination);

      // EQ -> Delay path
      trebleFilter.connect(delayNode);
      delayNode.connect(delayGain);
      delayGain.connect(ctx.destination);
      
      // Feedback loop
      delayNode.connect(feedbackGain);
      feedbackGain.connect(delayNode);

      // EQ -> Reverb path
      trebleFilter.connect(convolver);
      convolver.connect(reverbGain);
      reverbGain.connect(ctx.destination);

      console.log('[WebAudioEffects] Audio graph connected');
    } catch (error) {
      console.error('[WebAudioEffects] Error setting up audio graph:', error);
    }
  }, [enabled, audioEffects.bass, audioEffects.mid, audioEffects.treble, audioEffects.echo, audioEffects.reverb]);

  // Update effects in real-time when sliders change
  useEffect(() => {
    if (!audioContextRef.current) return;

    // Update EQ
    if (bassFilterRef.current) {
      bassFilterRef.current.gain.value = audioEffects.bass;
    }
    if (midFilterRef.current) {
      midFilterRef.current.gain.value = audioEffects.mid;
    }
    if (trebleFilterRef.current) {
      trebleFilterRef.current.gain.value = audioEffects.treble;
    }

    // Update Echo/Delay wet mix
    if (delayGainRef.current) {
      delayGainRef.current.gain.value = audioEffects.echo / 100 * 0.5;
    }

    // Update Reverb wet mix
    if (reverbGainRef.current) {
      reverbGainRef.current.gain.value = audioEffects.reverb / 100 * 0.6;
    }
  }, [audioEffects]);

  // Resume audio context (needed for browser autoplay policy)
  const resumeContext = useCallback(async () => {
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        console.log('[WebAudioEffects] AudioContext resumed');
      } catch (e) {
        console.error('[WebAudioEffects] Failed to resume AudioContext:', e);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          console.log('AudioContext cleanup error:', e);
        }
        audioContextRef.current = null;
        sourceNodeRef.current = null;
        connectedElementRef.current = null;
      }
    };
  }, []);

  return {
    connectToMediaElement,
    resumeContext,
    isConnected: !!audioContextRef.current,
  };
}

// Generate impulse response for reverb
function createImpulseResponse(
  audioContext: AudioContext, 
  duration: number, 
  decay: number, 
  reverse: boolean
): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const length = sampleRate * duration;
  const impulse = audioContext.createBuffer(2, length, sampleRate);
  const leftChannel = impulse.getChannelData(0);
  const rightChannel = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = reverse ? length - i : i;
    const envelope = Math.pow(1 - n / length, decay);
    leftChannel[i] = (Math.random() * 2 - 1) * envelope;
    rightChannel[i] = (Math.random() * 2 - 1) * envelope;
  }

  return impulse;
}
