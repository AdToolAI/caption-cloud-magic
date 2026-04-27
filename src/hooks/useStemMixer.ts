import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type StemType = 'vocals' | 'drums' | 'bass' | 'other';

export interface StemTrack {
  type: StemType;
  url: string;
  assetId?: string;
}

export interface StemChannelState {
  volume: number;   // 0..1.5  (1 = unity, allow boost)
  muted: boolean;
  solo: boolean;
  pan: number;      // -1..+1
}

export type StemMixerState = Record<StemType, StemChannelState>;

export const DEFAULT_STEM_STATE: StemMixerState = {
  vocals: { volume: 1.0, muted: false, solo: false, pan: 0 },
  drums:  { volume: 1.0, muted: false, solo: false, pan: 0 },
  bass:   { volume: 1.0, muted: false, solo: false, pan: 0 },
  other:  { volume: 1.0, muted: false, solo: false, pan: 0 },
};

export const STEM_META: Record<StemType, { label: string; color: string; emoji: string }> = {
  vocals: { label: 'Vocals', color: 'hsl(330 80% 60%)', emoji: '🎤' },
  drums:  { label: 'Drums',  color: 'hsl(30 90% 55%)',  emoji: '🥁' },
  bass:   { label: 'Bass',   color: 'hsl(260 70% 60%)', emoji: '🎸' },
  other:  { label: 'Other',  color: 'hsl(180 70% 50%)', emoji: '🎹' },
};

interface UseStemMixerArgs {
  stems: StemTrack[];
  state: StemMixerState;
  masterVolume: number; // 0..1.5
}

interface RuntimeChannel {
  src: AudioBufferSourceNode;
  gain: GainNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
  type: StemType;
}

/**
 * Multi-stem mixer with live preview + offline export.
 * - Decodes up to 4 stems (vocals/drums/bass/other) once.
 * - Builds a Web Audio graph with per-channel Gain+Panner+Analyser, master gain.
 * - Live updates volume/mute/solo/pan without rebuilding the graph.
 * - Exports a 48kHz stereo WAV via OfflineAudioContext to the audio-studio bucket.
 */
