import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { injectUtmParams, toCampaignSlug, type UtmPlatform } from '@/lib/social/utmLayer';

export type Platform =
  | 'instagram'
  | 'instagram-story'
  | 'tiktok'
  | 'linkedin'
  | 'youtube';

export interface Chapter {
  timestamp: string; // "0:00"
  label: string;
}

export interface PublishConfig {
  platform: Platform;
  videoUrl: string;
  caption?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  aspectRatio?: string;
  durationSec?: number;
  privacyLevel?: 'PUBLIC' | 'PRIVATE' | 'FRIENDS' | 'CONNECTIONS' | 'public' | 'private' | 'unlisted';
  tags?: string[];
  // P2-Now Ausbauten
  coverUrl?: string; // Instagram Reels-Cover
  chapters?: Chapter[]; // YouTube Chapters
  firstComment?: string; // Instagram/LinkedIn Best-First-Comment
  utm?: {
    enabled: boolean; // Default: true
    campaign?: string;
    content?: string; // meist videoId
  };
}

export interface PublishResult {
  success: boolean;
  postId?: string;
  url?: string;
  message?: string;
  error?: string;
  firstCommentPosted?: boolean;
  firstCommentReason?: string;
}

const PLATFORM_UTM_MAP: Record<Platform, UtmPlatform> = {
  instagram: 'instagram',
  'instagram-story': 'instagram-story',
  tiktok: 'tiktok',
  linkedin: 'linkedin',
  youtube: 'youtube',
};

function applyUtm(text: string | undefined, platform: Platform, utm: PublishConfig['utm']): string {
  if (!text) return text ?? '';
  if (utm?.enabled === false) return text;
  const campaign = utm?.campaign ? toCampaignSlug(utm.campaign) : 'adtool-social';
  return injectUtmParams(text, PLATFORM_UTM_MAP[platform], {
    campaign,
    content: utm?.content,
  });
}

