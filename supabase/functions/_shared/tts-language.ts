/**
 * Shared ElevenLabs language pinning.
 *
 * `eleven_multilingual_v2` auto-detects the language from the text, which is
 * exactly how German scripts drifted into English / fantasy pronunciation.
 * When a caller explicitly states a language we pin it with `language_code`
 * and switch to a model that actually honours that parameter.
 *
 * Keep in sync with `src/lib/voice-languages.ts`.
 */

const SUPPORTED_LANGUAGES = new Set([
  'de', 'en', 'es', 'fr', 'it', 'pt', 'nl', 'pl', 'tr', 'sv', 'fi', 'ru', 'uk',
  'ar', 'hi', 'ta', 'id', 'vi', 'ja', 'ko', 'zh', 'cs', 'da', 'el', 'no', 'ro',
  'hu', 'bg', 'hr', 'ms', 'sk', 'fil',
]);

/** Models that accept and enforce `language_code`. */
const LANGUAGE_AWARE_MODELS = new Set([
  'eleven_turbo_v2_5',
  'eleven_flash_v2_5',
  'eleven_v3',
]);

export const DEFAULT_LANGUAGE_AWARE_MODEL = 'eleven_turbo_v2_5';
export const DEFAULT_MULTILINGUAL_MODEL = 'eleven_multilingual_v2';

/** `de-DE`, `DE`, `de_AT` → `de`; unknown/empty → null. */
export function normalizeTtsLanguage(input?: string | null): string | null {
  if (!input) return null;
  const base = String(input).toLowerCase().trim().replace('_', '-').split('-')[0];
  return SUPPORTED_LANGUAGES.has(base) ? base : null;
}

/** Picks a model that can honour the requested language. */
export function resolveTtsModel(modelId?: string | null, language?: string | null): string {
  const lang = normalizeTtsLanguage(language);
  if (!lang) return modelId || DEFAULT_MULTILINGUAL_MODEL;
  if (modelId && LANGUAGE_AWARE_MODELS.has(modelId)) return modelId;
  return DEFAULT_LANGUAGE_AWARE_MODEL;
}

/**
 * Returns the TTS body with `model_id` (+ `language_code` when a language is
 * given). Use for every ElevenLabs text-to-speech call.
 */
export function withTtsLanguage<T extends Record<string, unknown>>(
  payload: T,
  language?: string | null,
  modelId?: string | null,
): T & { model_id: string; language_code?: string } {
  const lang = normalizeTtsLanguage(language);
  const model = resolveTtsModel(modelId ?? (payload.model_id as string | undefined), lang);
  const out = { ...payload, model_id: model } as T & { model_id: string; language_code?: string };
  if (lang) out.language_code = lang;
  return out;
}