export function useStemMixer({ stems, state, masterVolume }: UseStemMixerArgs) {
  const [buffers, setBuffers] = useState<Partial<Record<StemType, AudioBuffer>>>({});
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [levels, setLevels] = useState<Record<StemType, number>>({
    vocals: 0, drums: 0, bass: 0, other: 0,
  });

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const channelsRef = useRef<RuntimeChannel[]>([]);
  const startedAtRef = useRef(0);
  const startOffsetRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // ---- Decode stems on URL change ----
  useEffect(() => {
    let cancelled = false;
    if (stems.length === 0) {
      setBuffers({});
      setDuration(0);
      return;
    }
    setIsLoading(true);

    const decode = async () => {
      try {
        const Ctor: typeof AudioContext =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        const ctx = new Ctor();
        const decoded: Partial<Record<StemType, AudioBuffer>> = {};
        let maxDur = 0;
        for (const stem of stems) {
          try {
            const res = await fetch(stem.url);
            if (!res.ok) throw new Error(`Stem ${stem.type}: HTTP ${res.status}`);
            const ab = await res.arrayBuffer();
            const buf = await ctx.decodeAudioData(ab.slice(0));
            decoded[stem.type] = buf;
            if (buf.duration > maxDur) maxDur = buf.duration;
          } catch (err: any) {
            console.error(`[useStemMixer] decode failed for ${stem.type}:`, err);
            toast.error(`${stem.type} konnte nicht geladen werden`);
          }
        }
        await ctx.close();
        if (cancelled) return;
        setBuffers(decoded);
        setDuration(maxDur);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    decode();
    return () => { cancelled = true; };
  }, [stems]);

  // ---- Resolve effective mute (solo logic) ----
  const isEffectivelyMuted = useCallback((type: StemType): boolean => {
    const ch = state[type];
    if (!ch) return true;
    if (ch.muted) return true;
    const anySolo = (Object.keys(state) as StemType[]).some(k => state[k]?.solo);
    if (anySolo && !ch.solo) return true;
    return false;
  }, [state]);

  // ---- Live updates: volume / mute / pan ----
  useEffect(() => {
    if (!ctxRef.current || channelsRef.current.length === 0) return;
    const ctx = ctxRef.current;
    const t = ctx.currentTime;
    for (const ch of channelsRef.current) {
      const s = state[ch.type];
      if (!s) continue;
      const effGain = isEffectivelyMuted(ch.type) ? 0 : Math.max(0, Math.min(1.5, s.volume));
      ch.gain.gain.cancelScheduledValues(t);
      ch.gain.gain.linearRampToValueAtTime(effGain, t + 0.02);
      ch.panner.pan.cancelScheduledValues(t);
      ch.panner.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, s.pan)), t + 0.02);
    }
    if (masterGainRef.current) {
      masterGainRef.current.gain.cancelScheduledValues(t);
      masterGainRef.current.gain.linearRampToValueAtTime(
        Math.max(0, Math.min(1.5, masterVolume)),
        t + 0.02,
      );
    }
  }, [state, masterVolume, isEffectivelyMuted]);

  // ---- Stop playback + cleanup ----
  const stopPlayback = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    for (const ch of channelsRef.current) {
      try { ch.src.stop(); } catch {}
    }
    channelsRef.current = [];
    masterGainRef.current = null;
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    setIsPlaying(false);
    setLevels({ vocals: 0, drums: 0, bass: 0, other: 0 });
  }, []);

  // ---- Play ----
  const play = useCallback((fromSec = 0) => {
    if (Object.keys(buffers).length === 0) return;
    stopPlayback();

    const Ctor: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = Math.max(0, Math.min(1.5, masterVolume));
    master.connect(ctx.destination);
    masterGainRef.current = master;

    const t0 = ctx.currentTime + 0.05;
    startedAtRef.current = t0;
    startOffsetRef.current = fromSec;

    const channels: RuntimeChannel[] = [];
    (Object.keys(buffers) as StemType[]).forEach(type => {
      const buf = buffers[type];
      if (!buf) return;
      const s = state[type];
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const effGain = isEffectivelyMuted(type) ? 0 : Math.max(0, Math.min(1.5, s.volume));
      gain.gain.value = effGain;
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, s.pan));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(gain).connect(panner).connect(analyser).connect(master);
      src.start(t0, fromSec);
      channels.push({ src, gain, panner, analyser, type });
    });
    channelsRef.current = channels;
    setIsPlaying(true);

    // Playhead + level meters
    const dataArr = new Uint8Array(128);
    const tick = () => {
      if (!ctxRef.current) return;
      const elapsed = ctxRef.current.currentTime - startedAtRef.current;
      const t = startOffsetRef.current + Math.max(0, elapsed);
      setCurrentTime(t);

      const next: Record<StemType, number> = { vocals: 0, drums: 0, bass: 0, other: 0 };
      for (const ch of channelsRef.current) {
        ch.analyser.getByteTimeDomainData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) {
          const v = (dataArr[i] - 128) / 128;
          sum += v * v;
        }
        next[ch.type] = Math.sqrt(sum / dataArr.length);
      }
      setLevels(next);

      if (t >= duration) {
        stopPlayback();
        setCurrentTime(duration);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [buffers, masterVolume, state, duration, stopPlayback, isEffectivelyMuted]);

  const pause = useCallback(() => stopPlayback(), [stopPlayback]);

  const seek = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(duration, sec));
    setCurrentTime(clamped);
    if (isPlaying) play(clamped);
  }, [duration, isPlaying, play]);

  // Cleanup on unmount
  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // ---- Offline render: full mix OR single stem (for individual exports) ----
  const renderToWav = useCallback(async (
    opts: { onlyType?: StemType } = {},
  ): Promise<Blob | null> => {
    const types = (Object.keys(buffers) as StemType[]).filter(t => buffers[t]);
    if (types.length === 0 || duration <= 0) return null;

    const sampleRate = 48000;
    const offline = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);

    const master = offline.createGain();
    master.gain.value = opts.onlyType ? 1 : Math.max(0, Math.min(1.5, masterVolume));
    master.connect(offline.destination);

    for (const type of types) {
      if (opts.onlyType && type !== opts.onlyType) continue;
      const buf = buffers[type]!;
      const s = state[type];
      const src = offline.createBufferSource();
      src.buffer = buf;
      const gain = offline.createGain();
      const muted = !opts.onlyType && isEffectivelyMuted(type);
      gain.gain.value = opts.onlyType ? 1 : (muted ? 0 : Math.max(0, Math.min(1.5, s.volume)));
      const panner = offline.createStereoPanner();
      panner.pan.value = opts.onlyType ? 0 : Math.max(-1, Math.min(1, s.pan));
      src.connect(gain).connect(panner).connect(master);
      src.start(0);
    }

    const rendered = await offline.startRendering();
    return audioBufferToWavBlob(rendered);
  }, [buffers, duration, masterVolume, state, isEffectivelyMuted]);

  // ---- Export full mix ----
  const exportMix = useCallback(async (
    title?: string,
  ): Promise<{ url: string; assetId?: string } | null> => {
    if (!duration) {
      toast.error('Kein Audio zum Exportieren');
      return null;
    }
    setIsExporting(true);
    try {
      const wav = await renderToWav();
      if (!wav) throw new Error('Render fehlgeschlagen');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Bitte einloggen, um Mixes zu speichern');
        return null;
      }

      const fileName = `stem-mix/${user.id}/${Date.now()}.wav`;
      const { error: upErr } = await supabase.storage
        .from('audio-studio')
        .upload(fileName, wav, { contentType: 'audio/wav', upsert: false });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from('audio-studio')
        .getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      let assetId: string | undefined;
      try {
        const { data: asset } = await supabase
          .from('universal_audio_assets')
          .insert({
            user_id: user.id,
            type: 'voiceover',
            title: title || `Stem Mix · ${new Date().toLocaleString('de-DE')}`,
            url: publicUrl,
            storage_url: publicUrl,
            storage_path: fileName,
            source: 'stem_mix',
            processing_preset: 'stem_mix',
            duration_sec: duration,
            effect_config: {
              type: 'stem_mix',
              master_volume: masterVolume,
              channels: state,
            },
          } as any)
          .select('id')
          .single();
        assetId = asset?.id;
      } catch (err) {
        console.warn('[useStemMixer] library insert skipped:', err);
      }

      toast.success('Mix gespeichert', {
        description: `${formatDuration(duration)} · in der Bibliothek`,
      });
      return { url: publicUrl, assetId };
    } catch (err: any) {
      console.error('[useStemMixer] export failed:', err);
      toast.error('Export fehlgeschlagen', { description: err.message });
      return null;
    } finally {
      setIsExporting(false);
    }
  }, [duration, renderToWav, masterVolume, state]);

  // ---- Export single stem (for stem-only download) ----
  const downloadStem = useCallback(async (type: StemType) => {
    if (!buffers[type]) {
      toast.error(`${STEM_META[type].label} nicht geladen`);
      return;
    }
    setIsExporting(true);
    try {
      const wav = await renderToWav({ onlyType: type });
      if (!wav) throw new Error('Render fehlgeschlagen');
      const url = URL.createObjectURL(wav);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${STEM_META[type].label} heruntergeladen`);
    } catch (err: any) {
      console.error('[useStemMixer] downloadStem failed:', err);
      toast.error('Download fehlgeschlagen', { description: err.message });
    } finally {
      setIsExporting(false);
    }
  }, [buffers, renderToWav]);

  return {
    isLoading,
    isPlaying,
    isExporting,
    currentTime,
    duration,
    levels,
    buffers,
    play,
    pause,
    seek,
    exportMix,
    downloadStem,
  };
}

// ---- WAV encoder (16-bit PCM) ----
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
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

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
