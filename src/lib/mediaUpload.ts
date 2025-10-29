/**
 * Media Upload Utilities for Supabase Storage
 */

import { supabase } from '@/integrations/supabase/client';

export interface UploadedMedia {
  type: 'image' | 'video';
  url: string;
  mime: string;
  size: number;
}

/**
 * Upload media files to Supabase Storage (media-assets bucket)
 */
export async function uploadMediaToSupabase(
  files: File[],
  userId: string
): Promise<UploadedMedia[]> {
  const uploaded: UploadedMedia[] = [];

  for (const file of files) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `calendar/${fileName}`;

    const { data, error } = await supabase.storage
      .from('media-assets')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      throw new Error(`Failed to upload ${file.name}: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('media-assets')
      .getPublicUrl(data.path);

    uploaded.push({
      type: file.type.startsWith('video/') ? 'video' : 'image',
      url: publicUrl,
      mime: file.type,
      size: file.size,
    });
  }

  return uploaded;
}
