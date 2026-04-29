import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAIVideoWallet } from './useAIVideoWallet';

export type MusicTier = 'quick' | 'adaptive' | 'standard' | 'vocal' | 'pro';

export interface MusicGenerationParams {
  prompt: string;
  tier: MusicTier;
  durationSeconds: number;
  genre?: string;
  mood?: string;
  instrumental?: boolean;
  bpm?: number;
  key?: string;
  lyrics?: string;       // Required for 'vocal' tier
  loop?: boolean;        // Hint for 'adaptive' tier
}

export interface GeneratedMusicTrack {
  id: string;
  url: string;
  title: string;
  duration_sec: number;
  engine: string;
}

export const MUSIC_TIER_PRICING: Record<MusicTier, { eur: number; maxDuration: number; engine: string; description: string }> = {
  quick:    { eur: 0.10, maxDuration: 30,  engine: 'MusicGen (Meta)',     description: 'Fast instrumental loops' },
  adaptive: { eur: 0.15, maxDuration: 190, engine: 'Stable Audio 2.5',    description: 'Background music, loopable, up to ~3 min' },
  standard: { eur: 0.35, maxDuration: 60,  engine: 'ElevenLabs Music',    description: 'Polished instrumental tracks' },
  vocal:    { eur: 0.30, maxDuration: 60,  engine: 'MiniMax Music 1.5',   description: 'Songs with vocals & lyrics' },
  pro:      { eur: 1.40, maxDuration: 300, engine: 'ElevenLabs Music Pro', description: 'Long-form professional production' },
};

export function useMusicGeneration() {
  const [loading, setLoading] = useState(false);
  const [generatingLyrics, setGeneratingLyrics] = useState(false);
  const { refetch: refetchWallet } = useAIVideoWallet();

  const generateMusic = async (params: MusicGenerationParams): Promise<GeneratedMusicTrack | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-music-track', {
        body: params,
      });

      if (error) {
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
        } else if (code === 'MISSING_LYRICS') {
          toast.error('Lyrics fehlen', { description: 'Für Vocal-Tracks bitte Songtext eingeben.' });
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

  const generateLyrics = async (params: {
    prompt: string;
    genre?: string;
    mood?: string;
    language?: 'en' | 'de' | 'es';
  }): Promise<string | null> => {
    setGeneratingLyrics(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-music-lyrics', {
        body: params,
      });
      if (error) {
        toast.error('Lyrics-Generierung fehlgeschlagen', { description: error.message });
        return null;
      }
      if (!data?.success) {
        toast.error(data?.error || 'Lyrics-Generierung fehlgeschlagen');
        return null;
      }
      toast.success('✍️ Lyrics generiert!');
      return data.lyrics as string;
    } catch (err: any) {
      console.error('Lyrics generation error:', err);
      toast.error('Fehler bei der Lyrics-Generierung', { description: err.message });
      return null;
    } finally {
      setGeneratingLyrics(false);
    }
  };

  return { generateMusic, generateLyrics, loading, generatingLyrics };
}
