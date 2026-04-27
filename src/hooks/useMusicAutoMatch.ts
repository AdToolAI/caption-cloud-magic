import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AutoMatchRecommendation {
  bpm: number;
  durationSec: number;
  genre: string;
  mood: string;
  prompt: string;
  descriptors: string[];
}

export interface AutoMatchAnalysis {
  cutsPerSecond: number;
  sceneCuts: number;
  videoDurationSec: number;
  energy: number;
  brightness: number;
  analysisSource: 'ai' | 'heuristic';
}

export interface AutoMatchResult {
  recommendation: AutoMatchRecommendation;
  analysis: AutoMatchAnalysis;
  videoUrl: string;
  videoFileName: string;
}

type Phase = 'idle' | 'uploading' | 'extracting' | 'analyzing' | 'done' | 'error';

interface ExtractedFrames {
  frames: string[];
  durationSec: number;
  sceneCuts: number;
}

/** Extract ~6 evenly-spaced JPEG frames + estimate scene-cut count via inter-frame difference */
async function extractFramesAndCuts(file: File): Promise<ExtractedFrames> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.src = url;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Konnte Video-Metadaten nicht laden'));
      setTimeout(() => reject(new Error('Video lädt zu langsam')), 30000);
    });

    const duration = Math.max(1, video.duration || 1);
    // Sample more frames than we need for scene-cut estimation (12), pick 6 for AI
    const SAMPLE_COUNT = 12;
    const samplePoints: number[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      samplePoints.push((duration * (i + 0.5)) / SAMPLE_COUNT);
    }

    const canvas = document.createElement('canvas');
    const W = 192, H = 108; // small for diff calc
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar');

    const frames: { dataUrl: string; pixels: Uint8ClampedArray }[] = [];

    for (const t of samplePoints) {
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = Math.min(t, duration - 0.05);
        setTimeout(() => { video.removeEventListener('seeked', onSeeked); reject(new Error('Seek-Timeout')); }, 5000);
      });
      ctx.drawImage(video, 0, 0, W, H);
      const imgData = ctx.getImageData(0, 0, W, H);
      // Higher-quality dataURL for AI (larger size)
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 384;
      exportCanvas.height = 216;
      const ectx = exportCanvas.getContext('2d');
      if (ectx) {
        ectx.drawImage(video, 0, 0, 384, 216);
      }
      frames.push({
        dataUrl: exportCanvas.toDataURL('image/jpeg', 0.7),
        pixels: imgData.data,
      });
    }

    // Scene-cut estimation: count frame pairs whose mean abs-diff exceeds threshold
    let cuts = 0;
    const THRESHOLD = 32; // 0..255 mean diff
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1].pixels;
      const b = frames[i].pixels;
      let sum = 0;
      const STEP = 16; // sample every 16th channel for speed
      let n = 0;
      for (let k = 0; k < a.length; k += STEP) {
        sum += Math.abs(a[k] - b[k]);
        n++;
      }
      const mean = sum / Math.max(1, n);
      if (mean > THRESHOLD) cuts++;
    }
    // Multiplier: we sampled 12 frames; real cuts likely 2x higher
    const estimatedCuts = Math.max(0, Math.round(cuts * 1.5));

    // Pick 6 evenly-spaced frames for AI
    const aiFrames = [0, 2, 4, 6, 8, 10].map(i => frames[Math.min(i, frames.length - 1)].dataUrl);

    return { frames: aiFrames, durationSec: duration, sceneCuts: estimatedCuts };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useMusicAutoMatch() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AutoMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setProgress(0);
    setResult(null);
    setError(null);
  }, []);

  const analyzeVideo = useCallback(async (file: File): Promise<AutoMatchResult | null> => {
    setError(null);
    setResult(null);

    try {
      // Validate
      if (!file.type.startsWith('video/')) {
        throw new Error('Bitte eine Video-Datei auswählen (mp4, mov, webm)');
      }
      if (file.size > 200 * 1024 * 1024) {
        throw new Error('Video zu groß (max. 200 MB)');
      }

      // Phase 1: Upload to storage
      setPhase('uploading');
      setProgress(10);
      const ext = file.name.split('.').pop() || 'mp4';
      const fileName = `auto-match/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('audio-studio')
        .upload(fileName, file, { contentType: file.type });
      if (upErr) throw new Error(`Upload fehlgeschlagen: ${upErr.message}`);
      const { data: pub } = supabase.storage.from('audio-studio').getPublicUrl(fileName);
      const videoUrl = pub.publicUrl;
      setProgress(35);

      // Phase 2: Extract frames + estimate cuts (client-side)
      setPhase('extracting');
      const { frames, durationSec, sceneCuts } = await extractFramesAndCuts(file);
      setProgress(60);

      // Phase 3: AI analysis + recommendation
      setPhase('analyzing');
      const { data, error: fnErr } = await supabase.functions.invoke('auto-match-music-to-video', {
        body: {
          video_url: videoUrl,
          duration_sec: durationSec,
          frames,
          scene_cuts: sceneCuts,
        },
      });
      if (fnErr) throw new Error(fnErr.message || 'Analyse fehlgeschlagen');
      if (!data?.success) throw new Error(data?.error || 'Analyse lieferte kein Ergebnis');

      setProgress(100);
      setPhase('done');

      const finalResult: AutoMatchResult = {
        recommendation: data.recommendation,
        analysis: data.analysis,
        videoUrl,
        videoFileName: file.name,
      };
      setResult(finalResult);
      toast.success('Video analysiert', {
        description: `${data.recommendation.bpm} BPM • ${data.recommendation.genre} • ${data.recommendation.mood}`,
      });
      return finalResult;
    } catch (err: any) {
      console.error('[useMusicAutoMatch]', err);
      setPhase('error');
      setError(err.message || 'Unbekannter Fehler');
      toast.error('Auto-Match fehlgeschlagen', { description: err.message });
      return null;
    }
  }, []);

  return { phase, progress, result, error, analyzeVideo, reset };
}
