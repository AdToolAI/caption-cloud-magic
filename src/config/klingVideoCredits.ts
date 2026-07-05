import { Currency } from './pricing';

// Margin policy: Replicate $0.06/$0.10 per second → user 0.18/0.28 €/s (~67/64% margin)
export const KLING_VIDEO_MODELS = {
  'kling-3-standard': {
    name: 'Kling 3.0 Standard',
    provider: 'Kuaishou (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.18,
      USD: 0.18,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: 'Hochwertige AI-Videos ab 0,90€ pro 5 Sekunden',
      USD: 'High-quality AI videos from $0.90 per 5 seconds',
    },
    badge: 'Empfohlen',
  },
  'kling-3-pro': {
    name: 'Kling 3.0 Pro',
    provider: 'Kuaishou (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.28,
      USD: 0.28,
    },
    minDuration: 3,
    maxDuration: 15,
    description: {
      EUR: 'Premium 1080p-Qualität ab 1,40€ pro 5 Sekunden',
      USD: 'Premium 1080p quality from $1.40 per 5 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type KlingVideoModel = keyof typeof KLING_VIDEO_MODELS;

export const KLING_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type KlingAspectRatio = typeof KLING_ASPECT_RATIOS[number];

export const KLING_GENERATION_MODES = ['text-to-video', 'image-to-video', 'video-to-video'] as const;
export type KlingGenerationMode = typeof KLING_GENERATION_MODES[number];

export const KLING_VIDEO_REFERENCE_TYPES = ['feature', 'base'] as const;
export type KlingVideoReferenceType = typeof KLING_VIDEO_REFERENCE_TYPES[number];
