import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { VideoCreation } from '@/types/video';

export const useVideoHistory = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: videos, isLoading, error } = useQuery({
    queryKey: ['video-history'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[useVideoHistory] No user found');
        throw new Error('Not authenticated');
      }

      console.log('[useVideoHistory] Loading videos for user', user.id);

      const { data, error } = await supabase
        .from('video_creations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useVideoHistory] Error loading videos', error);
        throw error;
      }

      console.log('[useVideoHistory] Loaded videos count:', data?.length ?? 0);
      return data as any[];
    }
  });

  const deleteVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      const { error } = await supabase
        .from('video_creations')
        .delete()
        .eq('id', videoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-history'] });
      toast({ title: 'Video gelöscht' });
    },
    onError: (error) => {
      toast({
        title: 'Fehler beim Löschen',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive'
      });
    }
  });

  const trackDownload = useMutation({
    mutationFn: async (videoId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get current video
      const { data: video } = await supabase
        .from('video_creations')
        .select('download_count')
        .eq('id', videoId)
        .single();

      // Increment download count
      if (video) {
        await supabase
          .from('video_creations')
          .update({ download_count: (video.download_count || 0) + 1 })
          .eq('id', videoId);
      }

      // Track analytics
      await supabase
        .from('video_analytics')
        .insert({
          creation_id: videoId,
          user_id: user.id,
          event_type: 'video.downloaded',
          metadata: { timestamp: new Date().toISOString() }
        });
    }
  });

  const trackShare = useMutation({
    mutationFn: async ({ videoId, platform, shareUrl }: { videoId: string; platform: string; shareUrl?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get current video
      const { data: video } = await supabase
        .from('video_creations')
        .select('share_count')
        .eq('id', videoId)
        .single();

      // Increment share count
      if (video) {
        await supabase
          .from('video_creations')
          .update({ share_count: (video.share_count || 0) + 1 })
          .eq('id', videoId);
      }

      // Create share record
      await supabase
        .from('video_shares')
        .insert({
          creation_id: videoId,
          user_id: user.id,
          platform,
          share_url: shareUrl
        });

      // Track analytics
      await supabase
        .from('video_analytics')
        .insert({
          creation_id: videoId,
          user_id: user.id,
          event_type: 'video.shared',
          metadata: { platform, timestamp: new Date().toISOString() }
        });
    }
  });

  return {
    videos: videos || [],
    isLoading,
    error,
    deleteVideo: deleteVideoMutation.mutate,
    trackDownload: trackDownload.mutate,
    trackShare: trackShare.mutate,
    isDeletingVideo: deleteVideoMutation.isPending
  };
};
