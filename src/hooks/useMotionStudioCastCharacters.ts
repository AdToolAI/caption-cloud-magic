/**
 * Motion Studio character source — Cast & World first.
 *
 * Cast & World (`brand_characters`) is the single source of truth for
 * characters. Motion Studio used to read only the legacy
 * `motion_studio_characters` table, so characters picked anywhere else in the
 * product never showed up here. This hook merges both, Cast & World wins on
 * duplicate names, and legacy entries stay available until they are migrated.
 */

import { useMemo } from 'react';
import { useAccessibleCharacters } from '@/hooks/useAccessibleCharacters';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import type { MotionStudioCharacter } from '@/types/motion-studio';

function adaptCastCharacter(c: any): MotionStudioCharacter {
  const identityCard =
    c.identity_card_prompt ??
    c.visual_identity_json?.identity_card_prompt ??
    c.visual_identity_json?.identityCard ??
    '';
  return {
    id: c.id,
    user_id: c.user_id,
    name: c.name ?? 'Unnamed',
    description: c.description ?? identityCard ?? '',
    signature_items: c.visual_identity_json?.signature_items ?? '',
    reference_image_url: c.portrait_url ?? c.reference_image_url ?? null,
    reference_image_seed: null,
    voice_id: c.default_voice_id ?? null,
    tags: c.tags ?? [],
    usage_count: c.usage_count ?? 0,
    workspace_id: null,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

export function useMotionStudioCastCharacters(): {
  characters: MotionStudioCharacter[];
  castWorldIds: Set<string>;
  loading: boolean;
} {
  const { data: castChars = [], isLoading: castLoading } = useAccessibleCharacters();
  const { characters: legacyChars, loading: legacyLoading } = useMotionStudioLibrary();

  return useMemo(() => {
    const adapted = castChars.map((c) => adaptCastCharacter(c));
    const seen = new Set(adapted.map((c) => c.name.trim().toLowerCase()));
    const extras = legacyChars.filter((c) => !seen.has((c.name ?? '').trim().toLowerCase()));
    return {
      characters: [...adapted, ...extras],
      castWorldIds: new Set(adapted.map((c) => c.id)),
      loading: castLoading || legacyLoading,
    };
  }, [castChars, legacyChars, castLoading, legacyLoading]);
}
