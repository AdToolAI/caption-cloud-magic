import type { MusicTier } from '@/hooks/useMusicGeneration';

export interface MusicLanguage {
  code: string;
  label: string;
  flag: string;
  name: string; // English full name for prompt directive
}

// Only cleanly supported languages per provider (verified against provider docs).
export const MUSIC_LANGUAGE_SUPPORT: Record<MusicTier, MusicLanguage[]> = {
  // Instrumental-only: no language selection.
  quick: [],
  adaptive: [],
  // ElevenLabs Music (standard/pro): EN, DE, ES, FR, IT, PT, NL, PL, JA
  standard: [
    { code: 'en', label: 'Englisch', flag: '🇬🇧', name: 'English' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪', name: 'German' },
    { code: 'es', label: 'Spanisch', flag: '🇪🇸', name: 'Spanish' },
    { code: 'fr', label: 'Französisch', flag: '🇫🇷', name: 'French' },
    { code: 'it', label: 'Italienisch', flag: '🇮🇹', name: 'Italian' },
    { code: 'pt', label: 'Portugiesisch', flag: '🇵🇹', name: 'Portuguese' },
    { code: 'nl', label: 'Niederländisch', flag: '🇳🇱', name: 'Dutch' },
    { code: 'pl', label: 'Polnisch', flag: '🇵🇱', name: 'Polish' },
    { code: 'ja', label: 'Japanisch', flag: '🇯🇵', name: 'Japanese' },
  ],
  pro: [
    { code: 'en', label: 'Englisch', flag: '🇬🇧', name: 'English' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪', name: 'German' },
    { code: 'es', label: 'Spanisch', flag: '🇪🇸', name: 'Spanish' },
    { code: 'fr', label: 'Französisch', flag: '🇫🇷', name: 'French' },
    { code: 'it', label: 'Italienisch', flag: '🇮🇹', name: 'Italian' },
    { code: 'pt', label: 'Portugiesisch', flag: '🇵🇹', name: 'Portuguese' },
    { code: 'nl', label: 'Niederländisch', flag: '🇳🇱', name: 'Dutch' },
    { code: 'pl', label: 'Polnisch', flag: '🇵🇱', name: 'Polish' },
    { code: 'ja', label: 'Japanisch', flag: '🇯🇵', name: 'Japanese' },
  ],
  // MiniMax Music 1.5 (vocal): EN, DE, ES, FR, IT, PT, JA, KO, ZH
  vocal: [
    { code: 'en', label: 'Englisch', flag: '🇬🇧', name: 'English' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪', name: 'German' },
    { code: 'es', label: 'Spanisch', flag: '🇪🇸', name: 'Spanish' },
    { code: 'fr', label: 'Französisch', flag: '🇫🇷', name: 'French' },
    { code: 'it', label: 'Italienisch', flag: '🇮🇹', name: 'Italian' },
    { code: 'pt', label: 'Portugiesisch', flag: '🇵🇹', name: 'Portuguese' },
    { code: 'ja', label: 'Japanisch', flag: '🇯🇵', name: 'Japanese' },
    { code: 'ko', label: 'Koreanisch', flag: '🇰🇷', name: 'Korean' },
    { code: 'zh', label: 'Chinesisch', flag: '🇨🇳', name: 'Chinese' },
  ],
};

export function isLanguageSupported(tier: MusicTier, code: string): boolean {
  return MUSIC_LANGUAGE_SUPPORT[tier].some((l) => l.code === code);
}

export function getLanguageMeta(tier: MusicTier, code: string): MusicLanguage | undefined {
  return MUSIC_LANGUAGE_SUPPORT[tier].find((l) => l.code === code);
}

export function tierHasVocals(tier: MusicTier, instrumental: boolean): boolean {
  if (tier === 'vocal') return true;
  if (tier === 'quick' || tier === 'adaptive') return false;
  return !instrumental;
}
