import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PresetAvatar {
  id: string;
  name: string;
  role_label: string;
  gender: 'female' | 'male' | 'neutral';
  description: string | null;
  portrait_url: string | null;
  reference_image_url: string | null;
  default_voice_id: string | null;
  sort_order: number;
}

export const usePresetAvatars = () => {
  const queryClient = useQueryClient();

  const { data: presets = [], isLoading } = useQuery({
    queryKey: ['preset-avatars'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_preset_avatars')
        .select('id, name, role_label, gender, description, portrait_url, reference_image_url, default_voice_id, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PresetAvatar[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const clonePreset = useMutation({
    mutationFn: async (preset_id: string) => {
      const { data, error } = await supabase.functions.invoke('clone-preset-avatar', {
        body: { preset_id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Clone failed');
      return data.character;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-characters'] });
      toast.success('Avatar added to your library');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to add avatar'),
  });

  return { presets, isLoading, clonePreset };
};
