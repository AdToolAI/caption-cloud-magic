import { supabase } from '@/integrations/supabase/client';
import { normalizedUrl, type CanonicalAssetType } from '@/lib/videoEnhance/canonicalVideoAsset';

/**
 * Bridge for surfaces that still only know a video URL (media library
 * lightbox, Director's Cut preview). Resolves it back to the canonical asset
 * so Video Enhance always receives `{ assetId, assetType }`.
 */
export async function resolveAssetByUrl(
  url: string,
  userId: string,
): Promise<{ assetId: string; assetType: CanonicalAssetType } | null> {
  const plain = normalizedUrl(url) ?? url;

  const { data: creation } = await supabase
    .from('video_creations')
    .select('id')
    .eq('user_id', userId)
    .like('output_url', `${plain}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (creation?.id) return { assetId: creation.id, assetType: 'creation' };

  const { data: generation } = await supabase
    .from('ai_video_generations')
    .select('id')
    .eq('user_id', userId)
    .like('video_url', `${plain}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (generation?.id) return { assetId: generation.id, assetType: 'generation' };

  return null;
}
