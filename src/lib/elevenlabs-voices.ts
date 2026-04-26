// Frontend mirror of premium voice metadata.
// Keep IDs in sync with supabase/functions/_shared/premium-voices.ts

export type VoiceLanguage = 'de' | 'en' | 'es';
export type VoiceTier = 'premium' | 'standard' | 'custom' | 'cloned';

export interface VoiceMeta {
  id: string;
  name: string;
  language: VoiceLanguage | string;
  gender?: 'male' | 'female' | 'neutral' | string;
  age?: string;
  description?: string;
  accent?: string;
  tier?: VoiceTier;
  recommended_model?: string;
  recommended_settings?: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
  supportedLanguages?: string[];
}

// Natural defaults for any voice the user picks
export const DEFAULT_VOICE_SETTINGS = {
  stability: 0.4,
  similarity_boost: 0.8,
  style: 0.3,
  use_speaker_boost: true,
};

export const DEFAULT_MODEL = 'eleven_multilingual_v2';

export function sortVoicesPremiumFirst<T extends { tier?: string; name?: string }>(voices: T[]): T[] {
  return [...voices].sort((a, b) => {
    const aPrem = a.tier === 'premium' ? 0 : 1;
    const bPrem = b.tier === 'premium' ? 0 : 1;
    if (aPrem !== bPrem) return aPrem - bPrem;
    return (a.name || '').localeCompare(b.name || '');
  });
}
