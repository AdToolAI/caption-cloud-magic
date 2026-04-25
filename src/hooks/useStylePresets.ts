// Block K — Hook for Motion Studio Style Presets
//
// Loads the user's own + all public presets in a single query, with simple
// in-memory caching during the session.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PromptSlots } from '@/lib/motion-studio/structuredPromptStitcher';
import type { DirectorModifiers } from '@/lib/motion-studio/directorPresets';

export interface StylePreset {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  slots: PromptSlots;
  director_modifiers: DirectorModifiers;
  preview_thumb_url: string | null;
  category: string | null;
  usage_count: number;
  is_public: boolean;
  created_at: string;
}

interface UseStylePresetsResult {
  presets: StylePreset[];
  myPresets: StylePreset[];
  publicPresets: StylePreset[];
  systemPresets: StylePreset[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  saveCurrent: (input: {
    name: string;
    slots: PromptSlots;
    directorModifiers: DirectorModifiers;
    isPublic?: boolean;
    description?: string;
  }) => Promise<StylePreset | null>;
  incrementUsage: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useStylePresets(): UseStylePresetsResult {
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('motion_studio_style_presets')
        .select('*')
        .order('usage_count', { ascending: false })
        .order('created_at', { ascending: false });
      if (err) throw err;
      setPresets((data ?? []) as unknown as StylePreset[]);
    } catch (e: any) {
      console.error('[useStylePresets] load failed', e);
      setError(e?.message ?? 'Failed to load presets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveCurrent: UseStylePresetsResult['saveCurrent'] = async (input) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('Not signed in');

      const { data, error: err } = await supabase
        .from('motion_studio_style_presets')
        .insert({
          user_id: uid,
          name: input.name,
          description: input.description ?? null,
          slots: input.slots as any,
          director_modifiers: input.directorModifiers as any,
          is_public: input.isPublic ?? false,
        })
        .select()
        .single();
      if (err) throw err;
      const preset = data as unknown as StylePreset;
      setPresets((prev) => [preset, ...prev]);
      return preset;
    } catch (e: any) {
      console.error('[useStylePresets] save failed', e);
      setError(e?.message ?? 'Failed to save preset');
      return null;
    }
  };

  const incrementUsage = async (id: string) => {
    try {
      // Best-effort optimistic update; the user might not own it (public preset),
      // so we don't surface errors.
      const target = presets.find((p) => p.id === id);
      if (!target) return;
      setPresets((prev) =>
        prev.map((p) => (p.id === id ? { ...p, usage_count: p.usage_count + 1 } : p))
      );
      if (target.user_id) {
        await supabase
          .from('motion_studio_style_presets')
          .update({ usage_count: target.usage_count + 1 })
          .eq('id', id);
      }
    } catch (e) {
      console.warn('[useStylePresets] increment usage failed', e);
    }
  };

  const remove: UseStylePresetsResult['remove'] = async (id) => {
    try {
      const { error: err } = await supabase
        .from('motion_studio_style_presets')
        .delete()
        .eq('id', id);
      if (err) throw err;
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      console.error('[useStylePresets] delete failed', e);
      setError(e?.message ?? 'Failed to delete preset');
    }
  };

  const myPresets = presets.filter((p) => p.user_id !== null && !p.is_public);
  const publicPresets = presets.filter((p) => p.is_public && p.user_id !== null);
  const systemPresets = presets.filter((p) => p.user_id === null);

  return {
    presets,
    myPresets,
    publicPresets,
    systemPresets,
    loading,
    error,
    reload: load,
    saveCurrent,
    incrementUsage,
    remove,
  };
}
