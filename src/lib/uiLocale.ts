import { getLang } from '@/lib/i18nText';
import { useTranslation } from '@/hooks/useTranslation';
import type { Language } from '@/lib/translations';

/**
 * Maps the selected UI language to a BCP-47 locale for `Intl` /
 * `toLocaleString` formatting. English is the canonical default, so an
 * EN-selected user never sees German or Spanish date/number formatting.
 */
const LOCALE_BY_LANGUAGE: Record<Language, string> = {
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
};

export function localeForLanguage(language: Language | string | undefined | null): string {
  return LOCALE_BY_LANGUAGE[(language ?? 'en') as Language] ?? 'en-US';
}

/** For hooks, lib modules and any non-component code. */
export function uiLocale(): string {
  return localeForLanguage(getLang());
}

/** For React components — re-renders when the user switches language. */
export function useUiLocale(): string {
  const { language } = useTranslation();
  return localeForLanguage(language);
}
