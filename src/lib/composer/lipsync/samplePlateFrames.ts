/**
 * samplePlateFrames (v327) — client-side plate motion probe.
 *
 * Server-side frame extraction from MP4s is deliberately unavailable
 * (no ffmpeg, no Replicate — see `_shared/face-frame-extract.ts`), so the
 * motion measurement that feeds the tracked lip-sync path is captured in the
 * browser: we seek the rendered plate to N timestamps, draw each frame to a
 * canvas, upload the JPEGs to the `composer-frames` bucket and let
 * `report-plate-motion-track` run AWS Rekognition on them.
 *
 * Everything is best-effort. Any failure simply means no track is persisted
 * and the lip-sync pipeline stays on its pre-v327 static path.
 */
import { supabase } from '@/integrations/supabase/client';

export interface PlateMotionProbeResult {
  ok: boolean;
  reason?: string;
  samples?: number;
}

const SAMPLE_COUNT = 7;
const MAX_EDGE = 960;
const OVERALL_TIMEOUT_MS = 25_000;

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag}_timeout`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    const onReady = () => resolve();
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', () => reject(new Error('video_load_failed')), { once: true });
  });
  return video;
}

async function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => resolve();
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', () => reject(new Error('video_seek_failed')), { once: true });
    video.currentTime = t;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas_toblob_failed'))),
      'image/jpeg',
      0.82,
    );
  });
}

/**
 * Samples the plate, uploads the frames and asks the backend to build the
 * per-speaker motion track. Resolves with `ok:false` on every soft failure.
 */
export async function probePlateMotion(params: {
  sceneId: string;
  projectId: string;
  userId: string;
  plateUrl: string;
}): Promise<PlateMotionProbeResult> {
  try {
    return await withTimeout(runProbe(params), OVERALL_TIMEOUT_MS, 'motion_probe');
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

async function runProbe(params: {
  sceneId: string;
  projectId: string;
  userId: string;
  plateUrl: string;
}): Promise<PlateMotionProbeResult> {
  const video = await loadVideo(params.plateUrl);
  const duration = Number(video.duration);
  if (!Number.isFinite(duration) || duration <= 0.4) {
    return { ok: false, reason: 'plate_too_short' };
  }

  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) return { ok: false, reason: 'no_dims' };

  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const outW = Math.max(2, Math.round(srcW * scale));
  const outH = Math.max(2, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, reason: 'no_2d_context' };

  const stamp = Date.now();
  const frames: Array<{ t: number; url: string }> = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = (duration * (i + 0.5)) / SAMPLE_COUNT;
    try {
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, outW, outH);
      const blob = await canvasToBlob(canvas);
      const path = `${params.userId}/${params.projectId || 'shared'}/motion-frames/${params.sceneId}-${stamp}-f${i}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('composer-frames')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
      if (upErr) continue;
      const { data: pub } = supabase.storage.from('composer-frames').getPublicUrl(path);
      if (pub?.publicUrl) frames.push({ t, url: pub.publicUrl });
    } catch {
      // skip this sample
    }
  }

  video.src = '';

  if (frames.length < 2) return { ok: false, reason: 'insufficient_frames' };

  const { data, error } = await supabase.functions.invoke('report-plate-motion-track', {
    body: {
      scene_id: params.sceneId,
      plate_url: params.plateUrl,
      width: outW,
      height: outH,
      frames,
    },
  });
  if (error) return { ok: false, reason: 'report_failed' };
  return { ok: data?.ok === true, samples: data?.samples, reason: data?.error };
}
