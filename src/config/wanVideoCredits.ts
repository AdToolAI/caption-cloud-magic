import { Currency } from './pricing';

// Margin policy: Replicate $0.04/$0.07 per second → user 0.12/0.20 €/s (~67/65% margin)
export const WAN_VIDEO_MODELS = {
  'wan-standard': {
    name: 'Wan 2.5 Standard',
    provider: 'Wan Video (Replicate)',
    quality: '720p',
    version: '2.5',
    costPerSecond: {
      EUR: 0.12,
      USD: 0.12,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: 'Schnelle AI-Videos ab 0,60€ pro 5 Sekunden',
      USD: 'Fast AI videos from $0.60 per 5 seconds',
    },
    badge: 'Standard',
  },
  'wan-pro': {
    name: 'Wan 2.5 Pro',
    provider: 'Wan Video (Replicate)',
    quality: '1080p',
    version: '2.5',
    costPerSecond: {
      EUR: 0.20,
      USD: 0.20,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: 'Premium 1080p-Qualität ab 1,00€ pro 5 Sekunden',
      USD: 'Premium 1080p quality from $1.00 per 5 seconds',
    },
    badge: 'Premium',
  },
  'wan-2-6-standard': {
    name: 'Wan 2.6 Standard',
    provider: 'Wan Video (Replicate)',
    quality: '720p',
    version: '2.6',
    costPerSecond: {
      EUR: 0.12,
      USD: 0.12,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: 'Verbesserte Motion-Konsistenz · gleiche Preise',
      USD: 'Improved motion consistency · same price',
    },
    badge: 'Neu',
  },
  'wan-2-6-pro': {
    name: 'Wan 2.6 Pro',
    provider: 'Wan Video (Replicate)',
    quality: '1080p',
    version: '2.6',
    costPerSecond: {
      EUR: 0.20,
      USD: 0.20,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: 'Wan 2.6 Pro · 1080p · beste Motion-Konsistenz',
      USD: 'Wan 2.6 Pro · 1080p · best motion consistency',
    },
    badge: 'Neu Premium',
  },
} as const;

export type WanVideoModel = keyof typeof WAN_VIDEO_MODELS;

export const WAN_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type WanAspectRatio = typeof WAN_ASPECT_RATIOS[number];
