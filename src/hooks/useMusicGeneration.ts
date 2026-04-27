import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAIVideoWallet } from './useAIVideoWallet';

export type MusicTier = 'quick' | 'standard' | 'pro';

export interface MusicGenerationParams {
  prompt: string;
  tier: MusicTier;
  durationSeconds: number;
  genre?: string;
  mood?: string;
  instrumental?: boolean;
  bpm?: number;          // Optional target BPM (e.g. match a video tempo)
  key?: string;          // Optional musical key
}

export interface GeneratedMusicTrack {
  id: string;
  url: string;
  title: string;
  duration_sec: number;
  engine: string;
}

export const MUSIC_TIER_PRICING: Record<MusicTier, { eur: number; maxDuration: number; engine: string }> = {
  quick: { eur: 0.10, maxDuration: 30, engine: 'MusicGen (Meta)' },
  standard: { eur: 0.35, maxDuration: 60, engine: 'ElevenLabs Music' },
  pro: { eur: 1.40, maxDuration: 300, engine: 'ElevenLabs Music Pro' },
};

export function useMusicGeneration() {
  const [loading, setLoading] = useState(false);
  const { refetch: refetchWallet } = useAIVideoWallet();

  const generateMusic = async (params: MusicGenerationParams): Promise<GeneratedMusicTrack | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-music-track', {
        body: params,
      });

      if (error) {
        // Try to parse error from response body
        const errPayload: any = (error as any).context?.body
          ? await (error as any).context.body.text().then((t: string) => { try { return JSON.parse(t); } catch { return null; } })
          : null;

        const code = errPayload?.code;
        const msg = errPayload?.error || error.message;

        if (code === 'INSUFFICIENT_CREDITS' || code === 'NO_WALLET') {
          toast.error(msg, {
            description: 'Bitte AI Credits aufladen.',
            action: {
              label: 'Credits kaufen',
              onClick: () => { window.location.href = '/ai-video-purchase-credits'; },
            },
          });
        } else if (code === 'RATE_LIMIT') {
          toast.error('Rate limit erreicht', { description: 'Bitte kurz warten und erneut versuchen.' });
        } else {
          toast.error('Music-Generierung fehlgeschlagen', { description: msg });
        }
        return null;
      }

      if (!data?.success) {
        toast.error(data?.error || 'Unbekannter Fehler');
        return null;
      }

      toast.success('🎵 Track generiert!', {
        description: `${data.track.title} • ${data.track.duration_sec}s`,
      });

      // Refresh wallet balance
      await refetchWallet();

      return data.track as GeneratedMusicTrack;
    } catch (err: any) {
      console.error('Music generation error:', err);
      toast.error('Fehler bei der Musik-Generierung', {
        description: err.message || 'Unbekannter Fehler',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { generateMusic, loading };
}
