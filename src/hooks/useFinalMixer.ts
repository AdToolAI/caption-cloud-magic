import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Final Mix Hub – Multi-Source Mixer mit Loudness-Normalisierung
 *
 * Kombiniert beliebig viele Audio-Quellen (Voiceover, AI-Music, Stem-Mix, SFX, …)
 * zu einem finalen sendefertigen WAV. Zwei Phasen:
 *
 *  1) Live-Preview: pro Source ein BufferSource → Gain → Pan → MasterGain → Destination
 *  2) Export: identischer Graph in OfflineAudioContext + ITU-R BS.1770 Loudness-Messung
 *     + Gain-Anpassung auf Ziel-LUFS (Spotify -14, YouTube -14, Broadcast -23, Cinema -27)
 */

export type FinalMixSource = {
  id: string;
  label: string;
  url: string;
  /** Rolle der Spur — beeinflusst Default-Gain & Icon */
  kind: 'voice' | 'music' | 'stems' | 'sfx' | 'other';
  /** -1 (links) bis 1 (rechts) */
  pan: number;
  /** 0 bis 1.5 (Boost erlaubt) */
  volume: number;
  muted: boolean;
  /** Start-Offset in Sekunden (Stille davor) */
  offsetSec: number;
};

export type LoudnessTarget = {
  id: 'spotify' | 'youtube' | 'broadcast' | 'cinema' | 'none';
  label: string;
  lufs: number; // Ziel-Integrated-Loudness
  truePeakDb: number; // max. True Peak (dBFS)
};

export const LOUDNESS_TARGETS: LoudnessTarget[] = [
  { id: 'spotify', label: 'Spotify / Apple Music', lufs: -14, truePeakDb: -1 },
  { id: 'youtube', label: 'YouTube / TikTok / Insta', lufs: -14, truePeakDb: -1 },
  { id: 'broadcast', label: 'Broadcast / TV (EBU R128)', lufs: -23, truePeakDb: -1 },
  { id: 'cinema', label: 'Cinema (ATSC A/85)', lufs: -27, truePeakDb: -2 },
  { id: 'none', label: 'Keine Normalisierung', lufs: 0, truePeakDb: 0 },
];

const TARGET_SR = 48000;
const TARGET_CH = 2;

type DecodedSource = FinalMixSource & { buffer: AudioBuffer };

