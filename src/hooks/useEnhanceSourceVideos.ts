import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  fromCreationRow,
  fromGenerationRow,
  mergeCanonicalAssets,
  type CanonicalVideoAsset,
} from '@/lib/videoEnhance/canonicalVideoAsset';

/**
 * Source list for the Video Enhance picker.
 *
 * Both backing tables are queried server-side with keyset pagination on
 * `created_at`, merged into one canonical, deduplicated and stably sorted
 * list. The picker therefore always shows the globally newest assets — never
 * "N per table" — and never loads the whole media library into the browser.
 */

export type EnhanceSourceFilter = 'recent' | 'generated' | 'uploaded' | 'enhanced';

const INTERNAL_ARTIFACT = /(preclip|silence_track|bounding_boxes|_probe_)/i;

interface FetchArgs {
  userId: string;
  filter: EnhanceSourceFilter;
  search: string;
  /** ISO timestamp — only rows strictly older than this are returned. */
  before: string | null;
  limit: number;
}

async function fetchGenerations({ userId, filter, search, before, limit }: FetchArgs) {
  if (filter === 'uploaded' || filter === 'enhanced') return [];
  let query = supabase
    .from('ai_video_generations')
    .select('id, video_url, thumbnail_url, prompt, model, resolution, duration_seconds, created_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .not('video_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) query = query.lt('created_at', before);
  if (search) query = query.ilike('prompt', `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? [])
    .map((row) => fromGenerationRow(row as Record<string, unknown>))
    .filter((a): a is CanonicalVideoAsset => !!a);
}

async function fetchCreations({ userId, filter, search, before, limit }: FetchArgs) {
  let query = supabase
    .from('video_creations')
    .select(
      'id, output_url, thumbnail_url, framerate, format, quality, metadata, parent_video_id, created_at',
    )
    .eq('user_id', userId)
    .eq('status', 'completed')
    .not('output_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) query = query.lt('created_at', before);
  if (filter === 'uploaded') query = query.filter('metadata->>source', 'eq', 'upload');
  if (filter === 'enhanced') query = query.filter('metadata->>source', 'ilike', '%enhance%');
  if (filter === 'generated') query = query.not('metadata->>source', 'eq', 'upload');
  if (search) {
    query = query.or(
      `metadata->>title.ilike.%${search}%,metadata->>original_filename.ilike.%${search}%,metadata->>prompt.ilike.%${search}%`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? [])
    .filter((row) => !INTERNAL_ARTIFACT.test(String((row as { output_url?: string }).output_url ?? '')))
    .map((row) => fromCreationRow(row as Record<string, unknown>))
    .filter((a): a is CanonicalVideoAsset => !!a);
}

async function fetchPage(args: FetchArgs): Promise<CanonicalVideoAsset[]> {
  // Over-fetch a little from each table so the merged window still contains
  // `limit` globally newest assets after deduplication.
  const wide = { ...args, limit: args.limit * 2 };
  const [generations, creations] = await Promise.all([
    fetchGenerations(wide),
    fetchCreations(wide),
  ]);
  return mergeCanonicalAssets(generations, creations);
}

/** Compact gallery: the globally newest assets across both sources. */
export function useRecentEnhanceSources(limit = 8) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['enhance-sources-recent', user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const merged = await fetchPage({
        userId: user!.id,
        filter: 'recent',
        search: '',
        before: null,
        limit,
      });
      return merged.slice(0, limit);
    },
  });
}

/** "All videos" dialog: paginated, server-filtered, stable ordering. */
export function useEnhanceSourceLibrary(
  filter: EnhanceSourceFilter,
  search: string,
  pageSize = 18,
  enabled = true,
) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ['enhance-sources-library', user?.id, filter, search, pageSize],
    enabled: !!user && enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const merged = await fetchPage({
        userId: user!.id,
        filter,
        search: search.trim(),
        before: pageParam,
        limit: pageSize,
      });
      return merged.slice(0, pageSize);
    },
    getNextPageParam: (lastPage) =>
      lastPage.length < pageSize ? undefined : (lastPage[lastPage.length - 1]?.createdAt ?? undefined),
  });
}
