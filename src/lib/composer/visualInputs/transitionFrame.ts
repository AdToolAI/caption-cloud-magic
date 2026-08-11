import { supabase } from '@/integrations/supabase/client';

/**
 * transitionFrame.ts — finds the LAST USABLE continuity frame of a rendered
 * clip and uploads it, so the next scene can start exactly where the previous
 * one ended.
 *
 * "Last usable" instead of "last": the very last frame of a generated clip is
 * frequently a fade-to-black, a motion-blur smear or a compression-mushed
 * frame. Chaining onto such a frame produces a visibly worse cut than no
 * chaining at all, so the candidates are probed from the end backwards and the
 * first one that carries real image information wins.
 *
 * Runs in the browser on an existing clip URL — no Lambda, no Replicate, no
 * server-side ffmpeg. It never touches `referenceImageUrl` /
 * `lockReferenceUrl`; the produced URL is a pure continuity asset.
 */

/** Seconds before the clip end that are probed, in order. */
const CANDIDATE_OFFSETS = [0.08, 0.25, 0.5, 0.8, 1.2];

export interface FrameQuality {
  /** Mean luminance 0..255 — near 0 means fade-to-black, near 255 blown out. */
  luma: number;
  /** Luminance standard deviation — low means flat/blurred/empty. */
  detail: number;
  usable: boolean;
}

export function scoreFrame(data: Uint8ClampedArray): FrameQuality {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  // Sample every 5th pixel. Cheap enough for 5 candidates, and an odd stride
  // avoids aliasing away high-frequency detail on regular patterns (an even
  // stride can land on the same phase of a 2-pixel pattern and report a
  // perfectly detailed frame as flat).
  for (let i = 0; i < data.length; i += 20) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += y;
    sumSq += y * y;
    n += 1;
  }
  if (n === 0) return { luma: 0, detail: 0, usable: false };
  const luma = sum / n;
  const detail = Math.sqrt(Math.max(0, sumSq / n - luma * luma));
  // Fade-to-black / white-out / flat frames are rejected.
  const usable = luma > 12 && luma < 245 && detail > 8;
  return { luma, detail, usable };
}

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('transition_frame_timeout')), 20000);
    video.addEventListener(
      'loadedmetadata',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    video.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('transition_frame_video_load_failed'));
      },
      { once: true },
    );
  });
  return video;
}

async function seek(video: HTMLVideoElement, time: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('transition_frame_seek_timeout')), 10000);
    video.addEventListener(
      'seeked',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    video.currentTime = time;
  });
}

export interface TransitionFrameResult {
  url: string;
  atSeconds: number;
  quality: FrameQuality;
  /** True when no candidate passed and the best available frame was used. */
  degraded: boolean;
}

export async function captureTransitionFrame(
  clipUrl: string,
  userId: string,
  opts: { quality?: number } = {},
): Promise<TransitionFrameResult> {
  const video = await loadVideo(clipUrl);
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('transition_frame_no_canvas');

  let best: { at: number; q: FrameQuality } | null = null;

  for (const offset of CANDIDATE_OFFSETS) {
    const at = Math.max(0, duration - offset);
    try {
      await seek(video, at);
    } catch {
      continue;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const q = scoreFrame(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    if (!best || q.detail > best.q.detail) best = { at, q };
    if (q.usable) break;
  }

  if (!best) throw new Error('transition_frame_no_candidate');

  // Re-draw the winner (the loop may have moved on to a worse candidate).
  await seek(video, best.at);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('transition_frame_encode_failed'))),
      'image/jpeg',
      opts.quality ?? 0.92,
    ),
  );

  // RLS: the user id must be the first path segment.
  const path = `${userId}/transition-frames/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from('composer-uploads')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from('composer-uploads').getPublicUrl(path);
  return { url: data.publicUrl, atSeconds: best.at, quality: best.q, degraded: !best.q.usable };
}
