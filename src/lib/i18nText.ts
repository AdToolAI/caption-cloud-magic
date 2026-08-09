import { useTranslation } from '@/hooks/useTranslation';
import type { Language } from '@/lib/translations';
import { tx } from '@/lib/i18nText';

/**
 * Lightweight per-string localisation helper.
 *
 * Used for UI copy that lives directly inside components, hooks or lib
 * modules and therefore never made it into `translations.ts`. Instead of
 * shipping a hardcoded German literal to every language, wrap it:
 *
 *   tx({ de: 'Fehler', en: 'Error' })
 *
 * Spanish falls back to English until a translation is supplied.
 */
export type TriText = { de: string; en: string; es?: string };

const SUPPORTED: Language[] = ['de', 'en', 'es'];

export function getLang(): Language {
  try {
    const saved = localStorage.getItem('adtool-ai-lang');
    if (saved && (SUPPORTED as string[]).includes(saved)) return saved as Language;
  } catch {
    /* localStorage unavailable (SSR / private mode) */
  }
  return 'de';
}

export function pickText(lang: Language | string, text: TriText): string {
  if (lang === 'en') return text.en;
  if (lang === 'es') return text.es ?? text.en;
  return text.de;
}

/** For hooks, lib modules and any non-component code. */
export function tx(text: TriText): string {
  return pickText(getLang(), text);
}

/** For React components — re-renders when the user switches language. */
export function useTx() {
  const { language } = useTranslation();
  return (text: TriText) => pickText(language, text);
}
