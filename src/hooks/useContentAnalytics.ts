import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface VideoPerformance {
  video_id: string;
  title: string;
  template_name: string;
  views: number;
  engagement_rate: number;
  conversion_rate: number;
  avg_watch_time: number;
  created_at: string;
  thumbnail_url?: string;
}

export interface TemplateROI {
  template_id: string;
  template_name: string;
  total_videos: number;
  total_views: number;
  avg_engagement: number;
  total_cost: number;
  roi_score: number;
  revenue_generated?: number;
}

export interface CostAnalysis {
  total_render_cost: number;
  avg_cost_per_video: number;
  cost_by_template: Array<{
    template_name: string;
    total_cost: number;
    video_count: number;
  }>;
  cost_trend: Array<{
    date: string;
    cost: number;
  }>;
}

export interface EngineComparison {
  remotion: {
    total_renders: number;
    avg_render_time: number;
    success_rate: number;
    total_cost: number;
  };
  shotstack: {
    total_renders: number;
    avg_render_time: number;
    success_rate: number;
    total_cost: number;
  };
}

export interface AnalyticsData {
  videoPerformance: VideoPerformance[];
  templateROI: TemplateROI[];
  costAnalysis: CostAnalysis;
  engineComparison: EngineComparison;
}

export function useContentAnalytics(dateRange?: { start: string; end: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // Fetch video performance
      let videoQuery = supabase
        .from('content_projects')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (dateRange) {
        videoQuery = videoQuery
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end);
      }

      const { data: videos } = await videoQuery;

      // Fetch templates separately
      const { data: templates } = await supabase
        .from('video_templates')
        .select('id, name');

      const templateMap = new Map(templates?.map(t => [t.id, t.name]) || []);

      // Transform to performance metrics
      const videoPerformance: VideoPerformance[] = (videos || []).map(v => ({
        video_id: v.id,
        title: v.project_name || 'Untitled',
        template_name: templateMap.get(v.template_id || '') || 'Unknown',
        views: Math.floor(Math.random() * 10000), // Mock data
        engagement_rate: Math.random() * 15,
        conversion_rate: Math.random() * 5,
        avg_watch_time: Math.random() * 100,
        created_at: v.created_at,
        thumbnail_url: undefined
      }));

      // Aggregate template ROI
      const templateROIMap = new Map<string, {
        name: string;
        videos: number;
        views: number;
        engagement: number;
        cost: number;
      }>();

      videos?.forEach(v => {
        const templateId = v.template_id || 'unknown';
        const templateName = templateMap.get(templateId) || 'Unknown';
        const existing = templateROIMap.get(templateId) || {
          name: templateName,
          videos: 0,
          views: 0,
          engagement: 0,
          cost: 0
        };

        existing.videos++;
        existing.views += Math.floor(Math.random() * 10000);
        existing.engagement += Math.random() * 15;
        existing.cost += 0.05; // Mock cost per render

        templateROIMap.set(templateId, existing);
      });

      const templateROI: TemplateROI[] = Array.from(templateROIMap.entries()).map(([id, data]) => ({
        template_id: id,
        template_name: data.name,
        total_videos: data.videos,
        total_views: data.views,
        avg_engagement: data.engagement / data.videos,
        total_cost: data.cost,
        roi_score: (data.views * 0.001) / data.cost, // Simple ROI calculation
        revenue_generated: data.views * 0.001
      }));

      // Cost analysis
      const totalCost = templateROI.reduce((sum, t) => sum + t.total_cost, 0);
      const costAnalysis: CostAnalysis = {
        total_render_cost: totalCost,
        avg_cost_per_video: totalCost / (videos?.length || 1),
        cost_by_template: templateROI.map(t => ({
          template_name: t.template_name,
          total_cost: t.total_cost,
          video_count: t.total_videos
        })),
        cost_trend: Array.from({ length: 30 }, (_, i) => ({
          date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          cost: Math.random() * 2
        }))
      };

      // Engine comparison (mock data based on render_engine field)
      const remotionVideos = videos?.filter(v => v.render_engine === 'remotion') || [];
      const shotstackVideos = videos?.filter(v => v.render_engine === 'shotstack') || [];

      const engineComparison: EngineComparison = {
        remotion: {
          total_renders: remotionVideos.length,
          avg_render_time: 45,
          success_rate: 98.5,
          total_cost: remotionVideos.length * 0.05
        },
        shotstack: {
          total_renders: shotstackVideos.length,
          avg_render_time: 32,
          success_rate: 99.2,
          total_cost: shotstackVideos.length * 0.03
        }
      };

      setData({
        videoPerformance,
        templateROI: templateROI.sort((a, b) => b.roi_score - a.roi_score),
        costAnalysis,
        engineComparison
      });
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      toast({
        title: 'Fehler beim Laden',
        description: 'Analytics konnten nicht geladen werden',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange?.start, dateRange?.end]);

  return {
    data,
    loading,
    refetch: fetchAnalytics
  };
}
