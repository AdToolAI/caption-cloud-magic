import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RemotionTemplate {
  id: string;
  component_name: string;
  content_type: string;
  duration_frames: number;
  fps: number;
  width: number;
  height: number;
  default_props: Record<string, any>;
  customizable_fields: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
  }>;
  preview_url: string | null;
  is_active: boolean;
}

export const useRemotionTemplates = (contentType?: string) => {
  return useQuery({
    queryKey: ['remotion-templates', contentType],
    queryFn: async () => {
      let query = supabase
        .from('remotion_templates')
        .select('*')
        .eq('is_active', true);

      if (contentType) {
        query = query.eq('content_type', contentType);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      return (data || []).map(template => ({
        ...template,
        default_props: template.default_props as Record<string, any>,
        customizable_fields: template.customizable_fields as Array<{
          key: string;
          label: string;
          type: string;
          required: boolean;
        }>,
      })) as RemotionTemplate[];
    },
  });
};
