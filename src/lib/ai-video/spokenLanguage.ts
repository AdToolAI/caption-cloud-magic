export type SpokenLanguageCode =
  | 'de'
  | 'en'
  | 'es'
  | 'fr'
  | 'it'
  | 'pt'
  | 'nl'
  | 'pl'
  | 'tr'
  | 'ar'
  | 'hi'
  | 'ja'
  | 'ko'
  | 'zh';

export type SpokenLanguageSelection = 'auto' | SpokenLanguageCode;

export const SEEDANCE_SPOKEN_LANGUAGES: ReadonlyArray<{
  code: SpokenLanguageCode;
  label: string;
  promptLabel: string;
}> = [
  { code: 'de', label: 'Deutsch', promptLabel: 'German (Deutsch)' },
  { code: 'en', label: 'English', promptLabel: 'English' },
  { code: 'es', label: 'Español', promptLabel: 'Spanish (Español)' },
  { code: 'fr', label: 'Français', promptLabel: 'French (Français)' },
  { code: 'it', label: 'Italiano', promptLabel: 'Italian (Italiano)' },
  { code: 'pt', label: 'Português', promptLabel: 'Portuguese (Português)' },
  { code: 'nl', label: 'Nederlands', promptLabel: 'Dutch (Nederlands)' },
  { code: 'pl', label: 'Polski', promptLabel: 'Polish (Polski)' },
  { code: 'tr', label: 'Türkçe', promptLabel: 'Turkish (Türkçe)' },
  { code: 'ar', label: 'العربية', promptLabel: 'Arabic' },
  { code: 'hi', label: 'हिन्दी', promptLabel: 'Hindi' },
  { code: 'ja', label: '日本語', promptLabel: 'Japanese' },
  { code: 'ko', label: '한국어', promptLabel: 'Korean' },
  { code: 'zh', label: '中文', promptLabel: 'Chinese (Mandarin)' },
];

const LANGUAGE_BY_CODE = new Map(
  SEEDANCE_SPOKEN_LANGUAGES.map((language) => [language.code, language]),
);

export function isSpokenLanguageSelection(value: string | null): value is SpokenLanguageSelection {
  return value === 'auto' || LANGUAGE_BY_CODE.has(value as SpokenLanguageCode);
}

export function resolveAutoSpokenLanguage(uiLanguage: string): SpokenLanguageCode {
  return uiLanguage === 'de' ? 'de' : uiLanguage === 'es' ? 'es' : 'en';
}

export function getSpokenLanguagePromptLabel(code: SpokenLanguageCode): string {
  return LANGUAGE_BY_CODE.get(code)?.promptLabel ?? 'English';
}

export function buildSpokenLanguageDirective(code: SpokenLanguageCode): string {
  const label = getSpokenLanguagePromptLabel(code);
  return `All spoken dialogue, narration and voiceover MUST be performed in ${label}. Do not use any other language for speech. Lip movement must match ${label} phonemes.`;
}