import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useCalendarVideos() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fetch render queue
  const { data: renderQueue, isLoading: queueLoading } = useQuery({
    queryKey: ['calendar-render-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_render_queue')
        .select('*, calendar_events(title)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
  });

  // Link video to event
  const linkVideoToEvent = async (event_id: string, video_project_id: string, auto_render: boolean = false) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('calendar_events')
        .update({
          video_project_id,
          auto_render
        })
        .eq('id', event_id);

      if (error) throw error;

      toast({
        title: '✅ Video verknüpft',
        description: 'Video wurde mit Event verbunden',
      });

      return true;
    } catch (error: any) {
      console.error('Link video error:', error);
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Queue render
  const queueRender = async (event_id: string, project_id: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('calendar_render_queue')
        .insert({
          event_id,
          project_id,
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: '🎬 Rendering gestartet',
        description: 'Video wird gerendert',
      });

      return true;
    } catch (error: any) {
      console.error('Queue render error:', error);
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    renderQueue: renderQueue || [],
    loading: queueLoading || loading,
    linkVideoToEvent,
    queueRender,
  };
}
