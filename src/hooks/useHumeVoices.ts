import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { HUME_VOICES_FALLBACK, type HumeVoiceMeta } from '@/lib/voice-studio/humeVoices';

interface RawVoice {
  id: string;
  name: string;
  provider: 'HUME_AI' | 'CUSTOM_VOICE';
}

async function fetchHumeVoices(): Promise<HumeVoiceMeta[]> {
  const { data, error } = await supabase.functions.invoke('list-voices-hume', {
    body: {},
  });
  if (error) throw error;
  const raw = (data?.voices || []) as RawVoice[];
  if (!Array.isArray(raw) || raw.length === 0) {
    return HUME_VOICES_FALLBACK;
  }
  return raw.map((v) => ({
    id: `hume:${v.name}`,
    name: v.name,
    provider: v.provider,
    gender: 'neutral' as const,
    label: v.name,
    description: v.provider === 'CUSTOM_VOICE' ? 'Custom voice' : 'Hume Octave voice',
    languages: ['en', 'de', 'es'],
  }));
}

/**
 * Live Hume Voice Library — fetched once per hour, cached.
 * Falls back to a small known-good list if the fetch fails so the UI
 * never renders an empty dropdown.
 */
export function useHumeVoices() {
  const q = useQuery({
    queryKey: ['hume-voices'],
    queryFn: fetchHumeVoices,
    staleTime: 60 * 60 * 1000, // 1h
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  return {
    voices: q.data ?? HUME_VOICES_FALLBACK,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
