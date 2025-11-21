import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type Platform = 'instagram' | 'tiktok' | 'linkedin' | 'youtube';

export interface SchedulePublishConfig {
  platform: Platform;
  videoUrl: string;
  caption?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  publishAt: Date;
  eventId?: string;
}

export interface ScheduledPublication {
  id: string;
  platform: Platform;
  video_url: string;
  caption?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  publish_at: string;
  status: 'pending' | 'published' | 'failed' | 'cancelled';
  result_data?: any;
  error_message?: string;
  retry_count: number;
}

export function useScheduledPublishing() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const schedulePublication = async (config: SchedulePublishConfig): Promise<boolean> => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('scheduled_publications')
        .insert({
          user_id: user.id,
          event_id: config.eventId,
          platform: config.platform,
          video_url: config.videoUrl,
          caption: config.caption,
          title: config.title,
          description: config.description,
          hashtags: config.hashtags,
          publish_at: config.publishAt.toISOString(),
          status: 'pending',
        });

      if (error) throw error;

      toast({
        title: '⏰ Veröffentlichung geplant',
        description: `Post wird am ${config.publishAt.toLocaleString('de-DE')} auf ${config.platform} veröffentlicht`,
      });

      return true;
    } catch (error: any) {
      console.error('Schedule publication error:', error);
      toast({
        title: 'Fehler beim Planen',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getScheduledPublications = async (): Promise<ScheduledPublication[]> => {
    try {
      const { data, error } = await supabase
        .from('scheduled_publications')
        .select('*')
        .order('publish_at', { ascending: true });

      if (error) throw error;
      return (data || []) as ScheduledPublication[];
    } catch (error) {
      console.error('Error fetching scheduled publications:', error);
      return [];
    }
  };

  const cancelScheduledPublication = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('scheduled_publications')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: '🚫 Veröffentlichung abgebrochen',
        description: 'Die geplante Veröffentlichung wurde storniert',
      });

      return true;
    } catch (error: any) {
      console.error('Cancel publication error:', error);
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    loading,
    schedulePublication,
    getScheduledPublications,
    cancelScheduledPublication,
  };
}
