import { Currency } from './pricing';

export const HAILUO_VIDEO_MODELS = {
  'hailuo-standard': {
    name: 'Hailuo 2.3 Standard',
    provider: 'MiniMax (Replicate)',
    quality: '768p',
    costPerSecond: {
      EUR: 0.15,
      USD: 0.15,
    },
    minDuration: 6,
    maxDuration: 10,
    allowedDurations: [6, 10] as const,
    allowedResolutions: ['768p', '1080p'] as const,
    description: {
      EUR: 'Realistische AI-Videos ab 0,90€ pro 6 Sekunden',
      USD: 'Realistic AI videos from $0.90 per 6 seconds',
    },
    badge: 'Empfohlen',
  },
  'hailuo-pro': {
    name: 'Hailuo 2.3 Pro',
    provider: 'MiniMax (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.20,
      USD: 0.20,
    },
    minDuration: 6,
    maxDuration: 10,
    allowedDurations: [6, 10] as const,
    allowedResolutions: ['768p', '1080p'] as const,
    description: {
      EUR: 'Premium 1080p-Qualität ab 1,20€ pro 6 Sekunden',
      USD: 'Premium 1080p quality from $1.20 per 6 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type HailuoVideoModel = keyof typeof HAILUO_VIDEO_MODELS;

export const HAILUO_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type HailuoAspectRatio = typeof HAILUO_ASPECT_RATIOS[number];

export type HailuoResolution = '768p' | '1080p';
