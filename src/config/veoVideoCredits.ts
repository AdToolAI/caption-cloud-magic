import { Currency } from './pricing';

/**
 * Google Veo 3.1 Pricing — alle 4 Varianten
 * Basis: Replicate Cost (USD) → Verkaufspreis mit ≥70% Marge
 *
 * | Variante     | Replicate $/s | Verkauf €/s | Marge |
 * | lite-720p    | 0.05          | 0.20        | 75%   |
 * | lite-1080p   | 0.08          | 0.30        | 73%   |
 * | fast         | 0.15          | 0.55        | 73%   |
 * | pro          | 0.40          | 1.40        | 71%   |
 */
export const VEO_VIDEO_MODELS = {
  'veo-3.1-lite-720p': {
    name: 'Veo 3.1 Lite 720p',
    provider: 'Google (Replicate)',
    quality: '720p',
    replicateModel: 'google/veo-3.1-fast',
    resolution: '720p' as const,
    costPerSecond: {
      EUR: 0.20,
      USD: 0.20,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Native Audio + 720p Video ab 0,80€ pro 4 Sekunden',
      USD: 'Native Audio + 720p Video from $0.80 per 4 seconds',
    },
    badge: '🎵 Native Audio',
  },
  'veo-3.1-lite-1080p': {
    name: 'Veo 3.1 Lite 1080p',
    provider: 'Google (Replicate)',
    quality: '1080p',
    replicateModel: 'google/veo-3.1-fast',
    resolution: '1080p' as const,
    costPerSecond: {
      EUR: 0.30,
      USD: 0.30,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: '1080p Lite mit Audio ab 1,20€ pro 4 Sekunden',
      USD: '1080p Lite with audio from $1.20 per 4 seconds',
    },
    badge: '🎵 HD Audio',
  },
  'veo-3.1-fast': {
    name: 'Veo 3.1 Fast',
    provider: 'Google (Replicate)',
    quality: '1080p',
    replicateModel: 'google/veo-3.1-fast',
    resolution: '1080p' as const,
    costPerSecond: {
      EUR: 0.55,
      USD: 0.55,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Schnelle 1080p-Generierung ab 2,20€ pro 4 Sekunden',
      USD: 'Fast 1080p generation from $2.20 per 4 seconds',
    },
    badge: '⚡ Fast',
  },
  'veo-3.1-pro': {
    name: 'Veo 3.1 Pro',
    provider: 'Google (Replicate)',
    quality: '1080p',
    replicateModel: 'google/veo-3.1',
    resolution: '1080p' as const,
    costPerSecond: {
      EUR: 1.40,
      USD: 1.40,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Premium Cinematic 1080p ab 5,60€ pro 4 Sekunden',
      USD: 'Premium Cinematic 1080p from $5.60 per 4 seconds',
    },
    badge: '👑 Premium',
  },
} as const;

export type VeoVideoModel = keyof typeof VEO_VIDEO_MODELS;

export const VEO_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export type VeoAspectRatio = typeof VEO_ASPECT_RATIOS[number];
