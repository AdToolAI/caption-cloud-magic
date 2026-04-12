import { Currency } from './pricing';

export const SEEDANCE_VIDEO_MODELS = {
  'seedance-standard': {
    name: 'Seedance 2.0 Standard',
    provider: 'ByteDance (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.15,
      USD: 0.15,
    },
    minDuration: 3,
    maxDuration: 15,
    description: {
      EUR: 'Hochwertige AI-Videos ab 0,75€ pro 5 Sekunden',
      USD: 'High-quality AI videos from $0.75 per 5 seconds',
    },
    badge: 'Empfohlen',
  },
  'seedance-pro': {
    name: 'Seedance 2.0 Pro',
    provider: 'ByteDance (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.20,
      USD: 0.20,
    },
    minDuration: 3,
    maxDuration: 15,
    description: {
      EUR: 'Premium 1080p-Qualität ab 1,00€ pro 5 Sekunden',
      USD: 'Premium 1080p quality from $1.00 per 5 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type SeedanceVideoModel = keyof typeof SEEDANCE_VIDEO_MODELS;

export const SEEDANCE_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type SeedanceAspectRatio = typeof SEEDANCE_ASPECT_RATIOS[number];
