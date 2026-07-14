import { Currency } from './pricing';

// Margin policy: exactly 3.00× Replicate cost (normalized 14.07.2026)
// Std: $0.02/s → €0.06/s | Pro: $0.04/s → €0.12/s
export const LTX_VIDEO_MODELS = {
  'ltx-standard': {
    name: 'LTX Video 2.0',
    provider: 'Lightricks (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.06,
      USD: 0.06,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Schnelle, günstige Generierung ab 0,24€ pro 4 Sekunden',
      USD: 'Fast and affordable from $0.24 per 4 seconds',
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
