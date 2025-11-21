import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TemplatePerformanceSummary {
  template_id: string;
  total_views: number;
  total_selections: number;
  total_projects: number;
  total_publishes: number;
  avg_rating: number;
  total_ratings: number;
  selection_rate: number;
  conversion_rate: number;
  publish_rate: number;
}

export interface ConversionFunnel {
  total_views: number;
  total_selections: number;
  total_creates: number;
  total_publishes: number;
  selection_rate: number;
  create_rate: number;
  publish_rate: number;
}

export interface DailyMetric {
  date: string;
  total_views: number;
  total_selections: number;
  projects_created: number;
  projects_published: number;
  avg_rating_in_period: number;
  ratings_submitted: number;
}

export interface TemplateAnalytics {
  summary: TemplatePerformanceSummary | null;
  conversion: ConversionFunnel | null;
  daily_metrics: DailyMetric[];
  active_tests: any[];
}

export function useTemplateAnalytics(
  templateId: string | null,
  options?: {
    days?: number;
    dateFrom?: string;
    dateTo?: string;
  }
) {
  const [data, setData] = useState<TemplateAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) {
      setLoading(false);
      return;
    }

    fetchAnalytics();
  }, [templateId, options?.days, options?.dateFrom, options?.dateTo]);

  const fetchAnalytics = async () => {
    if (!templateId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        template_id: templateId,
        days: (options?.days || 30).toString(),
      });

      if (options?.dateFrom && options?.dateTo) {
        params.append('date_from', options.dateFrom);
        params.append('date_to', options.dateTo);
      }

      const { data: analytics, error: analyticsError } = await supabase.functions.invoke(
        'get-template-analytics',
        {
          body: params,
        }
      );

      if (analyticsError) throw analyticsError;

      setData(analytics);
    } catch (err) {
      console.error('Error fetching template analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  };

  const trackEvent = async (
    eventType: 'viewed' | 'selected' | 'created' | 'published',
    metadata?: Record<string, any>
  ) => {
    if (!templateId) return;

    try {
      await supabase.functions.invoke('track-template-event', {
        body: {
          template_id: templateId,
          event_type: eventType,
          session_id: sessionStorage.getItem('template_session_id') || crypto.randomUUID(),
          metadata,
        },
      });

      // Store session ID for funnel tracking
      if (!sessionStorage.getItem('template_session_id')) {
        sessionStorage.setItem('template_session_id', crypto.randomUUID());
      }
    } catch (err) {
      console.error('Error tracking template event:', err);
    }
  };

  return {
    data,
    loading,
    error,
    refetch: fetchAnalytics,
    trackEvent,
  };
}
