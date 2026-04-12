import { Currency } from './pricing';

export const WAN_VIDEO_MODELS = {
  'wan-standard': {
    name: 'Wan 2.1 Standard',
    provider: 'WaveSpeed (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.10,
      USD: 0.10,
    },
    minDuration: 3,
    maxDuration: 12,
    description: {
      EUR: 'Schnelle AI-Videos ab 0,50€ pro 5 Sekunden',
      USD: 'Fast AI videos from $0.50 per 5 seconds',
    },
    badge: 'Empfohlen',
  },
  'wan-pro': {
    name: 'Wan 2.1 Pro',
    provider: 'WaveSpeed (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.15,
      USD: 0.15,
    },
    minDuration: 3,
    maxDuration: 12,
    description: {
      EUR: 'Premium 1080p-Qualität ab 0,75€ pro 5 Sekunden',
      USD: 'Premium 1080p quality from $0.75 per 5 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type WanVideoModel = keyof typeof WAN_VIDEO_MODELS;

export const WAN_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type WanAspectRatio = typeof WAN_ASPECT_RATIOS[number];