export function useFinalMixer() {
  const [sources, setSources] = useState<FinalMixSource[]>([]);
  const [decoded, setDecoded] = useState<Map<string, AudioBuffer>>(new Map());
  const [decoding, setDecoding] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);
  const [target, setTarget] = useState<LoudnessTarget>(LOUDNESS_TARGETS[1]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [maxDuration, setMaxDuration] = useState(0);
  const [exportProgress, setExportProgress] = useState<{ phase: string; pct: number } | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const playStartedAtRef = useRef(0);
  const playOffsetRef = useRef(0);
  const activeNodesRef = useRef<{ src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode }[]>([]);
  const masterGainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // --- Decode any newly added source ---
  useEffect(() => {
    const undecoded = sources.filter(s => !decoded.has(s.id));
    if (undecoded.length === 0) return;

    let cancelled = false;
    setDecoding(true);

    (async () => {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;

      const next = new Map(decoded);
      let max = maxDuration;

      for (const s of undecoded) {
        try {
          const res = await fetch(s.url);
          const ab = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(ab.slice(0));
          if (cancelled) return;
          next.set(s.id, buf);
          max = Math.max(max, buf.duration + s.offsetSec);
        } catch (e) {
          console.error('[FinalMixer] decode failed', s.id, e);
        }
      }

      if (!cancelled) {
        setDecoded(next);
        setMaxDuration(max);
        setDecoding(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sources]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute max duration if offsets change
  useEffect(() => {
    if (decoded.size === 0) return;
    let max = 0;
    for (const s of sources) {
      const buf = decoded.get(s.id);
      if (buf) max = Math.max(max, buf.duration + s.offsetSec);
    }
    setMaxDuration(max);
  }, [sources, decoded]);

  // --- Public API ---
  const addSource = useCallback((src: Omit<FinalMixSource, 'pan' | 'volume' | 'muted' | 'offsetSec'> & Partial<Pick<FinalMixSource, 'pan' | 'volume' | 'muted' | 'offsetSec'>>) => {
    setSources(prev => {
      if (prev.find(p => p.id === src.id)) return prev;
      const defaultVol = src.kind === 'voice' ? 1.0 : src.kind === 'music' ? 0.6 : 0.85;
      return [...prev, {
        pan: 0,
        volume: src.volume ?? defaultVol,
        muted: src.muted ?? false,
        offsetSec: src.offsetSec ?? 0,
        ...src,
      }];
    });
  }, []);

  const removeSource = useCallback((id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
    setDecoded(prev => {
      const n = new Map(prev);
      n.delete(id);
      return n;
    });
  }, []);

  const updateSource = useCallback((id: string, patch: Partial<FinalMixSource>) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    // Live-update on running graph
    const node = activeNodesRef.current.find((_, i) => sources[i]?.id === id);
    if (node && ctxRef.current) {
      const t = ctxRef.current.currentTime;
      if (patch.volume !== undefined || patch.muted !== undefined) {
        const s = sources.find(x => x.id === id);
        if (s) {
          const vol = (patch.muted ?? s.muted) ? 0 : (patch.volume ?? s.volume);
          node.gain.gain.linearRampToValueAtTime(vol, t + 0.02);
        }
      }
      if (patch.pan !== undefined) {
        node.pan.pan.linearRampToValueAtTime(patch.pan, t + 0.02);
      }
    }
  }, [sources]);

  // --- Playback ---
  const stopInternal = useCallback(() => {
    activeNodesRef.current.forEach(n => {
      try { n.src.stop(); } catch {}
    });
    activeNodesRef.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const play = useCallback((fromSec = currentTime) => {
    if (!ctxRef.current || decoded.size === 0) return;
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    stopInternal();

    const master = ctx.createGain();
    master.gain.value = masterVolume;
    master.connect(ctx.destination);
    masterGainRef.current = master;

    const startedAt = ctx.currentTime;

    sources.forEach(s => {
      const buf = decoded.get(s.id);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = s.muted ? 0 : s.volume;
      const pan = ctx.createStereoPanner();
      pan.pan.value = s.pan;
      src.connect(gain).connect(pan).connect(master);

      const offsetInBuffer = Math.max(0, fromSec - s.offsetSec);
      const whenStart = startedAt + Math.max(0, s.offsetSec - fromSec);

      if (offsetInBuffer < buf.duration) {
        src.start(whenStart, offsetInBuffer);
      }
      activeNodesRef.current.push({ src, gain, pan });
    });

    playStartedAtRef.current = startedAt - fromSec;
    playOffsetRef.current = fromSec;
    setIsPlaying(true);

    const tick = () => {
      if (!ctxRef.current) return;
      const t = ctxRef.current.currentTime - playStartedAtRef.current;
      setCurrentTime(t);
      if (t >= maxDuration) {
        stopInternal();
        setIsPlaying(false);
        setCurrentTime(0);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [sources, decoded, maxDuration, masterVolume, currentTime, stopInternal]);

  const pause = useCallback(() => {
    stopInternal();
    setIsPlaying(false);
  }, [stopInternal]);

  const seek = useCallback((sec: number) => {
    const wasPlaying = isPlaying;
    stopInternal();
    setIsPlaying(false);
    setCurrentTime(sec);
    if (wasPlaying) {
      // small defer so React state settles
      setTimeout(() => play(sec), 0);
    }
  }, [isPlaying, play, stopInternal]);

  // Master volume live update
  useEffect(() => {
    if (masterGainRef.current && ctxRef.current) {
      const t = ctxRef.current.currentTime;
      masterGainRef.current.gain.linearRampToValueAtTime(masterVolume, t + 0.05);
    }
  }, [masterVolume]);

  useEffect(() => () => stopInternal(), [stopInternal]);

  // --- Offline render + LUFS measurement ---
  const renderOffline = useCallback(async (): Promise<AudioBuffer | null> => {
    if (sources.length === 0 || maxDuration === 0) return null;
    const totalSamples = Math.ceil(maxDuration * TARGET_SR);
    const offline = new OfflineAudioContext(TARGET_CH, totalSamples, TARGET_SR);
    const master = offline.createGain();
    master.gain.value = masterVolume;
    master.connect(offline.destination);

    sources.forEach(s => {
      const buf = decoded.get(s.id);
      if (!buf || s.muted) return;
      const src = offline.createBufferSource();
      src.buffer = buf;
      const gain = offline.createGain();
      gain.gain.value = s.volume;
      const pan = offline.createStereoPanner();
      pan.pan.value = s.pan;
      src.connect(gain).connect(pan).connect(master);
      src.start(s.offsetSec);
    });

    return offline.startRendering();
  }, [sources, decoded, maxDuration, masterVolume]);

  /**
   * Vereinfachte Integrated-Loudness-Messung nach ITU-R BS.1770-4.
   * - K-Weighting: vereinfacht als High-Shelf Boost + High-Pass (approximiert)
   * - Mean-Square pro Kanal, gewichtet (L/R = 1.0)
   * - Gating: -70 LUFS absolute, dann -10 LU relativ
   * Liefert eine gute Annäherung für UI-Anzeige & Normalisierung.
   */
  const measureLUFS = useCallback((buffer: AudioBuffer): { lufs: number; truePeakDb: number } => {
    const sr = buffer.sampleRate;
    const blockSize = Math.floor(0.4 * sr); // 400ms blocks
    const hopSize = Math.floor(0.1 * sr);   // 100ms hop (75% overlap)

    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;

    // True peak (sample-peak approximation)
    let peak = 0;
    for (let i = 0; i < ch0.length; i++) {
      const a = Math.abs(ch0[i]);
      const b = Math.abs(ch1[i]);
      if (a > peak) peak = a;
      if (b > peak) peak = b;
    }
    const truePeakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;

    // K-weighted MS per block (approximation: simple high-pass via 1st-order diff)
    const blockLoudness: number[] = [];
    for (let start = 0; start + blockSize <= ch0.length; start += hopSize) {
      let sum = 0;
      let prev0 = 0, prev1 = 0;
      for (let i = 0; i < blockSize; i++) {
        const idx = start + i;
        // crude high-pass + slight high-shelf boost (K-weighting approx)
        const x0 = ch0[idx] - 0.85 * prev0;
        const x1 = ch1[idx] - 0.85 * prev1;
        prev0 = ch0[idx];
        prev1 = ch1[idx];
        sum += x0 * x0 + x1 * x1;
      }
      const meanSquare = sum / blockSize;
      blockLoudness.push(meanSquare);
    }

    if (blockLoudness.length === 0) return { lufs: -Infinity, truePeakDb };

    // Absolute gating @ -70 LUFS (≈ MS threshold)
    const absThreshold = Math.pow(10, (-70 + 0.691) / 10);
    const passAbs = blockLoudness.filter(ms => ms > absThreshold);
    if (passAbs.length === 0) return { lufs: -70, truePeakDb };

    const meanAbs = passAbs.reduce((a, b) => a + b, 0) / passAbs.length;
    const relThreshold = meanAbs * Math.pow(10, -10 / 10);
    const passRel = passAbs.filter(ms => ms > relThreshold);

    const finalMs = passRel.length > 0
      ? passRel.reduce((a, b) => a + b, 0) / passRel.length
      : meanAbs;

    const lufs = -0.691 + 10 * Math.log10(finalMs);
    return { lufs, truePeakDb };
  }, []);

  const applyGainToBuffer = useCallback((buffer: AudioBuffer, gainLinear: number): AudioBuffer => {
    // Re-render through offline context with master gain — guarantees clipping-safe limiter via tanh
    // Simpler approach: in-place multiply + soft-clip
    const out = new AudioContext().createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const inData = buffer.getChannelData(c);
      const outData = out.getChannelData(c);
      for (let i = 0; i < inData.length; i++) {
        const v = inData[i] * gainLinear;
        // Soft-clip via tanh approximation, prevents harsh distortion if gain too high
        outData[i] = v > 1 || v < -1 ? Math.tanh(v) : v;
      }
    }
    return out;
  }, []);

  /** Render → measure → normalize → encode WAV */
  const exportMix = useCallback(async (): Promise<Blob | null> => {
    setExportProgress({ phase: 'Rendering...', pct: 10 });
    const rendered = await renderOffline();
    if (!rendered) {
      setExportProgress(null);
      return null;
    }

    let final = rendered;
    if (target.id !== 'none') {
      setExportProgress({ phase: 'Loudness messen...', pct: 50 });
      const measured = measureLUFS(rendered);
      const deltaDb = target.lufs - measured.lufs;
      const gain = Math.pow(10, deltaDb / 20);
      // Cap gain to ±12 dB to avoid pathological boosts
      const safeGain = Math.max(0.25, Math.min(4, gain));
      setExportProgress({ phase: `Normalisieren auf ${target.lufs} LUFS...`, pct: 75 });
      final = applyGainToBuffer(rendered, safeGain);
    }

    setExportProgress({ phase: 'WAV codieren...', pct: 90 });
    const blob = audioBufferToWav(final);
    setExportProgress(null);
    return blob;
  }, [renderOffline, target, measureLUFS, applyGainToBuffer]);

  return {
    sources,
    addSource,
    removeSource,
    updateSource,
    decoding,
    masterVolume,
    setMasterVolume,
    target,
    setTarget,
    targets: LOUDNESS_TARGETS,
    isPlaying,
    play,
    pause,
    seek,
    currentTime,
    maxDuration,
    exportMix,
    exportProgress,
    measureLUFS,
    renderOffline,
  };
}

// --- WAV encoder (16-bit PCM, stereo, 48kHz) ---
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const frames = buffer.length;
  const byteRate = sr * numCh * 2;
  const blockAlign = numCh * 2;
  const dataSize = frames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const w = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };

  w(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = channels[c][i];
      if (s > 1) s = 1; else if (s < -1) s = -1;
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
