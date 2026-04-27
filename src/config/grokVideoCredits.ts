import { Currency } from './pricing';

export const GROK_VIDEO_MODELS = {
  'grok-imagine': {
    name: 'Grok Imagine',
    provider: 'xAI (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.20,
      USD: 0.20,
    },
    minDuration: 6,
    maxDuration: 12,
    allowedDurations: [6, 12] as const,
    description: {
      EUR: 'Trending AI-Videos mit nativer Audio-Spur ab 1,20€ pro 6 Sekunden',
      USD: 'Trending AI videos with native audio from $1.20 per 6 seconds',
    },
    badge: 'Trending',
  },
} as const;

export type GrokVideoModel = keyof typeof GROK_VIDEO_MODELS;

export const GROK_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type GrokAspectRatio = typeof GROK_ASPECT_RATIOS[number];
