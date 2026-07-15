// Backwards-compatible façade over engineCatalog.ts.
// Prefer importing from '@/lib/music/engineCatalog' in new code.
import {
  getEngine,
  isLanguageSupported as _isLanguageSupported,
  getLanguageMeta as _getLanguageMeta,
  engineHasVocals,
  ENGINE_CATALOG,
  type MusicLanguage,
} from '@/lib/music/engineCatalog';

export type { MusicLanguage };

export const MUSIC_LANGUAGE_SUPPORT: Record<string, MusicLanguage[]> = Object.fromEntries(
  Object.entries(ENGINE_CATALOG).map(([id, e]) => [id, e.languages]),
);

export const isLanguageSupported = (engineId: string, code: string) => _isLanguageSupported(engineId, code);
export const getLanguageMeta = (engineId: string, code: string) => _getLanguageMeta(engineId, code);
export const tierHasVocals = (engineId: string, instrumental: boolean) => engineHasVocals(engineId, instrumental);

export const getEngineLanguages = (engineId: string) => getEngine(engineId).languages;
