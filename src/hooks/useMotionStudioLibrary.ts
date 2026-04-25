import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type {
  MotionStudioCharacter,
  MotionStudioLocation,
  CharacterDraft,
  LocationDraft,
} from '@/types/motion-studio';

/**
 * Hook für Motion Studio Character & Location Library.
 * Lädt + verwaltet die globalen Bibliotheken eines Users.
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
    trackUsage,
  };
}
