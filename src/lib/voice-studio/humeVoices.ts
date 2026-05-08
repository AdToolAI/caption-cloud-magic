/**
 * Curated Hume Octave voice catalog.
 *
 * Hume's Octave TTS exposes voices by NAME (provider="HUME_AI" or
 * "CUSTOM_VOICE"). These names correspond to Hume's public voice library
 * (https://platform.hume.ai/tts/voices). We expose a curated subset
 * matching ElevenLabs' typical persona slots so the SpeakerMappingBar
 * can show feature-parity options across both engines.
 *
 * To add custom voices later: extend with `provider: 'CUSTOM_VOICE'`
 * entries (the name must match the user's Hume workspace).
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

export const HUME_VOICES: HumeVoiceMeta[] = [
  {
    id: 'hume:ito',
    name: 'Ito',
    provider: 'HUME_AI',
    gender: 'male',
    label: 'Ito — warm narrator',
    description: 'Warm, grounded male narrator. Great for storytelling & explainers.',
    languages: ['en', 'de', 'es'],
  },
  {
    id: 'hume:kora',
    name: 'Kora',
    provider: 'HUME_AI',
    gender: 'female',
    label: 'Kora — bright host',
    description: 'Bright, energetic female host. Marketing & social ads.',
    languages: ['en', 'de', 'es'],
  },
  {
    id: 'hume:dacher',
    name: 'Dacher',
    provider: 'HUME_AI',
    gender: 'male',
    label: 'Dacher — calm scholar',
    description: 'Calm, thoughtful male voice. Documentary, educational.',
    languages: ['en', 'de', 'es'],
  },
  {
    id: 'hume:aura',
    name: 'Aura',
    provider: 'HUME_AI',
    gender: 'female',
    label: 'Aura — soft cinematic',
    description: 'Soft, cinematic female voice. Trailers, premium brand spots.',
    languages: ['en', 'de', 'es'],
  },
  {
    id: 'hume:zara',
    name: 'Zara',
    provider: 'HUME_AI',
    gender: 'female',
    label: 'Zara — confident pro',
    description: 'Confident, professional female. Corporate & B2B.',
    languages: ['en', 'de', 'es'],
  },
  {
    id: 'hume:nova',
    name: 'Nova',
    provider: 'HUME_AI',
    gender: 'neutral',
    label: 'Nova — neutral assistant',
    description: 'Clear, neutral voice. AI-assistant style.',
    languages: ['en', 'de', 'es'],
  },
  {
    id: 'hume:rhys',
    name: 'Rhys',
    provider: 'HUME_AI',
    gender: 'male',
    label: 'Rhys — gritty hero',
    description: 'Deep, gritty male voice. Action ads, sports, automotive.',
    languages: ['en'],
  },
  {
    id: 'hume:lucas',
    name: 'Lucas',
    provider: 'HUME_AI',
    gender: 'male',
    label: 'Lucas — friendly youth',
    description: 'Friendly, youthful male. Lifestyle & DTC brands.',
    languages: ['en', 'de', 'es'],
  },
];

export function getHumeVoiceById(id: string): HumeVoiceMeta | undefined {
  return HUME_VOICES.find((v) => v.id === id);
}

/** True when a voiceId belongs to the Hume engine (vs ElevenLabs). */
export function isHumeVoiceId(id: string | undefined | null): boolean {
  return !!id && id.startsWith('hume:');
}
