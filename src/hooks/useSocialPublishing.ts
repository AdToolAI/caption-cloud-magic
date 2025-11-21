import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type Platform = 'instagram' | 'tiktok' | 'linkedin' | 'youtube';

export interface PublishConfig {
  platform: Platform;
  videoUrl: string;
  caption?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  aspectRatio?: string;
  privacyLevel?: 'PUBLIC' | 'PRIVATE' | 'FRIENDS' | 'CONNECTIONS' | 'public' | 'private' | 'unlisted';
  tags?: string[];
}

export interface PublishResult {
  success: boolean;
  postId?: string;
  url?: string;
  message?: string;
  error?: string;
}

export function useSocialPublishing() {
  const [publishing, setPublishing] = useState<Record<Platform, boolean>>({
    instagram: false,
    tiktok: false,
    linkedin: false,
    youtube: false
  });
  const { toast } = useToast();

  const publishToInstagram = async (config: Omit<PublishConfig, 'platform'>): Promise<PublishResult> => {
    setPublishing(prev => ({ ...prev, instagram: true }));
    
    try {
      const { data, error } = await supabase.functions.invoke('publish-to-instagram', {
        body: {
          videoUrl: config.videoUrl,
          caption: config.caption || '',
          hashtags: config.hashtags,
          aspectRatio: config.aspectRatio
        }
      });

      if (error) throw error;

      toast({
        title: '📸 Instagram veröffentlicht',
        description: data.message
      });

      return data;
    } catch (error) {
      console.error('Instagram publish error:', error);
      toast({
        title: 'Instagram Fehler',
        description: error.message,
        variant: 'destructive'
      });
      return { success: false, error: error.message };
    } finally {
      setPublishing(prev => ({ ...prev, instagram: false }));
    }
  };

  const publishToTikTok = async (config: Omit<PublishConfig, 'platform'>): Promise<PublishResult> => {
    setPublishing(prev => ({ ...prev, tiktok: true }));
    
    try {
      const { data, error } = await supabase.functions.invoke('publish-to-tiktok', {
        body: {
          videoUrl: config.videoUrl,
          caption: config.caption || '',
          hashtags: config.hashtags,
          privacyLevel: config.privacyLevel || 'PUBLIC'
        }
      });

      if (error) throw error;

      toast({
        title: '🎵 TikTok veröffentlicht',
        description: data.message
      });

      return data;
    } catch (error) {
      console.error('TikTok publish error:', error);
      toast({
        title: 'TikTok Fehler',
        description: error.message,
        variant: 'destructive'
      });
      return { success: false, error: error.message };
    } finally {
      setPublishing(prev => ({ ...prev, tiktok: false }));
    }
  };

  const publishToLinkedIn = async (config: Omit<PublishConfig, 'platform'>): Promise<PublishResult> => {
    setPublishing(prev => ({ ...prev, linkedin: true }));
    
    try {
      const { data, error } = await supabase.functions.invoke('publish-to-linkedin', {
        body: {
          videoUrl: config.videoUrl,
          caption: config.caption || '',
          visibility: config.privacyLevel || 'PUBLIC'
        }
      });

      if (error) throw error;

      toast({
        title: '💼 LinkedIn veröffentlicht',
        description: data.message
      });

      return data;
    } catch (error) {
      console.error('LinkedIn publish error:', error);
      toast({
        title: 'LinkedIn Fehler',
        description: error.message,
        variant: 'destructive'
      });
      return { success: false, error: error.message };
    } finally {
      setPublishing(prev => ({ ...prev, linkedin: false }));
    }
  };

  const publishToYouTube = async (config: Omit<PublishConfig, 'platform'>): Promise<PublishResult> => {
    setPublishing(prev => ({ ...prev, youtube: true }));
    
    try {
      const { data, error } = await supabase.functions.invoke('publish-to-youtube', {
        body: {
          videoUrl: config.videoUrl,
          title: config.title || config.caption?.substring(0, 100) || 'Video',
          description: config.description || config.caption || '',
          tags: config.tags || config.hashtags,
          privacyStatus: config.privacyLevel || 'public'
        }
      });

      if (error) throw error;

      toast({
        title: '📺 YouTube veröffentlicht',
        description: data.message
      });

      return data;
    } catch (error) {
      console.error('YouTube publish error:', error);
      toast({
        title: 'YouTube Fehler',
        description: error.message,
        variant: 'destructive'
      });
      return { success: false, error: error.message };
    } finally {
      setPublishing(prev => ({ ...prev, youtube: false }));
    }
  };

  const publishToMultiplePlatforms = async (
    config: Omit<PublishConfig, 'platform'>,
    platforms: Platform[]
  ): Promise<Record<Platform, PublishResult>> => {
    const results: Partial<Record<Platform, PublishResult>> = {};

    const publishPromises = platforms.map(async (platform) => {
      let result: PublishResult;
      
      switch (platform) {
        case 'instagram':
          result = await publishToInstagram(config);
          break;
        case 'tiktok':
          result = await publishToTikTok(config);
          break;
        case 'linkedin':
          result = await publishToLinkedIn(config);
          break;
        case 'youtube':
          result = await publishToYouTube(config);
          break;
        default:
          result = { success: false, error: 'Unknown platform' };
      }

      results[platform] = result;
    });

    await Promise.all(publishPromises);

    return results as Record<Platform, PublishResult>;
  };

  return {
    publishing,
    publishToInstagram,
    publishToTikTok,
    publishToLinkedIn,
    publishToYouTube,
    publishToMultiplePlatforms
  };
}
