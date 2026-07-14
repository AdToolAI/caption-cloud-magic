import { Currency } from './pricing';

// Margin policy: exactly 3.00× Replicate cost (normalized 14.07.2026)
// Std: $0.06/s → €0.18/s | Pro: $0.10/s → €0.30/s
export const KLING_VIDEO_MODELS = {
  'kling-3-standard': {
    name: 'Kling 3.0 Standard',
    provider: 'Kuaishou (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.18,
      USD: 0.18,
    },
    minDuration: 3,
    maxDuration: 15,
    allowedDurations: [3, 5, 8, 10, 15] as const,
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
      EUR: 0.30,
      USD: 0.30,
    },
    minDuration: 3,
    maxDuration: 15,
    allowedDurations: [3, 5, 8, 10, 15] as const,
    description: {
      EUR: 'Premium 1080p-Qualität ab 1,50€ pro 5 Sekunden',
      USD: 'Premium 1080p quality from $1.50 per 5 seconds',
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
