import { Currency } from './pricing';

export const VEO_VIDEO_MODELS = {
  'veo-3.1-lite': {
    name: 'Veo 3.1 Lite',
    provider: 'Google (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.40,
      USD: 0.40,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Native Audio + Video ab 1,60€ pro 4 Sekunden',
      USD: 'Native Audio + Video from $1.60 per 4 seconds',
    },
    badge: '🎵 Native Audio',
  },
  'veo-3.1': {
    name: 'Veo 3.1 Pro',
    provider: 'Google (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.65,
      USD: 0.65,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Premium 1080p mit Audio ab 2,60€ pro 4 Sekunden',
      USD: 'Premium 1080p with audio from $2.60 per 4 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type VeoVideoModel = keyof typeof VEO_VIDEO_MODELS;

export const VEO_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export type VeoAspectRatio = typeof VEO_ASPECT_RATIOS[number];
