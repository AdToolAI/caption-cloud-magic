import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type {
  MotionStudioCharacter,
  MotionStudioLocation,
  CharacterDraft,
  LocationDraft,
  CharacterVariant,
  LocationVariant,
  SceneSnippet,
  SceneSnippetDraft,
} from '@/types/motion-studio';

/**
 * Hook für Motion Studio Character & Location Library.
 * Lädt + verwaltet Bibliotheken, Casting-Variants, Location-Variants
 * und wiederverwendbare Scene Snippets eines Users (inkl. geteilter
 * Workspace-Assets).
 */
export function useMotionStudioLibrary() {
  const { user } = useAuth();
  const [characters, setCharacters] = useState<MotionStudioCharacter[]>([]);
  const [locations, setLocations] = useState<MotionStudioLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!user) {
      setCharacters([]);
      setLocations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [charsRes, locsRes] = await Promise.all([
        supabase
          .from('motion_studio_characters')
          .select('*')
          .order('updated_at', { ascending: false }),
        supabase
          .from('motion_studio_locations')
          .select('*')
          .order('updated_at', { ascending: false }),
      ]);
      if (charsRes.error) throw charsRes.error;
      if (locsRes.error) throw locsRes.error;
      setCharacters((charsRes.data || []) as MotionStudioCharacter[]);
      setLocations((locsRes.data || []) as MotionStudioLocation[]);
    } catch (err) {
      console.error('[useMotionStudioLibrary] load error:', err);
      toast.error('Bibliothek konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Characters ──────────────────────────────────────────────────────────
  const createCharacter = useCallback(
    async (draft: CharacterDraft): Promise<MotionStudioCharacter | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('motion_studio_characters')
        .insert({ ...draft, user_id: user.id })
        .select()
        .single();
      if (error) {
        toast.error(`Charakter speichern fehlgeschlagen: ${error.message}`);
        return null;
      }
      const created = data as MotionStudioCharacter;
      setCharacters((prev) => [created, ...prev]);
      toast.success(`„${created.name}" wurde gespeichert`);
      return created;
    },
    [user]
  );

  const updateCharacter = useCallback(
    async (id: string, patch: Partial<CharacterDraft>): Promise<boolean> => {
      const { data, error } = await supabase
        .from('motion_studio_characters')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        toast.error(`Update fehlgeschlagen: ${error.message}`);
        return false;
      }
      setCharacters((prev) => prev.map((c) => (c.id === id ? (data as MotionStudioCharacter) : c)));
      return true;
    },
    []
  );

  const deleteCharacter = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('motion_studio_characters').delete().eq('id', id);
    if (error) {
      toast.error(`Löschen fehlgeschlagen: ${error.message}`);
      return false;
    }
    setCharacters((prev) => prev.filter((c) => c.id !== id));
    toast.success('Charakter gelöscht');
    return true;
  }, []);

  // ── Locations ───────────────────────────────────────────────────────────
  const createLocation = useCallback(
    async (draft: LocationDraft): Promise<MotionStudioLocation | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('motion_studio_locations')
        .insert({ ...draft, user_id: user.id })
        .select()
        .single();
      if (error) {
        toast.error(`Location speichern fehlgeschlagen: ${error.message}`);
        return null;
      }
      const created = data as MotionStudioLocation;
      setLocations((prev) => [created, ...prev]);
      toast.success(`„${created.name}" wurde gespeichert`);
      return created;
    },
    [user]
  );

  const updateLocation = useCallback(
    async (id: string, patch: Partial<LocationDraft>): Promise<boolean> => {
      const { data, error } = await supabase
        .from('motion_studio_locations')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        toast.error(`Update fehlgeschlagen: ${error.message}`);
        return false;
      }
      setLocations((prev) => prev.map((l) => (l.id === id ? (data as MotionStudioLocation) : l)));
      return true;
    },
    []
  );

  const deleteLocation = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('motion_studio_locations').delete().eq('id', id);
    if (error) {
      toast.error(`Löschen fehlgeschlagen: ${error.message}`);
      return false;
    }
    setLocations((prev) => prev.filter((l) => l.id !== id));
    toast.success('Location gelöscht');
    return true;
  }, []);

  // ── Storage helper für Reference-Image-Upload ───────────────────────────
  const uploadLibraryImage = useCallback(
    async (
      file: File,
      kind: 'character' | 'location',
      entityId: string
    ): Promise<string | null> => {
      if (!user) {
        toast.error('Nicht angemeldet');
        return null;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/${kind}s/${entityId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('motion-studio-library')
        .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type });
      if (error) {
        toast.error(`Upload fehlgeschlagen: ${error.message}`);
        return null;
      }
      // Bucket ist privat → wir geben einen lange-gültigen Signed-URL zurück
      const { data: signed } = await supabase.storage
        .from('motion-studio-library')
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 Jahr
      return signed?.signedUrl ?? null;
    },
    [user]
  );

  /**
   * Persist a remote AI-generated image into the library bucket.
   * Used by multi-vibe casting (each variant URL is a Gemini data-URL or signed URL).
   */
  const persistRemoteImage = useCallback(
    async (
      remoteUrl: string,
      kind: 'character' | 'location',
      entityId: string,
    ): Promise<string | null> => {
      if (!user) return null;
      try {
        const r = await fetch(remoteUrl);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        const ext = (blob.type.split('/')[1] || 'png').replace(/;.*/, '');
        const file = new File([blob], `variant.${ext}`, { type: blob.type });
        return await uploadLibraryImage(file, kind, entityId);
      } catch (err) {
        console.error('[persistRemoteImage]', err);
        return null;
      }
    },
    [user, uploadLibraryImage],
  );

  // Increment usage_count, fire-and-forget
  const trackUsage = useCallback(
    async (kind: 'character' | 'location', id: string) => {
      const table = kind === 'character' ? 'motion_studio_characters' : 'motion_studio_locations';
      const list = kind === 'character' ? characters : locations;
      const current = list.find((x) => x.id === id);
      if (!current) return;
      await supabase
        .from(table)
        .update({ usage_count: (current.usage_count ?? 0) + 1 })
        .eq('id', id);
    },
    [characters, locations]
  );

  // ── Character Variants (Casting) ────────────────────────────────────────
  const listCharacterVariants = useCallback(
    async (characterId: string): Promise<CharacterVariant[]> => {
      const { data, error } = await supabase
        .from('motion_studio_character_variants')
        .select('*')
        .eq('character_id', characterId)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[listCharacterVariants]', error);
        return [];
      }
      return (data || []) as CharacterVariant[];
    },
    [],
  );

  const insertCharacterVariant = useCallback(
    async (
      characterId: string,
      vibe: string,
      imageUrl: string,
      seed?: string | null,
      isPrimary?: boolean,
    ): Promise<CharacterVariant | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('motion_studio_character_variants')
        .insert({
          character_id: characterId,
          user_id: user.id,
          vibe,
          image_url: imageUrl,
          seed: seed ?? null,
          is_primary: isPrimary ?? false,
        })
        .select()
        .single();
      if (error) {
        toast.error(`Variante speichern fehlgeschlagen: ${error.message}`);
        return null;
      }
      return data as CharacterVariant;
    },
    [user],
  );

  const setCharacterPrimaryVariant = useCallback(
    async (characterId: string, variantId: string): Promise<boolean> => {
      // Two-step: clear any existing primary, then set the new one (unique partial idx).
      const { error: clearErr } = await supabase
        .from('motion_studio_character_variants')
        .update({ is_primary: false })
        .eq('character_id', characterId)
        .eq('is_primary', true);
      if (clearErr) {
        console.warn('[setPrimaryVariant clear]', clearErr);
      }
      const { data, error } = await supabase
        .from('motion_studio_character_variants')
        .update({ is_primary: true })
        .eq('id', variantId)
        .select()
        .single();
      if (error || !data) {
        toast.error('Primäre Variante konnte nicht gesetzt werden');
        return false;
      }
      // Mirror into character.reference_image_url so existing pipelines work.
      const variant = data as CharacterVariant;
      await updateCharacter(characterId, {
        reference_image_url: variant.image_url,
        reference_image_seed: variant.seed,
      });
      return true;
    },
    [updateCharacter],
  );

  const deleteCharacterVariant = useCallback(async (variantId: string) => {
    const { error } = await supabase
      .from('motion_studio_character_variants')
      .delete()
      .eq('id', variantId);
    if (error) toast.error(`Löschen fehlgeschlagen: ${error.message}`);
    return !error;
  }, []);

  // ── Location Variants (Lighting / Inpaint) ──────────────────────────────
  const listLocationVariants = useCallback(
    async (locationId: string): Promise<LocationVariant[]> => {
      const { data, error } = await supabase
        .from('motion_studio_location_variants')
        .select('*')
        .eq('location_id', locationId)
        .order('created_at', { ascending: false });
      if (error) return [];
      return (data || []) as LocationVariant[];
    },
    [],
  );

  const insertLocationVariant = useCallback(
    async (
      locationId: string,
      vibe: string,
      imageUrl: string,
      seed?: string | null,
    ): Promise<LocationVariant | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('motion_studio_location_variants')
        .insert({
          location_id: locationId,
          user_id: user.id,
          vibe,
          image_url: imageUrl,
          seed: seed ?? null,
        })
        .select()
        .single();
      if (error) {
        toast.error(`Variante speichern fehlgeschlagen: ${error.message}`);
        return null;
      }
      return data as LocationVariant;
    },
    [user],
  );

  const setLocationPrimaryVariant = useCallback(
    async (locationId: string, variantId: string): Promise<boolean> => {
      await supabase
        .from('motion_studio_location_variants')
        .update({ is_primary: false })
        .eq('location_id', locationId)
        .eq('is_primary', true);
      const { data, error } = await supabase
        .from('motion_studio_location_variants')
        .update({ is_primary: true })
        .eq('id', variantId)
        .select()
        .single();
      if (error || !data) return false;
      const variant = data as LocationVariant;
      await updateLocation(locationId, { reference_image_url: variant.image_url });
      return true;
    },
    [updateLocation],
  );

  const deleteLocationVariant = useCallback(async (variantId: string) => {
    const { error } = await supabase
      .from('motion_studio_location_variants')
      .delete()
      .eq('id', variantId);
    if (error) toast.error(`Löschen fehlgeschlagen: ${error.message}`);
    return !error;
  }, []);

  // ── Scene Snippets ──────────────────────────────────────────────────────
  const listSceneSnippets = useCallback(async (): Promise<SceneSnippet[]> => {
    if (!user) return [];
    const { data, error } = await supabase
      .from('motion_studio_scene_snippets')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      console.warn('[listSceneSnippets]', error);
      return [];
    }
    return (data || []) as SceneSnippet[];
  }, [user]);

  const createSceneSnippet = useCallback(
    async (draft: SceneSnippetDraft): Promise<SceneSnippet | null> => {
      if (!user) return null;
      const { data, error } = await (supabase as any)
        .from('motion_studio_scene_snippets')
        .insert({ ...draft, user_id: user.id })
        .select()
        .single();
      if (error) {
        toast.error(`Snippet speichern fehlgeschlagen: ${error.message}`);
        return null;
      }
      toast.success(`Snippet „${data.name}" gespeichert`);
      return data as SceneSnippet;
    },
    [user],
  );

  const deleteSceneSnippet = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('motion_studio_scene_snippets')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error(`Löschen fehlgeschlagen: ${error.message}`);
      return false;
    }
    toast.success('Snippet gelöscht');
    return true;
  }, []);

  return {
    characters,
    locations,
    loading,
    reload: loadAll,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    createLocation,
    updateLocation,
    deleteLocation,
    uploadLibraryImage,
    persistRemoteImage,
    trackUsage,
    // casting
    listCharacterVariants,
    insertCharacterVariant,
    setCharacterPrimaryVariant,
    deleteCharacterVariant,
    // location vibes
    listLocationVariants,
    insertLocationVariant,
    setLocationPrimaryVariant,
    deleteLocationVariant,
    // snippets
    listSceneSnippets,
    createSceneSnippet,
    deleteSceneSnippet,
  };
}
