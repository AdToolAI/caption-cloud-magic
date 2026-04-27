import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  type DuckingSettings,
  type SpeechInterval,
  type AutomationPoint,
  transcriptToSpeechIntervals,
  rmsBasedSpeechDetection,
  intervalsToGainAutomation,
} from '@/lib/duckingEnvelope';

interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  type: 'normal' | 'filler' | 'pause';
}

interface UseAudioDuckingArgs {
  speechUrl: string | null;
  musicUrl: string | null;
  transcript?: TranscriptWord[];
  settings: DuckingSettings;
}

/**
 * Hook for live + offline audio ducking.
 *
 * - Decodes both source files once on URL change.
 * - Computes speech intervals (via transcript if present, RMS otherwise).
 * - `play()` / `pause()` controls a Web Audio graph that mixes both sources
 *   while applying gain automation to the music track.
 * - `exportMix()` renders the same graph offline and uploads the resulting
 *   WAV to the `audio-studio` storage bucket + a row in `universal_audio_assets`.
 */
export function useAudioDucking({
  speechUrl,
  musicUrl,
  transcript,
  settings,
}: UseAudioDuckingArgs) {
  const [speechBuffer, setSpeechBuffer] = useState<AudioBuffer | null>(null);
  const [musicBuffer, setMusicBuffer] = useState<AudioBuffer | null>(null);
  const [intervals, setIntervals] = useState<SpeechInterval[]>([]);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Live-playback graph refs
  const ctxRef = useRef<AudioContext | null>(null);
  const speechSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const musicSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const startedAtRef = useRef(0);
  const startOffsetRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // ---- Decoding helper ----
  const decode = useCallback(async (url: string): Promise<AudioBuffer> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const Ctor: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    await ctx.close();
    return decoded;
  }, []);

  // ---- Decode speech ----
  useEffect(() => {
    let cancelled = false;
    if (!speechUrl) {
      setSpeechBuffer(null);
      return;
    }
    setIsLoading(true);
    decode(speechUrl)
      .then(b => { if (!cancelled) setSpeechBuffer(b); })
      .catch(err => {
        console.error('[useAudioDucking] speech decode failed:', err);
        if (!cancelled) toast.error('Sprach-Audio konnte nicht geladen werden');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [speechUrl, decode]);

  // ---- Decode music ----
  useEffect(() => {
    let cancelled = false;
    if (!musicUrl) {
      setMusicBuffer(null);
      return;
    }
    decode(musicUrl)
      .then(b => { if (!cancelled) setMusicBuffer(b); })
      .catch(err => {
        console.error('[useAudioDucking] music decode failed:', err);
        if (!cancelled) toast.error('Musik konnte nicht geladen werden');
      });
    return () => { cancelled = true; };
  }, [musicUrl, decode]);

  // ---- Compute total duration ----
  useEffect(() => {
    const speechDur = speechBuffer?.duration ?? 0;
    const musicDur = musicBuffer?.duration ?? 0;
    setDuration(Math.max(speechDur, musicDur));
  }, [speechBuffer, musicBuffer]);

  // ---- Compute speech intervals ----
  useEffect(() => {
    if (!speechBuffer) {
      setIntervals([]);
      return;
    }
    if (transcript && transcript.length > 0) {
      setIntervals(transcriptToSpeechIntervals(transcript, 300));
    } else {
      // Fallback: RMS analysis (heavy work — but only runs once per file)
      try {
        const detected = rmsBasedSpeechDetection(
          speechBuffer,
          settings.threshold,
          50,
          300,
        );
        setIntervals(detected);
      } catch (err) {
        console.error('[useAudioDucking] RMS detection failed:', err);
        setIntervals([]);
      }
    }
  }, [speechBuffer, transcript, settings.threshold]);

  // ---- Build automation curve ----
  const automation: AutomationPoint[] = (() => {
    if (duration <= 0) return [];
    return intervalsToGainAutomation(intervals, duration, settings);
  })();

  // ---- Live playback ----
  const stopPlayback = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try { speechSrcRef.current?.stop(); } catch {}
    try { musicSrcRef.current?.stop(); } catch {}
    speechSrcRef.current = null;
    musicSrcRef.current = null;
    musicGainRef.current = null;
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const play = useCallback((fromSec = 0) => {
    if (!speechBuffer && !musicBuffer) return;
    stopPlayback();

    const Ctor: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    ctxRef.current = ctx;

    const t0 = ctx.currentTime + 0.05;
    startedAtRef.current = t0;
    startOffsetRef.current = fromSec;

    // Speech track
    if (speechBuffer) {
      const sSrc = ctx.createBufferSource();
      sSrc.buffer = speechBuffer;
      sSrc.connect(ctx.destination);
      sSrc.start(t0, fromSec);
      speechSrcRef.current = sSrc;
    }

    // Music track w/ ducking automation
    if (musicBuffer) {
      const mSrc = ctx.createBufferSource();
      mSrc.buffer = musicBuffer;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      mSrc.connect(gain).connect(ctx.destination);

      // Schedule automation relative to t0, skipping points before fromSec
      const param = gain.gain;
      param.cancelScheduledValues(t0);
      const initialGain = sampleGainAt(automation, fromSec);
      param.setValueAtTime(initialGain, t0);
      for (const p of automation) {
        if (p.time <= fromSec) continue;
        const at = t0 + (p.time - fromSec);
        try {
          param.linearRampToValueAtTime(p.gain, at);
        } catch {/* outside range */}
      }
      mSrc.start(t0, fromSec);
      musicSrcRef.current = mSrc;
      musicGainRef.current = gain;
    }

    setIsPlaying(true);

    // Playhead loop
    const tick = () => {
      if (!ctxRef.current) return;
      const elapsed = ctxRef.current.currentTime - startedAtRef.current;
      const t = startOffsetRef.current + Math.max(0, elapsed);
      setCurrentTime(t);
      if (t >= duration) {
        stopPlayback();
        setCurrentTime(duration);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [speechBuffer, musicBuffer, automation, duration, stopPlayback]);

  const pause = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const seek = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(duration, sec));
    setCurrentTime(clamped);
    if (isPlaying) play(clamped);
  }, [duration, isPlaying, play]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  // Re-program automation if settings change while playing
  useEffect(() => {
    if (!isPlaying || !musicGainRef.current || !ctxRef.current) return;
    const ctx = ctxRef.current;
    const param = musicGainRef.current.gain;
    const elapsed = ctx.currentTime - startedAtRef.current;
    const t = startOffsetRef.current + Math.max(0, elapsed);
    const t0 = ctx.currentTime;
    param.cancelScheduledValues(t0);
    param.setValueAtTime(sampleGainAt(automation, t), t0);
    for (const p of automation) {
      if (p.time <= t) continue;
      const at = t0 + (p.time - t);
      try { param.linearRampToValueAtTime(p.gain, at); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.reductionDb, settings.attackMs, settings.releaseMs]);

  // ---- Offline export ----
  const exportMix = useCallback(async (
    title?: string,
  ): Promise<{ url: string; assetId?: string } | null> => {
    if (!duration || (!speechBuffer && !musicBuffer)) {
      toast.error('Kein Audio zum Exportieren');
      return null;
    }
    setIsExporting(true);
    try {
      const sampleRate = 48000;
      const channels = 2;
      const totalSamples = Math.ceil(duration * sampleRate);
      const offline = new OfflineAudioContext(channels, totalSamples, sampleRate);

      if (speechBuffer) {
        const s = offline.createBufferSource();
        s.buffer = speechBuffer;
        s.connect(offline.destination);
        s.start(0);
      }
      if (musicBuffer) {
        const m = offline.createBufferSource();
        m.buffer = musicBuffer;
        const g = offline.createGain();
        g.gain.value = 1;
        m.connect(g).connect(offline.destination);
        const param = g.gain;
        param.setValueAtTime(automation[0]?.gain ?? 1, 0);
        for (const p of automation) {
          try { param.linearRampToValueAtTime(p.gain, Math.max(0.0001, p.time)); } catch {}
        }
        m.start(0);
      }

      const rendered = await offline.startRendering();
      const wav = audioBufferToWavBlob(rendered);

      // Upload
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Bitte einloggen, um Mixes zu speichern');
        return null;
      }

      const fileName = `mix/${user.id}/${Date.now()}.wav`;
      const { error: upErr } = await supabase.storage
        .from('audio-studio')
        .upload(fileName, wav, { contentType: 'audio/wav', upsert: false });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('audio-studio').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      // Library entry (best-effort — UX still works if this fails)
      let assetId: string | undefined;
      try {
        const { data: asset } = await supabase
          .from('universal_audio_assets')
          .insert({
            user_id: user.id,
            type: 'voiceover',
            title: title || `Ducked Mix · ${new Date().toLocaleString('de-DE')}`,
            url: publicUrl,
            storage_url: publicUrl,
            storage_path: fileName,
            source: 'ducked_mix',
            processing_preset: 'duck',
            duration_sec: rendered.duration,
            effect_config: {
              type: 'duck',
              reduction_db: settings.reductionDb,
              attack_ms: settings.attackMs,
              release_ms: settings.releaseMs,
              threshold: settings.threshold,
              speech_url: speechUrl,
              music_url: musicUrl,
            },
          } as any)
          .select('id')
          .single();
        assetId = asset?.id;
      } catch (err) {
        console.warn('[useAudioDucking] library insert skipped:', err);
      }

      toast.success('Mix gespeichert', {
        description: `${formatDuration(rendered.duration)} · in der Bibliothek`,
      });
      return { url: publicUrl, assetId };
    } catch (err: any) {
      console.error('[useAudioDucking] export failed:', err);
      toast.error('Export fehlgeschlagen', { description: err.message });
      return null;
    } finally {
      setIsExporting(false);
    }
  }, [speechBuffer, musicBuffer, duration, automation, settings, speechUrl, musicUrl]);

  return {
    isLoading,
    isPlaying,
    isExporting,
    currentTime,
    duration,
    intervals,
    automation,
    speechBuffer,
    musicBuffer,
    play,
    pause,
    seek,
    exportMix,
  };
}

// ---- Local helpers ----

function sampleGainAt(points: AutomationPoint[], t: number): number {
  if (points.length === 0) return 1;
  if (t <= points[0].time) return points[0].gain;
  for (let i = 1; i < points.length; i++) {
    if (points[i].time >= t) {
      const a = points[i - 1];
      const b = points[i];
      if (b.time === a.time) return b.gain;
      const f = (t - a.time) / (b.time - a.time);
      return a.gain + (b.gain - a.gain) * f;
    }
  }
  return points[points.length - 1].gain;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
