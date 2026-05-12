// Stage 3 — Unified mention library
//
// Aggregates the user's Avatar (brand_characters) + Location (brand_locations)
// libraries — the canonical sources used by AI Toolkit / TalkingHead / Composer —
// AND the legacy motion_studio_characters / motion_studio_locations entries,
// adapted into the `MotionStudioCharacter` / `MotionStudioLocation` shape that
// `composePromptLayers` and `resolveMentions` expect.
//
// This is a *read* helper for `<PromptMentionEditor>` and the @-mention
// resolution pipeline. Writes still go to each library's own page.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAccessibleCharacters } from '@/hooks/useAccessibleCharacters';
import { useBrandLocations } from '@/hooks/useBrandLocations';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import type {
  MotionStudioCharacter,
  MotionStudioLocation,
} from '@/types/motion-studio';

function adaptCharacter(c: any): MotionStudioCharacter {
  const id = c.identity_card_prompt
    ?? c.visual_identity_json?.identity_card_prompt
    ?? c.visual_identity_json?.identityCard
    ?? '';
  return {
    id: c.id,
    user_id: c.user_id,
    name: c.name ?? 'Unnamed',
    description: c.description ?? id ?? '',
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

function adaptLocation(l: any): MotionStudioLocation {
  const ident = l.visual_identity_json ?? {};
  const lighting = ident.lighting ?? ident.lighting_notes ?? '';
  const desc =
    l.description ??
    ident.prompt_descriptors?.join?.(', ') ??
    ident.environment ??
    '';
  return {
    id: l.id,
    user_id: l.user_id,
    name: l.name ?? 'Unnamed',
    description: desc,
    reference_image_url: l.reference_image_url ?? null,
    lighting_notes: typeof lighting === 'string' ? lighting : '',
    tags: l.tags ?? [],
    usage_count: l.usage_count ?? 0,
    workspace_id: null,
    created_at: l.created_at,
    updated_at: l.updated_at,
  };
}

/** Dedupe by lowercase name (Brand wins over Motion-Studio legacy). */
function dedupe<T extends { name: string }>(primary: T[], secondary: T[]): T[] {
  const seen = new Set(primary.map((x) => x.name.toLowerCase()));
  const extras = secondary.filter((x) => !seen.has(x.name.toLowerCase()));
  return [...primary, ...extras];
}

export function useUnifiedMentionLibrary(): {
  characters: MotionStudioCharacter[];
  locations: MotionStudioLocation[];
  loading: boolean;
} {
  const { data: brandChars = [], isLoading: charsLoading } = useAccessibleCharacters();
  const { locations: brandLocs = [], isLoading: locsLoading } = useBrandLocations();
  const { characters: msChars = [], locations: msLocs = [], loading: msLoading } =
    useMotionStudioLibrary();

  const characters = useMemo(
    () => dedupe(brandChars.map(adaptCharacter), msChars),
    [brandChars, msChars],
  );
  const locations = useMemo(
    () => dedupe(brandLocs.map(adaptLocation), msLocs),
    [brandLocs, msLocs],
  );

  return {
    characters,
    locations,
    loading: charsLoading || locsLoading || msLoading,
  };
}
