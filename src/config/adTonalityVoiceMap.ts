/**
 * Maps each Ad Tonality profile to a recommended ElevenLabs voice and
 * a tuning preset (stability/style/speed). Used by the Ad Director
 * "Voiceover Auto-Synth" feature in Stage 2.
 *
 * Voice IDs are sourced from ElevenLabs' default premium library (same
 * IDs already used elsewhere in the platform for `generate-voiceover`).
 */

import type { AdTonalityId } from '@/config/adTonalityProfiles';

export interface TonalityVoiceConfig {
  voiceId: string;
  voiceLabel: string;
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
  speed: number;
}

const DEFAULT: TonalityVoiceConfig = {
  voiceId: '9BWtsMINqrJLrRacOk9x', // Aria — neutral fallback
  voiceLabel: 'Aria',
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.3,
  useSpeakerBoost: true,
  speed: 1.0,
};

export const AD_TONALITY_VOICE_MAP: Record<AdTonalityId, TonalityVoiceConfig> = {
  'minimal-premium': {
    voiceId: 'JBFqnCBsd6RMkjVDRZzb', // George — calm, refined
    voiceLabel: 'George',
    stability: 0.75,
    similarityBoost: 0.8,
    style: 0.1,
    useSpeakerBoost: true,
    speed: 0.95,
  },
  'bold-challenger': {
    voiceId: 'nPczCjzI2devNBz1zQrb', // Brian — confident, punchy
    voiceLabel: 'Brian',
    stability: 0.4,
    similarityBoost: 0.8,
    style: 0.55,
    useSpeakerBoost: true,
    speed: 1.05,
  },
  'warm-storyteller': {
    voiceId: 'cgSgspJ2msm6clMCkdW9', // Jessica — warm, natural
    voiceLabel: 'Jessica',
    stability: 0.6,
    similarityBoost: 0.8,
    style: 0.4,
    useSpeakerBoost: true,
    speed: 0.95,
  },
  'authentic-documentary': {
    voiceId: 'onwK4e9ZLuTAKqWW03F9', // Daniel — grounded, journalistic
    voiceLabel: 'Daniel',
    stability: 0.65,
    similarityBoost: 0.75,
    style: 0.2,
    useSpeakerBoost: true,
    speed: 1.0,
  },
  'playful-witty': {
    voiceId: 'IKne3meq5aSn9XLyUdCD', // Charlie — light, expressive
    voiceLabel: 'Charlie',
    stability: 0.4,
    similarityBoost: 0.75,
    style: 0.55,
    useSpeakerBoost: true,
    speed: 1.05,
  },
  'empathic-caring': {
    voiceId: 'XrExE9yKIg1WjnnlVkGX', // Matilda — soft, supportive
    voiceLabel: 'Matilda',
    stability: 0.7,
    similarityBoost: 0.8,
    style: 0.3,
    useSpeakerBoost: true,
    speed: 0.95,
  },
  'visionary-inspiring': {
    voiceId: 'JBFqnCBsd6RMkjVDRZzb', // George — gravitas
    voiceLabel: 'George',
    stability: 0.6,
    similarityBoost: 0.8,
    style: 0.45,
    useSpeakerBoost: true,
    speed: 0.95,
  },
  'practical-helpful': {
    voiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah — clear, instructive
    voiceLabel: 'Sarah',
    stability: 0.6,
    similarityBoost: 0.75,
    style: 0.2,
    useSpeakerBoost: true,
    speed: 1.0,
  },
  'edgy-provocative': {
    voiceId: 'nPczCjzI2devNBz1zQrb', // Brian — confrontational
    voiceLabel: 'Brian',
    stability: 0.35,
    similarityBoost: 0.8,
    style: 0.6,
    useSpeakerBoost: true,
    speed: 1.05,
  },
  'energetic-hype': {
    voiceId: 'TX3LPaxmHKxFdv7VOQHJ', // Liam — energetic
    voiceLabel: 'Liam',
    stability: 0.35,
    similarityBoost: 0.8,
    style: 0.65,
    useSpeakerBoost: true,
    speed: 1.1,
  },
  'trustworthy-expert': {
    voiceId: 'onwK4e9ZLuTAKqWW03F9', // Daniel — authoritative
    voiceLabel: 'Daniel',
    stability: 0.7,
    similarityBoost: 0.8,
    style: 0.15,
    useSpeakerBoost: true,
    speed: 0.95,
  },
  'joyful-optimistic': {
    voiceId: 'pFZP5JQG7iQjIQuC4Bku', // Lily — bright, friendly
    voiceLabel: 'Lily',
    stability: 0.5,
    similarityBoost: 0.8,
    style: 0.45,
    useSpeakerBoost: true,
    speed: 1.0,
  },
};

export function getTonalityVoice(id: AdTonalityId): TonalityVoiceConfig {
  return AD_TONALITY_VOICE_MAP[id] ?? DEFAULT;
}
