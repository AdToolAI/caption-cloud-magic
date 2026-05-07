import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BrandLocation {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  reference_image_url: string;
  storage_path: string | null;
  visual_identity_json: any;
  tags: string[];
  usage_count: number;
  is_favorite: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export const useBrandLocations = () => {
  const queryClient = useQueryClient();

  const locationsQuery = useQuery({
    queryKey: ['brand-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_locations' as any)
        .select('*')
        .is('archived_at', null)
        .order('is_favorite', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return ((data as any[]) || []) as BrandLocation[];
    },
    staleTime: 30_000,
  });

  const createLocation = useMutation({
    mutationFn: async (input: { name: string; description?: string; file: File; tags?: string[] }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const ext = input.file.name.split('.').pop() || 'png';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('brand-locations')
        .upload(path, input.file, { contentType: input.file.type, upsert: false });
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from('brand-locations')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const imageUrl = signed?.signedUrl;
      if (!imageUrl) throw new Error('Could not create signed URL');

      let identity: any = {};
      try {
        const { data: extracted, error: exErr } = await supabase.functions.invoke(
          'extract-location-identity',
          { body: { image_url: imageUrl } }
        );
        if (!exErr && (extracted as any)?.identity) identity = (extracted as any).identity;
      } catch (e) {
        console.warn('Location identity extraction failed:', e);
      }

      const { data: row, error } = await supabase
        .from('brand_locations' as any)
        .insert({
          user_id: user.id,
          name: input.name,
          description: input.description ?? null,
          reference_image_url: imageUrl,
          storage_path: path,
          visual_identity_json: identity,
          tags: input.tags ?? [],
        })
        .select()
        .single();
      if (error) throw error;
      return row as unknown as BrandLocation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-locations'] });
      toast.success('Location saved');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save location'),
  });

  const toggleFavorite = useMutation({
    mutationFn: async (input: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase
        .from('brand_locations' as any)
        .update({ is_favorite: input.is_favorite })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-locations'] }),
  });

  const archiveLocation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('brand_locations' as any)
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-locations'] });
      toast.success('Location archived');
    },
  });

  return {
    locations: locationsQuery.data ?? [],
    isLoading: locationsQuery.isLoading,
    createLocation,
    toggleFavorite,
    archiveLocation,
  };
};

/** Always English (visual prompts must remain EN per Core rules). */
export const buildLocationPromptInjection = (loc: BrandLocation): string => {
  const id = loc.visual_identity_json || {};
  if (id.prompt_descriptor && typeof id.prompt_descriptor === 'string') {
    return id.prompt_descriptor;
  }
  const parts: string[] = [];
  if (id.setting) parts.push(`set in a ${id.setting}`);
  if (id.time_of_day && id.time_of_day !== 'n/a') parts.push(`during ${id.time_of_day.replace('_', ' ')}`);
  if (id.atmosphere) parts.push(id.atmosphere);
  if (id.lighting) parts.push(id.lighting);
  return parts.filter(Boolean).join(', ') || loc.description || `at ${loc.name}`;
};

export const useAccessibleLocations = useBrandLocations;
