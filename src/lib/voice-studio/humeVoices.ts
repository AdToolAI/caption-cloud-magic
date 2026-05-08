/**
 * Hume Octave voice catalog (types + helpers).
 *
 * The actual list of voices is fetched dynamically from Hume's
 * `/v0/tts/voices` endpoint via `useHumeVoices()`. We do NOT hardcode names
 * here because Hume's library evolves and any stale name causes a hard 404
 * in `generate-voiceover-hume`.
 *
 * A tiny SAFE_FALLBACK list is kept only for use when the live fetch fails,
 * so the UI never shows an empty dropdown.
 */

export type HumeVoiceGender = 'male' | 'female' | 'neutral';
export type HumeVoiceProvider = 'HUME_AI' | 'CUSTOM_VOICE';

export interface HumeVoiceMeta {
  /** Stable id used as `voiceId` in our system (we prefix with `hume:`). */
  id: string;
  /** Hume voice NAME passed to /v0/tts/file. */
  name: string;
  provider: HumeVoiceProvider;
  gender: HumeVoiceGender;
  /** Display label for the picker. */
  label: string;
  /** Short description for the picker. */
  description: string;
  /** Suggested languages (ISO codes) — Hume Octave is multilingual. */
  languages: string[];
}

/** Tiny known-good fallback (verified to exist in Hume's HUME_AI library). */
export const HUME_VOICES_FALLBACK: HumeVoiceMeta[] = [
  {
    id: 'hume:Ito',
    name: 'Ito',
    provider: 'HUME_AI',
    gender: 'male',
    label: 'Ito',
    description: 'Hume Octave voice',
    languages: ['en', 'de', 'es'],
  },
  {
    id: 'hume:Kora',
    name: 'Kora',
    provider: 'HUME_AI',
    gender: 'female',
    label: 'Kora',
    description: 'Hume Octave voice',
    languages: ['en', 'de', 'es'],
  },
  {
    id: 'hume:Dacher',
    name: 'Dacher',
    provider: 'HUME_AI',
    gender: 'male',
    label: 'Dacher',
    description: 'Hume Octave voice',
    languages: ['en', 'de', 'es'],
  },
];

/** @deprecated kept for compatibility with older imports — prefer useHumeVoices(). */
export const HUME_VOICES = HUME_VOICES_FALLBACK;

export function getHumeVoiceById(
  id: string,
  list: HumeVoiceMeta[] = HUME_VOICES_FALLBACK,
): HumeVoiceMeta | undefined {
  return list.find((v) => v.id === id);
}

/** True when a voiceId belongs to the Hume engine (vs ElevenLabs). */
export function isHumeVoiceId(id: string | undefined | null): boolean {
  return !!id && id.startsWith('hume:');
}
