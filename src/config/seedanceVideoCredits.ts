import { Currency } from './pricing';

// Margin policy: exactly 3.00× Replicate cost (normalized 14.07.2026)
// Mini: $0.02/s → €0.06/s | Std: $0.03/s → €0.09/s | Pro: $0.06/s → €0.18/s
export const SEEDANCE_VIDEO_MODELS = {
  'seedance-mini': {
    name: 'Seedance 2.0 Mini',
    provider: 'ByteDance (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.06,
      USD: 0.06,
    },
    minDuration: 3,
    maxDuration: 15,
    description: {
      EUR: 'Schnelle 720p-AI-Videos ab 0,30€ pro 5 Sekunden',
      USD: 'Fast 720p AI videos from $0.30 per 5 seconds',
    },
    badge: 'Schnell & Günstig',
  },
  'seedance-standard': {
    name: 'Seedance 2.0 Standard',
    provider: 'ByteDance (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.09,
      USD: 0.09,
    },
    minDuration: 3,
    maxDuration: 15,
    description: {
      EUR: 'Hochwertige AI-Videos ab 0,45€ pro 5 Sekunden',
      USD: 'High-quality AI videos from $0.45 per 5 seconds',
    },
    badge: 'Empfohlen',
  },
  'seedance-pro': {
    name: 'Seedance 2.0 Pro',
    provider: 'ByteDance (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.18,
      USD: 0.18,
    },
    minDuration: 3,
    maxDuration: 12,
    description: {
      EUR: 'Premium 1080p-Qualität ab 0,90€ pro 5 Sekunden',
      USD: 'Premium 1080p quality from $0.90 per 5 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type SeedanceVideoModel = keyof typeof SEEDANCE_VIDEO_MODELS;

export const SEEDANCE_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type SeedanceAspectRatio = typeof SEEDANCE_ASPECT_RATIOS[number];
