// World-asset catalog (Locations / Buildings / Props) — admin-seeded preview rows
// from `*_catalog_previews`. Surfaced everywhere a user can pick a scene asset
// (Composer SceneCard pools, @-mention library, scene-director matching) so
// users get a real-image catalog out of the box without saving anything to
// their personal library first.
//
// Catalog rows are read-only and tagged `catalog` so the dedupe rule in
// `useUnifiedMentionLibrary` always lets a saved Brand item win over the
// catalog when slugs collide.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type WorldCatalogKind = 'location' | 'building' | 'prop' | 'character';

export interface WorldCatalogItem {
  id: string;
  kind: WorldCatalogKind;
  name: string;            // = label, used for slugify
  theme_pack: string;
  reference_image_url: string | null;
}

const TABLE: Record<WorldCatalogKind, string> = {
  location: 'location_catalog_previews',
  building: 'building_catalog_previews',
  prop: 'prop_catalog_previews',
  character: 'character_catalog_previews',
};

async function fetchKind(kind: WorldCatalogKind): Promise<WorldCatalogItem[]> {
  const { data, error } = await (supabase as any)
    .from(TABLE[kind])
    .select('id, theme_pack, label, image_url')
    .order('theme_pack', { ascending: true })
    .order('label', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    kind,
    name: r.label,
    theme_pack: r.theme_pack,
    reference_image_url: r.image_url ?? null,
  }));
}

export function useWorldCatalog() {
  const locations = useQuery({
    queryKey: ['world-catalog', 'location'],
    queryFn: () => fetchKind('location'),
    staleTime: 5 * 60 * 1000,
  });
  const buildings = useQuery({
    queryKey: ['world-catalog', 'building'],
    queryFn: () => fetchKind('building'),
    staleTime: 5 * 60 * 1000,
  });
  const props = useQuery({
    queryKey: ['world-catalog', 'prop'],
    queryFn: () => fetchKind('prop'),
    staleTime: 5 * 60 * 1000,
  });
  const characters = useQuery({
    queryKey: ['world-catalog', 'character'],
    queryFn: () => fetchKind('character'),
    staleTime: 5 * 60 * 1000,
  });

  return {
    catalogLocations: locations.data ?? [],
    catalogBuildings: buildings.data ?? [],
    catalogProps: props.data ?? [],
    catalogCharacters: characters.data ?? [],
    isLoading:
      locations.isLoading || buildings.isLoading || props.isLoading || characters.isLoading,
  };
}
