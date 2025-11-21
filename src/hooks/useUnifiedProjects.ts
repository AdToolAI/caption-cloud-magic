import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ContentProject } from '@/types/content-studio';

export interface UnifiedProject {
  id: string;
  project_name: string;
  content_type: 'ad' | 'story' | 'reel' | 'tutorial' | 'testimonial' | 'news';
  status: 'draft' | 'rendering' | 'completed' | 'failed';
  output_urls: Record<string, string>;
  created_at: string;
  source: 'content_studio' | 'video_manager';
  render_id?: string | null;
  credits_used?: number;
  template_id?: string | null;
}

export const useUnifiedProjects = (contentTypeFilter?: string) => {
  return useQuery({
    queryKey: ['unified-projects', contentTypeFilter],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Fetch Content Studio Projects
      let contentQuery = supabase
        .from('content_projects')
        .select('*')
        .eq('user_id', user.id);
      
      if (contentTypeFilter && contentTypeFilter !== 'all') {
        contentQuery = contentQuery.eq('content_type', contentTypeFilter);
      }

      const { data: contentProjects } = await contentQuery;

      // 2. Fetch Legacy Video Creations
      const { data: videoCreations } = await supabase
        .from('video_creations')
        .select('*')
        .eq('user_id', user.id);

      // 3. Normalize Content Studio projects
      const normalizedContent: UnifiedProject[] = (contentProjects || []).map((p: any) => ({
        id: p.id,
        project_name: p.project_name,
        content_type: p.content_type,
        status: p.status,
        output_urls: p.output_urls || {},
        created_at: p.created_at,
        source: 'content_studio' as const,
        render_id: p.render_id,
        credits_used: p.credits_used,
        template_id: p.template_id
      }));

      // 4. Normalize Legacy Video Creations
      const normalizedLegacy: UnifiedProject[] = (videoCreations || []).map((v: any) => ({
        id: v.id,
        project_name: v.template_id ? `Video ${v.id.slice(0, 8)}` : 'Untitled Video',
        content_type: 'ad' as const, // Legacy videos are all ads
        status: v.status,
        output_urls: v.output_url ? { default: v.output_url } : {},
        created_at: v.created_at,
        source: 'video_manager' as const,
        render_id: v.render_id,
        template_id: v.template_id
      }));

      // 5. Combine & sort by created_at (newest first)
      const allProjects = [...normalizedContent, ...normalizedLegacy]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // 6. Apply content type filter for legacy videos
      if (contentTypeFilter && contentTypeFilter !== 'all') {
        return allProjects.filter(p => p.content_type === contentTypeFilter);
      }

      return allProjects;
    }
  });
};
