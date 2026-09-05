import { supabase } from '@/integrations/supabase/client';
import {
  canonicalStorageKey,
  fromCreationRow,
  type CanonicalVideoAsset,
} from '@/lib/videoEnhance/canonicalVideoAsset';

/**
 * A dropped/uploaded file becomes a REAL AdTool video asset before it can be
 * enhanced: durable storage + a `video_creations` row we own. Video Enhance
 * then receives `{ assetId, assetType }`, so ownership checks, lineage and the
 * media library keep working. A raw public URL is never handed to the engine.
 *
 * The browser-derived dimensions are stored as PROVISIONAL metadata
 * (`metadata_verified: false`). `video-enhance` measures the file itself and
 * replaces them.
 */

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const BUCKET = 'composer-uploads';

export interface ProvisionalVideoMeta {
  width: number | null;
  height: number | null;
  fps: number | null;
  duration: number | null;
}

/** Display-only probe. Never authoritative for pricing. */
export function readProvisionalMeta(file: File): Promise<ProvisionalVideoMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (meta: ProvisionalVideoMeta) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      done({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        fps: null,
        duration: Number.isFinite(video.duration) ? Math.round(video.duration * 100) / 100 : null,
      });
    video.onerror = () => done({ width: null, height: null, fps: null, duration: null });
    video.src = url;
  });
}

export async function uploadVideoAsset(
  file: File,
  userId: string,
): Promise<CanonicalVideoAsset> {
  if (!file.type.startsWith('video/')) throw new Error('UNSUPPORTED_FILE_TYPE');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('FILE_TOO_LARGE');

  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${userId}/video-enhance/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (uploadError) throw uploadError;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const meta = await readProvisionalMeta(file);

  const { data: row, error: insertError } = await supabase
    .from('video_creations')
    .insert({
      user_id: userId,
      output_url: pub.publicUrl,
      status: 'completed',
      framerate: meta.fps,
      format: ext,
      metadata: {
        source: 'upload',
        source_type: 'upload',
        original_filename: file.name,
        title: file.name.replace(/\.[^.]+$/, ''),
        storage_bucket: BUCKET,
        storage_key: canonicalStorageKey(pub.publicUrl) ?? `${BUCKET}/${path}`,
        size_bytes: file.size,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
        duration: meta.duration,
        metadata_verified: false,
      },
    })
    .select('id, output_url, thumbnail_url, framerate, format, quality, metadata, parent_video_id, created_at')
    .single();

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw insertError;
  }

  const asset = fromCreationRow(row as unknown as Record<string, unknown>);
  if (!asset) throw new Error('ASSET_PERSIST_FAILED');
  return asset;
}
