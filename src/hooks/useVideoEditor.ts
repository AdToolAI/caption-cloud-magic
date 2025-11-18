import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface EditVideoParams {
  originalVideoId: string;
  customizations: Record<string, string | number | boolean>;
}

export const useVideoEditor = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const editVideo = async ({ originalVideoId, customizations }: EditVideoParams) => {
    setLoading(true);
    try {
      // Get original video to extract template_id and version info
      const { data: originalVideo, error: fetchError } = await supabase
        .from('video_creations')
        .select('template_id, version_number, parent_video_id')
        .eq('id', originalVideoId)
        .single();

      if (fetchError) throw fetchError;

      // Determine parent and version number
      const parentId = originalVideo.parent_video_id || originalVideoId;
      const newVersionNumber = originalVideo.version_number + 1;

      // Call edge function to create edited version
      const { data, error } = await supabase.functions.invoke('create-video-from-template', {
        body: {
          template_id: originalVideo.template_id,
          customizations,
          parent_video_id: parentId,
          version_number: newVersionNumber
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
        title: 'Neue Version wird erstellt',
        description: `Version ${newVersionNumber} wird jetzt gerendert. Das dauert einige Minuten.`
      });

      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['video-history'] });

      return {
        creation_id: data.creation_id,
        version_number: newVersionNumber
      };
    } catch (error) {
      console.error('Video edit error:', error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Video konnte nicht bearbeitet werden',
        variant: 'destructive'
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    editVideo,
    loading
  };
};
