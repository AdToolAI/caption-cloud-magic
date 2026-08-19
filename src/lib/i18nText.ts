import { useTranslation } from '@/hooks/useTranslation';
import type { Language } from '@/lib/translations';

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
export type TriTextOf<T> = { de: T; en: T; es?: T };
export type TriText = TriTextOf<string>;

const SUPPORTED: Language[] = ['de', 'en', 'es'];

export function getLang(): Language {
  try {
    const saved = localStorage.getItem('adtool-ai-lang');
    if (saved && (SUPPORTED as string[]).includes(saved)) return saved as Language;
  } catch {
    /* localStorage unavailable (SSR / private mode) */
  }
  // Canonical default is English — never German.
  return 'en';
}

export function pickText<T>(lang: Language | string, text: TriTextOf<T>): T {
  if (lang === 'de') return text.de;
  if (lang === 'es') return text.es ?? text.en;
  return text.en;
}

/** For hooks, lib modules and any non-component code. */
export function tx<T = string>(text: TriTextOf<T>): T {
  return pickText(getLang(), text);
}

/** For React components — re-renders when the user switches language. */
export function useTx() {
  const { language } = useTranslation();
  return <T,>(text: TriTextOf<T>) => pickText(language, text);
}
