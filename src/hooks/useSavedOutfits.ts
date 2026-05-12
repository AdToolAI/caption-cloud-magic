import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OutfitLook {
  id: string;
  avatar_id: string;
  name: string;
  theme_pack: string;
  outfit_id: string;
  cover_url: string;
  front_url: string | null;
  back_url: string | null;
  side_url: string | null;
  top_url: string | null;
  created_at: string;
}

export function useSavedOutfits(avatarId: string | undefined) {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['avatar-outfit-looks', avatarId],
    enabled: !!avatarId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('avatar_outfit_looks')
        .select('*')
        .eq('avatar_id', avatarId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OutfitLook[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('avatar_outfit_looks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['avatar-outfit-looks', avatarId] }),
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await (supabase as any)
        .from('avatar_outfit_looks').update({ name }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['avatar-outfit-looks', avatarId] }),
  });

  return { ...list, remove, rename };
}
