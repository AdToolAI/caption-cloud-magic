import { Currency } from './pricing';

/**
 * Google Veo 3.1 Pricing — alle 4 Varianten
 * Basis: Replicate Listenpreis (USD/s, Stand Juni 2026) → Verkaufspreis ~65% Marge
 *
 * | Variante     | Replicate $/s | Verkauf €/s | Marge |
 * | lite-720p    | 0.15          | 0.42        | 64%   |
 * | lite-1080p   | 0.22          | 0.62        | 65%   |
 * | fast         | 0.40          | 1.15        | 65%   |
 * | pro          | 1.10          | 3.15        | 65%   |
 */
export const VEO_VIDEO_MODELS = {
  'veo-3.1-lite-720p': {
    name: 'Veo 3.1 Lite 720p',
    provider: 'Google (Replicate)',
    quality: '720p',
    replicateModel: 'google/veo-3.1-fast',
    resolution: '720p' as const,
    costPerSecond: {
      EUR: 0.42,
      USD: 0.42,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Native Audio + 720p Video ab 1,68€ pro 4 Sekunden',
      USD: 'Native Audio + 720p Video from $1.68 per 4 seconds',
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
      EUR: 0.62,
      USD: 0.62,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: '1080p Lite mit Audio ab 2,48€ pro 4 Sekunden',
      USD: '1080p Lite with audio from $2.48 per 4 seconds',
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
      EUR: 1.15,
      USD: 1.15,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Schnelle 1080p-Generierung ab 4,60€ pro 4 Sekunden',
      USD: 'Fast 1080p generation from $4.60 per 4 seconds',
    },
    badge: '⚡ Premium-Engine',
  },
  'veo-3.1-pro': {
    name: 'Veo 3.1 Pro',
    provider: 'Google (Replicate)',
    quality: '1080p',
    replicateModel: 'google/veo-3.1',
    resolution: '1080p' as const,
    costPerSecond: {
      EUR: 3.15,
      USD: 3.15,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Premium Cinematic 1080p ab 12,60€ pro 4 Sekunden',
      USD: 'Premium Cinematic 1080p from $12.60 per 4 seconds',
    },
    badge: '👑 Premium-Engine',
  },
} as const;

export type VeoVideoModel = keyof typeof VEO_VIDEO_MODELS;

export const VEO_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export type VeoAspectRatio = typeof VEO_ASPECT_RATIOS[number];
