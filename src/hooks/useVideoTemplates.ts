import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { VideoTemplate } from '@/types/video';

export const useVideoTemplates = (category?: string) => {
  return useQuery({
    queryKey: ['video-templates', category],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-video-templates', {
        body: category ? { category } : {}
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      return data.templates as VideoTemplate[];
    }
  });
};
