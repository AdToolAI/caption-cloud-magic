/**
 * useOutfitLookMap (v319)
 * --------------------------------------------------------------
 * Single shared source for `lookId → avatar (brand_characters) id`.
 *
 * Cast slots may still reference a person as `outfit:<lookId>` (unified
 * mention library / Studio Director). Without this map the same person shows
 * up twice in the cast — once as the base UUID, once as the outfit ref — which
 * burns a duplicate portrait slot and a ghost lip-sync pass.
 *
 * Uses the same React-Query key as `useUnifiedMentionLibrary` /
 * `useCharacterIdResolver`, so it never adds a roundtrip when those are mounted.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OutfitLookMap } from '@/lib/video-composer/canonicalCastId';

const EMPTY: OutfitLookMap = new Map<string, string>();

export function useOutfitLookMap(): { outfitLookMap: OutfitLookMap; isLoading: boolean } {
  const { data: looks = [], isLoading } = useQuery({
    queryKey: ['outfit-look-map'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('avatar_outfit_looks')
        .select('id, avatar_id');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; avatar_id: string }>;
    },
    staleTime: 5 * 60_000,
  });

  const outfitLookMap = useMemo<OutfitLookMap>(() => {
    if (!looks.length) return EMPTY;
    const m = new Map<string, string>();
    for (const l of looks) if (l?.id && l?.avatar_id) m.set(l.id, l.avatar_id);
    return m;
  }, [looks]);

  return { outfitLookMap, isLoading };
}
