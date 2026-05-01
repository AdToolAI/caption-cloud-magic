import { supabase } from "@/integrations/supabase/client";
import { DEMO_VIDEO } from "@/constants/demo-video";

export interface CleanupMediaItem {
  id: string;
  source: 'upload' | 'ai' | 'ai_generator' | 'campaign' | 'video-creator' | 'cloud';
  type: 'image' | 'video';
  createdAt: string;
  storagePath?: string;
  fileSizeMb?: number;
}

/**
 * Returns true if this item must never be auto-deleted.
 * - Demo video
 * - Cloud-hosted items (don't count toward local limit)
 */
export function isProtected(item: CleanupMediaItem): boolean {
  if (item.id === DEMO_VIDEO.id) return true;
  if (item.source === 'cloud') return true;
  return false;
}

/**
 * Sort by createdAt asc and pick the N oldest deletable items of a given type.
 */
export function findOldestDeletable<T extends CleanupMediaItem>(
  media: T[],
  type: 'image' | 'video',
  count: number
): T[] {
  if (count <= 0) return [];
  return [...media]
    .filter(m => m.type === type && !isProtected(m))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, count);
}

/**
 * Pick oldest videos until at least `requiredMb` of fileSizeMb is freed.
 */
export function findOldestForBytes<T extends CleanupMediaItem>(
  media: T[],
  requiredMb: number
): T[] {
  if (requiredMb <= 0) return [];
  const sorted = [...media]
    .filter(m => !isProtected(m) && (m.fileSizeMb ?? 0) > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const picked: T[] = [];
  let freed = 0;
  for (const item of sorted) {
    if (freed >= requiredMb) break;
    picked.push(item);
    freed += item.fileSizeMb ?? 0;
  }
  return picked;
}

/**
 * Delete a single media item from the correct table + storage bucket.
 * Mirrors the logic of handleDelete in MediaLibrary.tsx.
 */
export async function deleteMediaItem(item: CleanupMediaItem): Promise<void> {
  if (isProtected(item)) return;

  if (item.source === 'upload' && item.storagePath) {
    await supabase.storage.from('media-assets').remove([item.storagePath]);
    const { error } = await supabase.from('media_assets').delete().eq('id', item.id);
    if (error) throw error;
    return;
  }

  if (item.source === 'video-creator' || (item.source === 'ai' && item.type === 'video')) {
    const { error } = await supabase.from('video_creations').delete().eq('id', item.id);
    if (error) throw error;
    return;
  }

  if (item.source === 'ai' || item.source === 'ai_generator' || item.source === 'campaign') {
    const { error } = await supabase.from('content_items').delete().eq('id', item.id);
    if (error) throw error;
    return;
  }
}

export interface EnforceLimitsArgs<T extends CleanupMediaItem> {
  media: T[];
  incoming: { type: 'image' | 'video'; sizeMb: number };
  hasCloud: boolean;
  limits: { maxVideos: number; maxImages: number; maxStorageMb: number };
  currentUsedMb: number;
}

export interface EnforceLimitsResult<T extends CleanupMediaItem> {
  /** Items to delete BEFORE the upload proceeds (FIFO). Empty if cloud is connected. */
  toDelete: T[];
  /** True if upload should be blocked (cloud connected + hard-limit reached, or nothing freeable). */
  blocked: boolean;
  /** Human-readable reason when blocked. */
  blockReason?: 'cloud_offload_required' | 'nothing_to_delete';
}

/**
 * Decide what to delete (or whether to block) so the incoming upload fits.
 * - No cloud  → return FIFO items to delete locally (auto-cleanup).
 * - Cloud connected → block when limits are hit and ask user to offload.
 */
export function enforceLimits<T extends CleanupMediaItem>(
  args: EnforceLimitsArgs<T>
): EnforceLimitsResult<T> {
  const { media, incoming, hasCloud, limits, currentUsedMb } = args;

  const localMedia = media.filter(m => m.source !== 'cloud');
  const videoCount = localMedia.filter(m => m.type === 'video').length;
  const imageCount = localMedia.filter(m => m.type === 'image').length;

  const overByType =
    incoming.type === 'video'
      ? Math.max(0, videoCount + 1 - limits.maxVideos)
      : Math.max(0, imageCount + 1 - limits.maxImages);

  const projectedMb = currentUsedMb + incoming.sizeMb;
  const overByStorageMb = Math.max(0, projectedMb - limits.maxStorageMb);

  if (overByType === 0 && overByStorageMb === 0) {
    return { toDelete: [], blocked: false };
  }

  if (hasCloud) {
    return { toDelete: [], blocked: true, blockReason: 'cloud_offload_required' };
  }

  const toDelete: T[] = [];
  const seen = new Set<string>();

  // 1) Free type slots (FIFO of same type)
  if (overByType > 0) {
    for (const item of findOldestDeletable(localMedia as T[], incoming.type, overByType)) {
      if (!seen.has(item.id)) {
        toDelete.push(item);
        seen.add(item.id);
      }
    }
  }

  // 2) Free storage bytes (FIFO across all types, by size)
  if (overByStorageMb > 0) {
    const alreadyFreed = toDelete.reduce((s, i) => s + (i.fileSizeMb ?? 0), 0);
    const stillNeed = overByStorageMb - alreadyFreed;
    if (stillNeed > 0) {
      for (const item of findOldestForBytes(localMedia as T[], stillNeed)) {
        if (!seen.has(item.id)) {
          toDelete.push(item);
          seen.add(item.id);
        }
      }
    }
  }

  if (toDelete.length === 0) {
    return { toDelete: [], blocked: true, blockReason: 'nothing_to_delete' };
  }

  return { toDelete, blocked: false };
}