async function postFirstComment(platform: 'instagram' | 'linkedin', postId: string, comment: string) {
  try {
    const { data, error } = await supabase.functions.invoke('post-first-comment', {
      body: { platform, postId, comment },
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: Boolean(data?.success), reason: data?.reason };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown error' };
  }
}

export function useSocialPublishing() {
  const [publishing, setPublishing] = useState<Record<Platform, boolean>>({
    instagram: false,
    'instagram-story': false,
    tiktok: false,
    linkedin: false,
    youtube: false,
  });
  const { toast } = useToast();

  const setBusy = (p: Platform, v: boolean) => setPublishing((prev) => ({ ...prev, [p]: v }));

  const publishToInstagram = async (
    config: Omit<PublishConfig, 'platform'>,
    variant: 'REELS' | 'STORIES' = 'REELS',
  ): Promise<PublishResult> => {
    const platformKey: Platform = variant === 'STORIES' ? 'instagram-story' : 'instagram';
    setBusy(platformKey, true);
    try {
      const captionWithUtm = applyUtm(config.caption, platformKey, config.utm);
      const { data, error } = await supabase.functions.invoke('publish-to-instagram', {
        body: {
          videoUrl: config.videoUrl,
          caption: captionWithUtm || '',
          hashtags: config.hashtags,
          aspectRatio: config.aspectRatio,
          mediaType: variant,
          coverUrl: config.coverUrl,
        },
      });
      if (error) throw error;

      const result: PublishResult = { ...data };

      // First comment (only for feed posts, not for stories)
      if (variant === 'REELS' && config.firstComment?.trim() && data?.postId) {
        const commentWithUtm = applyUtm(config.firstComment, platformKey, config.utm);
        const fc = await postFirstComment('instagram', data.postId, commentWithUtm);
        result.firstCommentPosted = fc.ok;
        result.firstCommentReason = fc.reason;
      }

      toast({
        title: variant === 'STORIES' ? '📸 Instagram Story veröffentlicht' : '📸 Instagram veröffentlicht',
        description: data.message,
      });
      return result;
    } catch (error: any) {
      console.error('Instagram publish error:', error);
      toast({ title: 'Instagram Fehler', description: error?.message, variant: 'destructive' });
      return { success: false, error: error?.message };
    } finally {
      setBusy(platformKey, false);
    }
  };

  const publishToTikTok = async (config: Omit<PublishConfig, 'platform'>): Promise<PublishResult> => {
    setBusy('tiktok', true);
    try {
      const captionWithUtm = applyUtm(config.caption, 'tiktok', config.utm);
      const { data, error } = await supabase.functions.invoke('publish-to-tiktok', {
        body: {
          videoUrl: config.videoUrl,
          caption: captionWithUtm || '',
          hashtags: config.hashtags,
          privacyLevel: config.privacyLevel || 'PUBLIC',
        },
      });
      if (error) throw error;
      toast({ title: '🎵 TikTok veröffentlicht', description: data.message });
      return data;
    } catch (error: any) {
      console.error('TikTok publish error:', error);
      toast({ title: 'TikTok Fehler', description: error?.message, variant: 'destructive' });
      return { success: false, error: error?.message };
    } finally {
      setBusy('tiktok', false);
    }
  };

  const publishToLinkedIn = async (config: Omit<PublishConfig, 'platform'>): Promise<PublishResult> => {
    setBusy('linkedin', true);
    try {
      const captionWithUtm = applyUtm(config.caption, 'linkedin', config.utm);
      const { data, error } = await supabase.functions.invoke('publish-to-linkedin', {
        body: {
          videoUrl: config.videoUrl,
          caption: captionWithUtm || '',
          visibility: config.privacyLevel || 'PUBLIC',
        },
      });
      if (error) throw error;

      const result: PublishResult = { ...data };

      if (config.firstComment?.trim() && data?.postId) {
        const commentWithUtm = applyUtm(config.firstComment, 'linkedin', config.utm);
        const fc = await postFirstComment('linkedin', data.postId, commentWithUtm);
        result.firstCommentPosted = fc.ok;
        result.firstCommentReason = fc.reason;
      }

      toast({ title: '💼 LinkedIn veröffentlicht', description: data.message });
      return result;
    } catch (error: any) {
      console.error('LinkedIn publish error:', error);
      toast({ title: 'LinkedIn Fehler', description: error?.message, variant: 'destructive' });
      return { success: false, error: error?.message };
    } finally {
      setBusy('linkedin', false);
    }
  };

  const publishToYouTube = async (config: Omit<PublishConfig, 'platform'>): Promise<PublishResult> => {
    setBusy('youtube', true);
    try {
      const descWithUtm = applyUtm(config.description || config.caption, 'youtube', config.utm);
      const title = config.title || config.caption?.substring(0, 100) || 'Video';

      // Dateigröße bestmöglich ermitteln — der publish-Zweig lehnt Dateien < 1 KB ab.
      let size = 5 * 1024 * 1024;
      let mime = 'video/mp4';
      try {
        const head = await fetch(config.videoUrl, { method: 'HEAD' });
        const len = Number(head.headers.get('content-length'));
        if (Number.isFinite(len) && len > 0) size = len;
        const ct = head.headers.get('content-type');
        if (ct?.startsWith('video/')) mime = ct;
      } catch {
        /* HEAD nicht möglich (CORS) — Defaults bleiben */
      }

      const chapterBlock = (config.chapters ?? []).length >= 3
        ? '\n\n' + (config.chapters ?? []).map((c) => `${c.timestamp} ${c.label}`).join('\n')
        : '';

      const { data, error } = await supabase.functions.invoke('publish', {
        body: {
          text: `${descWithUtm}${chapterBlock}`.trim(),
          channels: ['youtube'],
          media: [{ type: 'video', path: config.videoUrl, mime, size }],
          youtubeConfig: {
            title,
            privacyStatus: (config.privacyLevel as string)?.toLowerCase() === 'private'
              ? 'private'
              : (config.privacyLevel as string)?.toLowerCase() === 'unlisted'
                ? 'unlisted'
                : 'public',
            madeForKids: false,
            categoryId: '22',
            tags: (config.tags || config.hashtags || []).map((tag) => tag.replace(/^#/, '')),
          },
        },
      });
      if (error) throw error;

      const ytResult = (data?.results ?? []).find((r: any) => r.provider === 'youtube') ?? data;

      if (!ytResult?.ok) {
        const message = ytResult?.error_message
          || tx({ de: 'YouTube-Veröffentlichung fehlgeschlagen. Bitte Verbindung unter Einstellungen → Verbindungen prüfen.', en: 'YouTube publishing failed. Please check connection under Settings → Connections.', es: 'La publicación en YouTube falló. Por favor, comprueba la conexión en Ajustes → Conexiones.' });
        toast({ title: 'YouTube Fehler', description: message, variant: 'destructive' });
        return { success: false, error: message };
      }

      toast({
        title: '📺 YouTube veröffentlicht',
        description: ytResult.permalink || 'Video wurde hochgeladen.',
      });
      return {
        success: true,
        postId: ytResult.external_id,
        url: ytResult.permalink,
        message: ytResult.permalink,
      };
    } catch (error: any) {
      console.error('YouTube publish error:', error);
      toast({ title: 'YouTube Fehler', description: error?.message, variant: 'destructive' });
      return { success: false, error: error?.message };
    } finally {
      setBusy('youtube', false);
    }
  };


  const publishToMultiplePlatforms = async (
    config: Omit<PublishConfig, 'platform'>,
    platforms: Platform[],
    perChannelConfig?: Partial<Record<Platform, Omit<PublishConfig, 'platform'>>>,
  ): Promise<Record<Platform, PublishResult>> => {
    const results: Partial<Record<Platform, PublishResult>> = {};

    await Promise.all(platforms.map(async (platform) => {
      const cfg = { ...config, ...(perChannelConfig?.[platform] ?? {}) };
      let result: PublishResult;
      switch (platform) {
        case 'instagram':
          result = await publishToInstagram(cfg, 'REELS');
          break;
        case 'instagram-story':
          result = await publishToInstagram(cfg, 'STORIES');
          break;
        case 'tiktok':
          result = await publishToTikTok(cfg);
          break;
        case 'linkedin':
          result = await publishToLinkedIn(cfg);
          break;
        case 'youtube':
          result = await publishToYouTube(cfg);
          break;
        default:
          result = { success: false, error: 'Unknown platform' };
      }
      results[platform] = result;
    }));

    return results as Record<Platform, PublishResult>;
  };

  return {
    publishing,
    publishToInstagram,
    publishToTikTok,
    publishToLinkedIn,
    publishToYouTube,
    publishToMultiplePlatforms,
  };
}
