import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BrandCharacter {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  reference_image_url: string;
  storage_path: string | null;
  visual_identity_json: any;
  usage_count: number;
  is_favorite: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Avatar Library extensions
  default_voice_id: string | null;
  default_voice_provider: 'elevenlabs' | 'custom' | null;
  default_voice_name: string | null;
  portrait_url: string | null;
  portrait_mode: 'original' | 'auto_generated' | 'manual_upload' | null;
  default_language: string | null;
  default_aspect_ratio: string | null;
}

/** Friendly alias — the new public-facing name. */
export type Avatar = BrandCharacter;

export const useBrandCharacters = () => {
  const queryClient = useQueryClient();

  const charactersQuery = useQuery({
    queryKey: ['brand-characters'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_characters')
        .select('*')
        .is('archived_at', null)
        .order('is_favorite', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as BrandCharacter[];
    },
    staleTime: 30_000,
  });

  const createCharacter = useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      file: File;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1) Upload image to brand-characters bucket
      const ext = input.file.name.split('.').pop() || 'png';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('brand-characters')
        .upload(path, input.file, { contentType: input.file.type, upsert: false });
      if (upErr) throw upErr;

      // 2) Create signed URL for AI extraction
      const { data: signed } = await supabase.storage
        .from('brand-characters')
        .createSignedUrl(path, 60 * 10);
      const imageUrl = signed?.signedUrl;
      if (!imageUrl) throw new Error('Could not create signed URL');

      // 3) Extract identity via edge function
      let identity: any = {};
      try {
        const { data: extracted, error: exErr } = await supabase.functions.invoke(
          'extract-character-identity',
          { body: { image_url: imageUrl } }
        );
        if (!exErr && extracted?.identity) identity = extracted.identity;
      } catch (e) {
        console.warn('Identity extraction failed, continuing without it:', e);
      }

      // 4) Insert row
      const { data: row, error } = await supabase
        .from('brand_characters')
        .insert({
          user_id: user.id,
          name: input.name,
          description: input.description ?? null,
          reference_image_url: imageUrl,
          storage_path: path,
          visual_identity_json: identity,
        })
        .select()
        .single();
      if (error) throw error;
      return row as BrandCharacter;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-characters'] });
      toast.success('Brand Character saved');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save character'),
  });

  const toggleFavorite = useMutation({
    mutationFn: async (input: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase
        .from('brand_characters')
        .update({ is_favorite: input.is_favorite })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-characters'] }),
  });

  const archiveCharacter = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('brand_characters')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-characters'] });
      toast.success('Avatar archived');
    },
  });

  /**
   * Update avatar properties (voice, portrait, defaults).
   * Used by Avatar Library voice picker and portrait dialog.
   */
  const updateAvatar = useMutation({
    mutationFn: async (input: {
      id: string;
      default_voice_id?: string | null;
      default_voice_provider?: 'elevenlabs' | 'custom' | null;
      default_voice_name?: string | null;
      portrait_url?: string | null;
      portrait_mode?: 'original' | 'auto_generated' | 'manual_upload' | null;
      default_language?: string | null;
      default_aspect_ratio?: string | null;
      name?: string;
      description?: string | null;
    }) => {
      const { id, ...rest } = input;
      const { error } = await supabase
        .from('brand_characters')
        .update(rest)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-characters'] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update avatar'),
  });

  const trackUsage = async (input: {
    character_id: string;
    generation_id?: string;
    model_used?: string;
    module?: string;
  }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('brand_character_usage').insert({
      user_id: user.id,
      character_id: input.character_id,
      generation_id: input.generation_id ?? null,
      model_used: input.model_used ?? null,
      module: input.module ?? null,
    });
    // Increment counter
    const { data: current } = await supabase
      .from('brand_characters')
      .select('usage_count')
      .eq('id', input.character_id)
      .single();
    if (current) {
      await supabase
        .from('brand_characters')
        .update({ usage_count: (current.usage_count ?? 0) + 1 })
        .eq('id', input.character_id);
    }
  };

  return {
    characters: charactersQuery.data ?? [],
    avatars: charactersQuery.data ?? [],
    isLoading: charactersQuery.isLoading,
    createCharacter,
    toggleFavorite,
    archiveCharacter,
    updateAvatar,
    trackUsage,
  };
};

/** New public-facing alias — same hook, Avatar terminology. */
export const useAvatars = useBrandCharacters;

/**
 * True when this avatar is ready for one-click Talking-Head playback
 * (has a default voice AND a usable portrait or reference image).
 */
export const isPlayableAvatar = (a: BrandCharacter): boolean =>
  Boolean(a.default_voice_id && (a.portrait_url || a.reference_image_url));

/**
 * Helper to build a prompt-ready descriptor from a brand character.
 * Always returns ENGLISH (visual prompts must remain EN per Core rules).
 */
export const buildCharacterPromptInjection = (character: BrandCharacter): string => {
  const id = character.visual_identity_json || {};
  if (id.prompt_descriptor && typeof id.prompt_descriptor === 'string') {
    return id.prompt_descriptor;
  }
  // Fallback: assemble from structured fields
  const parts: string[] = [];
  if (id.gender_presentation && id.gender_presentation !== 'n/a') parts.push(id.gender_presentation);
  if (id.age_range && id.age_range !== 'n/a') parts.push(id.age_range.replace('_', ' '));
  if (id.ethnicity_or_style) parts.push(id.ethnicity_or_style);
  if (id.hair?.color || id.hair?.style) {
    parts.push(`with ${id.hair?.color ?? ''} ${id.hair?.style ?? ''} hair`.trim());
  }
  if (id.outfit?.top) parts.push(`wearing ${id.outfit.top}`);
  if (id.facial_features) parts.push(id.facial_features);
  const base = parts.filter(Boolean).join(', ');
  return base || character.description || character.name;
};
