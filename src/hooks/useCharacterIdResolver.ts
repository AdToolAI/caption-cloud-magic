/**
 * useCharacterIdResolver
 * --------------------------------------------------------------
 * Returns a memoized `resolve` function that normalizes any raw
 * characterId (`outfit:…`, `catalog:…`, `lib:…`, plain UUID) into
 * the base `brand_characters.id`. Reuses the same React-Query
 * cache key as `useUnifiedMentionLibrary` (`mention-library:outfit-looks`)
 * so it adds no extra network roundtrip when that library is already
 * mounted (Storyboard tab, scene editor, etc.).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  resolveCharacterId,
  isPrefixedCharacterId,
  type OutfitLookMap,
} from '@/lib/video-composer/resolveCharacterId';

export function useCharacterIdResolver() {
  const { data: outfitLooks = [], isLoading } = useQuery({
    queryKey: ['mention-library:outfit-looks'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('avatar_outfit_looks')
        .select('id, avatar_id');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const map: OutfitLookMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of outfitLooks as Array<{ id: string; avatar_id: string }>) {
      if (l?.id && l?.avatar_id) m.set(l.id, l.avatar_id);
    }
    return m;
  }, [outfitLooks]);

  const resolve = useMemo(
    () => (raw: string | null | undefined) => resolveCharacterId(raw, map),
    [map],
  );

  return { resolve, isPrefixed: isPrefixedCharacterId, isLoading };
}
