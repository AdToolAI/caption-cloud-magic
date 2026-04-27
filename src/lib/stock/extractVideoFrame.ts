import { supabase } from '@/integrations/supabase/client';

/**
 * Extract a frame from a remote video URL via offscreen <video> + canvas,
 * upload it to the `composer-uploads` bucket under the user's folder,
 * and return the public URL. Used to convert stock video clips into
 * still references that downstream image-pipelines can consume.
 */
export async function extractFrameFromVideoUrl(
  videoUrl: string,
  userId: string,
  options: { atSeconds?: number; quality?: number } = {}
): Promise<string> {
  const { atSeconds = 1, quality = 0.85 } = options;

  // Load the video into a hidden element
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    const onMeta = () => resolve();
    const onErr = () => reject(new Error('Video could not be loaded for frame extraction'));
    video.addEventListener('loadedmetadata', onMeta, { once: true });
    video.addEventListener('error', onErr, { once: true });
    setTimeout(() => reject(new Error('Frame extraction timed out')), 15000);
  });

  // Seek to the requested time (clamped)
  const target = Math.min(Math.max(0, atSeconds), Math.max(0, (video.duration || 1) - 0.1));
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => resolve();
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', () => reject(new Error('Seek failed')), { once: true });
    try {
      video.currentTime = target;
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Seek threw'));
    }
  });

  // Draw to canvas
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(video, 0, 0, w, h);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      quality
    )
  );

  // Upload to user-scoped path (RLS requires user id as first segment)
  const path = `${userId}/stock-frames/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error: upErr } = await supabase.storage
    .from('composer-uploads')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from('composer-uploads').getPublicUrl(path);
  return data.publicUrl;
}
