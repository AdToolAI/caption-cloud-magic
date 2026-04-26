import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MotionStudioTemplate, TemplateSceneSuggestion } from '@/types/motion-studio-templates';
import type { ComposerCategory, AspectRatio } from '@/types/video-composer';

export interface TrendingTemplate {
  id: string;
  source_project_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  scene_count: number;
  total_duration_sec: number;
  performance_score: number;
  views_count: number;
  completion_rate: number;
  shares_count: number;
  thumbnail_url: string | null;
  preview_video_url: string | null;
  structure_json: {
    aspect_ratio?: AspectRatio;
    briefing_defaults?: Record<string, unknown>;
    scenes?: TemplateSceneSuggestion[];
    [k: string]: unknown;
  };
  tags: string[];
  is_public: boolean;
  is_featured: boolean;
  use_count: number;
  aggregation_window_start: string | null;
  aggregation_window_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrendingFilters {
  category?: string;
  featuredOnly?: boolean;
  limit?: number;
}

export function useTrendingTemplates(filters: TrendingFilters = {}) {
  return useQuery({
    queryKey: ['trending-templates', filters],
    queryFn: async () => {
      let query = supabase
        .from('composer_template_suggestions' as any)
        .select('*')
        .eq('is_public', true)
        .order('performance_score', { ascending: false })
        .limit(filters.limit ?? 30);

      if (filters.category) query = query.eq('category', filters.category);
      if (filters.featuredOnly) query = query.eq('is_featured', true);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as TrendingTemplate[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useIncrementTrendingUse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await supabase.rpc(
        'increment_trending_template_use' as any,
        { p_template_id: templateId } as any
      );
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trending-templates'] });
    },
  });
}

/**
 * Adapter: Convert a TrendingTemplate into a MotionStudioTemplate-shaped
 * object so it can flow through the same `applyTemplate` pipeline.
 */
export function trendingToMotionStudioTemplate(t: TrendingTemplate): MotionStudioTemplate {
  const structure = t.structure_json ?? {};
  const scenes = Array.isArray(structure.scenes) ? structure.scenes : [];
  const aspectRatio = (structure.aspect_ratio ?? '9:16') as AspectRatio;

  return {
    id: `trending-${t.id}`,
    workspace_id: null,
    name: t.title,
    description: t.description ?? '',
    use_case: 'product_launch',
    style: 'cinematic',
    category: (t.category ?? 'product-ad') as ComposerCategory,
    aspect_ratio: aspectRatio,
    duration_seconds: Math.round(t.total_duration_sec ?? 0),
    thumbnail_url: t.thumbnail_url,
    preview_video_url: t.preview_video_url,
    briefing_defaults: (structure.briefing_defaults ?? {}) as MotionStudioTemplate['briefing_defaults'],
    scene_suggestions: scenes,
    tags: t.tags ?? [],
    sort_order: 0,
    is_active: true,
    is_featured: t.is_featured,
    usage_count: t.use_count,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}
