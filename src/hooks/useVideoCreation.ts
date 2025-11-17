import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { VideoCreation } from '@/types/video';

export const useVideoCreation = () => {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const { toast } = useToast();

  const createVideo = async (
    templateId: string,
    customizations: Record<string, string | number>
  ): Promise<{ creation_id: string; render_id: string } | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-video-from-template', {
        body: {
          template_id: templateId,
          customizations
        }
      });

      if (error) throw error;

      if (!data.ok) {
        if (data.error === 'INSUFFICIENT_CREDITS') {
          toast({
            title: 'Nicht genügend Credits',
            description: data.message,
            variant: 'destructive'
          });
          return null;
        }
        throw new Error(data.error);
      }

      toast({
        title: 'Video-Rendering gestartet',
        description: 'Dein Video wird erstellt. Das dauert ca. 30-60 Sekunden.'
      });

      return {
        creation_id: data.creation_id,
        render_id: data.render_id
      };
    } catch (error) {
      console.error('Video creation error:', error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Video konnte nicht erstellt werden',
        variant: 'destructive'
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async (creationId: string): Promise<VideoCreation | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('check-video-status', {
        body: { creation_id: creationId }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      return {
        id: creationId,
        status: data.status,
        output_url: data.output_url,
        error_message: data.error_message
      } as VideoCreation;
    } catch (error) {
      console.error('Status check error:', error);
      return null;
    }
  };

  const pollStatus = async (
    creationId: string,
    onComplete: (outputUrl: string) => void,
    onError?: (error: string) => void
  ) => {
    setPolling(true);
    const maxAttempts = 40; // 40 * 3 = 120 seconds max
    let attempts = 0;

    const poll = async () => {
      const result = await checkStatus(creationId);
      
      if (!result) {
        setPolling(false);
        onError?.('Fehler beim Status-Check');
        return;
      }

      if (result.status === 'completed' && result.output_url) {
        setPolling(false);
        toast({
          title: 'Video fertig!',
          description: 'Dein Werbevideo wurde erfolgreich erstellt.'
        });
        onComplete(result.output_url);
        return;
      }

      if (result.status === 'failed') {
        setPolling(false);
        toast({
          title: 'Video-Rendering fehlgeschlagen',
          description: result.error_message || 'Ein Fehler ist aufgetreten',
          variant: 'destructive'
        });
        onError?.(result.error_message || 'Unknown error');
        return;
      }

      attempts++;
      if (attempts >= maxAttempts) {
        setPolling(false);
        toast({
          title: 'Timeout',
          description: 'Video-Rendering dauert länger als erwartet. Bitte später erneut prüfen.',
          variant: 'destructive'
        });
        return;
      }

      // Poll every 3 seconds
      setTimeout(poll, 3000);
    };

    poll();
  };

  return {
    createVideo,
    checkStatus,
    pollStatus,
    loading,
    polling
  };
};
