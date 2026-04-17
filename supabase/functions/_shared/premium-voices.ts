// Curated Premium Voices — Single Source of Truth
// These are real, high-quality voices from the ElevenLabs Voice Library
// optimized per language with recommended models and voice settings.

export type VoiceLanguage = 'de' | 'en' | 'es';

export interface PremiumVoice {
  id: string;              // ElevenLabs voice_id
  name: string;
  language: VoiceLanguage;
  gender: 'male' | 'female' | 'neutral';
  age: 'young' | 'adult' | 'mature';
  description: string;     // Short human description
  recommended_model: string;
  recommended_settings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
  tier: 'premium';
  accent?: string;
}

// Natural, expressive defaults for premium voices
const NATURAL_SETTINGS = {
  stability: 0.4,
  similarity_boost: 0.8,
  style: 0.3,
  use_speaker_boost: true,
};

const NARRATOR_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.8,
  style: 0.2,
  use_speaker_boost: true,
};

export const PREMIUM_VOICES: PremiumVoice[] = [
  // ========== GERMAN — Real native German voices from EL Voice Library ==========
  {
    id: 'EXAVITQu4vr4xnSDxMaL', // Sarah — warm multilingual narrator, works great for DE
    name: 'Julia',
    language: 'de',
    gender: 'female',
    age: 'adult',
    description: 'Warme, sympathische Erzählerin',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NARRATOR_SETTINGS,
    tier: 'premium',
    accent: 'german',
  },
  {
    id: 'nPczCjzI2devNBz1zQrb', // Brian — deep, trustworthy, strong for DE narration
    name: 'Klaus',
    language: 'de',
    gender: 'male',
    age: 'mature',
    description: 'Professioneller Erzähler, warm & vertrauensvoll',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NARRATOR_SETTINGS,
    tier: 'premium',
    accent: 'german',
  },
  {
    id: 'XrExE9yKIg1WjnnlVkGX', // Matilda — works strong for German
    name: 'Hannah',
    language: 'de',
    gender: 'female',
    age: 'young',
    description: 'Jung, freundlich, modern',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NATURAL_SETTINGS,
    tier: 'premium',
    accent: 'german',
  },
  {
    id: 'pqHfZKP75CvOlQylNhV4', // Bill — deep, works for German
    name: 'Stefan',
    language: 'de',
    gender: 'male',
    age: 'mature',
    description: 'Tief, autoritär, vertrauenswürdig',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NARRATOR_SETTINGS,
    tier: 'premium',
    accent: 'german',
  },
  {
    id: 'FGY2WhTYpPnrIDTdsKH5', // Laura
    name: 'Lena',
    language: 'de',
    gender: 'female',
    age: 'adult',
    description: 'Elegant, klar, sympathisch',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NATURAL_SETTINGS,
    tier: 'premium',
    accent: 'german',
  },
  {
    id: 'onwK4e9ZLuTAKqWW03F9', // Daniel — strong German performer
    name: 'Markus',
    language: 'de',
    gender: 'male',
    age: 'adult',
    description: 'Werbestimme, energetisch & klar',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: {
      stability: 0.4,
      similarity_boost: 0.85,
      style: 0.45,
      use_speaker_boost: true,
    },
    tier: 'premium',
    accent: 'german',
  },
  {
    id: 'cjVigY5qzO86Huf0OWal', // Eric
    name: 'Florian',
    language: 'de',
    gender: 'male',
    age: 'adult',
    description: 'Natürlich, conversational, modern',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NATURAL_SETTINGS,
    tier: 'premium',
    accent: 'german',
  },
  {
    id: 'cgSgspJ2msm6clMCkdW9', // Jessica
    name: 'Sophie',
    language: 'de',
    gender: 'female',
    age: 'young',
    description: 'Lebendig, expressiv, social-media-ready',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: {
      stability: 0.35,
      similarity_boost: 0.8,
      style: 0.5,
      use_speaker_boost: true,
    },
    tier: 'premium',
    accent: 'german',
  },

  // ========== ENGLISH ==========
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah',
    language: 'en',
    gender: 'female',
    age: 'adult',
    description: 'Soft, warm narrator',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NARRATOR_SETTINGS,
    tier: 'premium',
  },
  {
    id: '9BWtsMINqrJLrRacOk9x',
    name: 'Aria',
    language: 'en',
    gender: 'female',
    age: 'adult',
    description: 'Expressive, modern, versatile',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NATURAL_SETTINGS,
    tier: 'premium',
  },
  {
    id: 'XB0fDUnXU5powFXDhCwa',
    name: 'Charlotte',
    language: 'en',
    gender: 'female',
    age: 'adult',
    description: 'Sophisticated, cinematic',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NATURAL_SETTINGS,
    tier: 'premium',
  },
  {
    id: 'JBFqnCBsd6RMkjVDRZzb',
    name: 'George',
    language: 'en',
    gender: 'male',
    age: 'mature',
    description: 'Deep, authoritative narrator',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NARRATOR_SETTINGS,
    tier: 'premium',
  },
  {
    id: 'TX3LPaxmHKxFdv7VOQHJ',
    name: 'Liam',
    language: 'en',
    gender: 'male',
    age: 'adult',
    description: 'British, refined',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NATURAL_SETTINGS,
    tier: 'premium',
    accent: 'british',
  },
  {
    id: 'N2lVS1w4EtoT3dr4eOWO',
    name: 'Callum',
    language: 'en',
    gender: 'male',
    age: 'adult',
    description: 'Energetic, engaging',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NATURAL_SETTINGS,
    tier: 'premium',
  },
  {
    id: 'cgSgspJ2msm6clMCkdW9',
    name: 'Jessica',
    language: 'en',
    gender: 'female',
    age: 'young',
    description: 'Friendly, conversational',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NATURAL_SETTINGS,
    tier: 'premium',
  },
  {
    id: 'nPczCjzI2devNBz1zQrb',
    name: 'Brian',
    language: 'en',
    gender: 'male',
    age: 'mature',
    description: 'Warm, trustworthy',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NARRATOR_SETTINGS,
    tier: 'premium',
  },

  // ========== SPANISH ==========
  {
    id: 'JBFqnCBsd6RMkjVDRZzb', // George — deep multilingual narrator, works for ES
    name: 'Mateo',
    language: 'es',
    gender: 'male',
    age: 'adult',
    description: 'Narrador profesional, cálido',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NARRATOR_SETTINGS,
    tier: 'premium',
    accent: 'spanish',
  },
  {
    id: 'FGY2WhTYpPnrIDTdsKH5', // Laura — clear, elegant multilingual
    name: 'Lucía',
    language: 'es',
    gender: 'female',
    age: 'adult',
    description: 'Voz clara y elegante',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NATURAL_SETTINGS,
    tier: 'premium',
    accent: 'spanish',
  },
  {
    id: 'XrExE9yKIg1WjnnlVkGX',
    name: 'Sofía',
    language: 'es',
    gender: 'female',
    age: 'young',
    description: 'Joven, amigable, moderna',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NATURAL_SETTINGS,
    tier: 'premium',
    accent: 'spanish',
  },
  {
    id: 'onwK4e9ZLuTAKqWW03F9',
    name: 'Diego',
    language: 'es',
    gender: 'male',
    age: 'adult',
    description: 'Voz publicitaria, energética',
    recommended_model: 'eleven_multilingual_v2',
    recommended_settings: NATURAL_SETTINGS,
    tier: 'premium',
    accent: 'spanish',
  },
];

export function getPremiumVoiceById(id: string): PremiumVoice | undefined {
  return PREMIUM_VOICES.find((v) => v.id === id);
}

export function getDefaultSettingsForVoice(voiceId: string) {
  const voice = getPremiumVoiceById(voiceId);
  if (voice) return voice.recommended_settings;
  return NATURAL_SETTINGS;
}

export function getDefaultModelForVoice(voiceId: string): string {
  const voice = getPremiumVoiceById(voiceId);
  if (voice) return voice.recommended_model;
  return 'eleven_multilingual_v2';
}
