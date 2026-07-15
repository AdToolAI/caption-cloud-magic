import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAIVideoWallet } from './useAIVideoWallet';
import { ENGINE_CATALOG, type MusicEngineId } from '@/lib/music/engineCatalog';

// Legacy union retained for compatibility with older callers.
export type MusicTier = MusicEngineId;

export interface MusicGenerationParams {
  prompt: string;
  tier: MusicTier;              // engineId
  durationSeconds: number;
  genre?: string;
  mood?: string;
  instrumental?: boolean;
  bpm?: number;
  key?: string;
  lyrics?: string;              // For vocal engines
  loop?: boolean;               // For loopable engines
  language?: string;            // 2-letter code (en, de, es, …)
  languageName?: string;        // English full name for provider directive
  styleTags?: string;           // Suno-style style prompt (comma-separated tags)
}

export interface GeneratedMusicTrack {
  id: string;
  url: string;
  title: string;
  duration_sec: number;
  engine: string;
}

// Legacy pricing map (some old imports still reference it). Backed by ENGINE_CATALOG.
export const MUSIC_TIER_PRICING = Object.fromEntries(
  Object.values(ENGINE_CATALOG).map((e) => [
    e.id,
    { eur: e.priceEur, maxDuration: e.maxDuration, engine: e.provider, description: e.description },
  ]),
) as Record<MusicEngineId, { eur: number; maxDuration: number; engine: string; description: string }>;

async function parseInvokeError(error: any): Promise<any> {
  try {
    const body = error?.context?.body ?? error?.context;
    if (!body) return null;
    if (typeof body === 'object' && typeof (body as any).text !== 'function' && !(body instanceof Blob)) {
      return body;
    }
    if (typeof body === 'string') {
      try { return JSON.parse(body); } catch { return { error: body }; }
    }
    if (typeof (body as any).text === 'function') {
      const t = await (body as any).text();
      try { return JSON.parse(t); } catch { return { error: t }; }
    }
    return null;
  } catch {
    return null;
  }
}

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
        const errPayload: any = await parseInvokeError(error);
        const code = errPayload?.code;
        const msg = errPayload?.error || errPayload?.message || error.message;

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
