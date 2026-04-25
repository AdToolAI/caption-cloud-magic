import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MotionStudioTemplate } from '@/types/motion-studio-templates';

interface TemplateFilters {
  useCase?: string;
  style?: string;
  aspectRatio?: string;
}

export function useMotionStudioTemplates(filters: TemplateFilters = {}) {
  return useQuery({
    queryKey: ['motion-studio-templates', filters],
    queryFn: async () => {
      let query = supabase
        .from('motion_studio_templates' as any)
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (filters.useCase) query = query.eq('use_case', filters.useCase);
      if (filters.style) query = query.eq('style', filters.style);
      if (filters.aspectRatio) query = query.eq('aspect_ratio', filters.aspectRatio);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as MotionStudioTemplate[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useIncrementTemplateUsage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      // Fetch current then increment (RLS-safe; small list, infrequent)
      const { data: current } = await supabase
        .from('motion_studio_templates' as any)
        .select('usage_count')
        .eq('id', templateId)
        .maybeSingle();
      const next = ((current as any)?.usage_count ?? 0) + 1;
      await supabase
        .from('motion_studio_templates' as any)
        .update({ usage_count: next } as any)
        .eq('id', templateId);
      return next;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['motion-studio-templates'] });
    },
  });
}
