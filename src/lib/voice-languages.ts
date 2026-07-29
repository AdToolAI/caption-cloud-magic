/**
 * Central language catalogue for the ElevenLabs voice library.
 * Keep in sync with `supabase/functions/_shared/tts-language.ts`.
 */

export interface VoiceLanguageOption {
  code: string;
  label: string;
  flag: string;
}

/** Languages that actually exist in `voice_library_cache`, most-populated first. */
export const VOICE_LANGUAGES: VoiceLanguageOption[] = [
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
  { code: 'fi', label: 'Suomi', flag: '🇫🇮' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ta', label: 'தமிழ்', flag: '🇮🇳' },
  { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

const CODES = new Set(VOICE_LANGUAGES.map((l) => l.code));

/** Normalises `de-DE`, `DE`, `de_AT` → `de`. Returns null for unknown languages. */
export function normalizeVoiceLanguage(input?: string | null): string | null {
  if (!input) return null;
  const base = String(input).toLowerCase().trim().replace('_', '-').split('-')[0];
  return CODES.has(base) ? base : null;
}

/** Same as above, but falls back to `all` (no filter) instead of null. */
export function toPickerLanguage(input?: string | null): string {
  return normalizeVoiceLanguage(input) ?? 'all';
}

export function voiceLanguageLabel(code?: string | null): string {
  const norm = normalizeVoiceLanguage(code);
  if (!norm) return 'Alle Sprachen';
  const found = VOICE_LANGUAGES.find((l) => l.code === norm);
  return found ? `${found.flag} ${found.label}` : norm.toUpperCase();
}

/** Languages where an English/American accent counts as non-native. */
export const NATIVE_SENSITIVE_LANGUAGES = new Set([
  'de', 'es', 'fr', 'it', 'pt', 'nl', 'pl', 'tr', 'sv', 'fi', 'ru', 'uk', 'ar', 'hi', 'ja', 'ko', 'zh',
]);
