import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

let sessionId: string | null = null;

export function useUserBehavior() {
  const { user } = useAuth();
  const trackedEvents = useRef(new Set<string>());

  useEffect(() => {
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }, []);

  const trackEvent = async (
    event_type: string,
    event_data?: Record<string, any>,
    template_id?: string,
    content_type?: string
  ) => {
    if (!user) return;

    // Avoid duplicate tracking within same session
    const eventKey = `${event_type}_${template_id || ''}_${Date.now()}`;
    if (trackedEvents.current.has(eventKey)) return;

    trackedEvents.current.add(eventKey);

    // Clean up old tracked events after 5 seconds
    setTimeout(() => {
      trackedEvents.current.delete(eventKey);
    }, 5000);

    try {
      // Fire and forget - don't wait for response
      supabase.functions.invoke('track-user-behavior', {
        body: {
          event_type,
          event_data,
          template_id,
          content_type,
          session_id: sessionId,
        },
      }).catch(err => {
        console.debug('Failed to track event:', err);
      });
    } catch (error) {
      // Silent fail - tracking should never block user
      console.debug('Failed to track event:', error);
    }
  };

  const trackTemplateView = (template_id: string, template_name: string) => {
    trackEvent('template_view', { template_name }, template_id);
  };

  const trackTemplateSelect = (template_id: string, template_name: string) => {
    trackEvent('template_select', { template_name }, template_id);
  };

  const trackProjectCreate = (content_type: string, template_id?: string) => {
    trackEvent('project_create', {}, template_id, content_type);
  };

  const trackPublish = (platform: string, content_type: string) => {
    trackEvent('publish', { platform }, undefined, content_type);
  };

  const getPersonalizedRecommendations = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-personalized-recommendations');
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      return null;
    }
  };

  return {
    trackEvent,
    trackTemplateView,
    trackTemplateSelect,
    trackProjectCreate,
    trackPublish,
    getPersonalizedRecommendations,
  };
}
