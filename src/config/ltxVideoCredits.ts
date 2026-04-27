import { Currency } from './pricing';

export const LTX_VIDEO_MODELS = {
  'ltx-standard': {
    name: 'LTX Video 2.0',
    provider: 'Lightricks (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.08,
      USD: 0.08,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Schnelle, günstige Generierung ab 0,32€ pro 4 Sekunden',
      USD: 'Fast and affordable from $0.32 per 4 seconds',
    },
    badge: 'Schnell & Günstig',
  },
  'ltx-pro': {
    name: 'LTX Video 2.0 Pro',
    provider: 'Lightricks (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.12,
      USD: 0.12,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Premium 1080p-Qualität ab 0,48€ pro 4 Sekunden',
      USD: 'Premium 1080p quality from $0.48 per 4 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type LTXVideoModel = keyof typeof LTX_VIDEO_MODELS;

export const LTX_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type LTXAspectRatio = typeof LTX_ASPECT_RATIOS[number];
