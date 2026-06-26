import { Currency } from './pricing';

// Margin policy: Replicate ~$0.15/s → user €0.42/s (~64% margin) — Premium-Engine tier
export const GROK_VIDEO_MODELS = {
  'grok-imagine': {
    name: 'Grok Imagine',
    provider: 'xAI (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.42,
      USD: 0.42,
    },
    minDuration: 6,
    maxDuration: 12,
    allowedDurations: [6, 12] as const,
    description: {
      EUR: 'Trending AI-Videos mit nativer Audio-Spur ab 2,52€ pro 6 Sekunden',
      USD: 'Trending AI videos with native audio from $2.52 per 6 seconds',
    },
    badge: 'Premium-Engine',
  },
} as const;

export type GrokVideoModel = keyof typeof GROK_VIDEO_MODELS;

export const GROK_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type GrokAspectRatio = typeof GROK_ASPECT_RATIOS[number];
