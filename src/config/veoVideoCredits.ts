import { Currency } from './pricing';

/**
 * Google Veo 3.1 Pricing — alle 4 Varianten
 * Basis: Replicate Listenpreis (USD/s, Juni 2026) → Verkaufspreis exakt 3.00× (normalisiert 14.07.2026)
 *
 * | Variante     | Replicate $/s | Verkauf €/s |
 * | lite-720p    | 0.15          | 0.45        |
 * | lite-1080p   | 0.22          | 0.66        |
 * | fast         | 0.40          | 1.20        |
 * | pro          | 1.10          | 3.30        |
 */
export const VEO_VIDEO_MODELS = {
  'veo-3.1-lite-720p': {
    name: 'Veo 3.1 Lite 720p',
    provider: 'Google (Replicate)',
    quality: '720p',
    replicateModel: 'google/veo-3.1-fast',
    resolution: '720p' as const,
    costPerSecond: {
      EUR: 0.45,
      USD: 0.45,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Native Audio + 720p Video ab 1,80€ pro 4 Sekunden',
      USD: 'Native Audio + 720p Video from $1.80 per 4 seconds',
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
      EUR: 0.66,
      USD: 0.66,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: '1080p Lite mit Audio ab 2,64€ pro 4 Sekunden',
      USD: '1080p Lite with audio from $2.64 per 4 seconds',
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
      EUR: 1.20,
      USD: 1.20,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Schnelle 1080p-Generierung ab 4,80€ pro 4 Sekunden',
      USD: 'Fast 1080p generation from $4.80 per 4 seconds',
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
      EUR: 3.30,
      USD: 3.30,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: 'Premium Cinematic 1080p ab 13,20€ pro 4 Sekunden',
      USD: 'Premium Cinematic 1080p from $13.20 per 4 seconds',
    },
    badge: '👑 Premium-Engine',
  },
} as const;

export type VeoVideoModel = keyof typeof VEO_VIDEO_MODELS;

export const VEO_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export type VeoAspectRatio = typeof VEO_ASPECT_RATIOS[number];
