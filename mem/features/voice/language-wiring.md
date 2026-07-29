---
name: Voice language wiring
description: How VO language is pinned end-to-end (picker → edge functions) across all studios
type: feature
---
- Frontend catalogue: `src/lib/voice-languages.ts` (21 languages, flags, `normalizeVoiceLanguage`, `toPickerLanguage`, `voicePreviewSample`, `NATIVE_SENSITIVE_LANGUAGES`).
- `UniversalVoiceLibraryPicker` owns a language dropdown; `onSelect(voice, language)` returns the resolved language. Callers pass the project/brand/UI language; native-only defaults on for native-sensitive languages.
- Character voices persist `default_voice_language` on `brand_characters` alongside `default_voice_id/provider/name`.
- Server: `supabase/functions/_shared/tts-language.ts` — `withTtsLanguage(payload, language, modelId)` pins `language_code` and forces a language-aware model (`eleven_turbo_v2_5`), because `eleven_multilingual_v2` ignores `language_code` and causes DE→EN/fantasy drift.
