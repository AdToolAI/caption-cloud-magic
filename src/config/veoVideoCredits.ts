import { tx } from "@/lib/i18nText";
import { Currency } from './pricing';

/**
 * Google Veo 3.1 Pricing — alle 4 Varianten
 * Pricing policy (20.08.2026): sell prices cut by 35% vs. the old 3.00x catalog; margin floor is now 1.75x provider cost. Canonical source: src/lib/cost/videoPricingCatalog.ts
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
      EUR: 0.32,
      USD: 0.32,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: tx({ de: 'Native Audio + 720p Video ab 1,28 € pro 4 Sekunden', en: 'Native audio + 720p video from €1.28 per 4 seconds', es: 'Audio nativo + vídeo 720p desde 1,28 € los 4 segundos' }),
      USD: 'Native Audio + 720p Video from $1.28 per 4 seconds',
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
      EUR: 0.475,
      USD: 0.475,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: tx({ de: '1080p Lite mit Audio ab 1,90 € pro 4 Sekunden', en: '1080p Lite with audio from €1.90 per 4 seconds', es: '1080p Lite con audio desde 1,90 € los 4 segundos' }),
      USD: '1080p Lite with audio from $1.90 per 4 seconds',
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
      EUR: 0.86,
      USD: 0.86,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: tx({ de: 'Schnelle 1080p-Generierung ab 3,44 € pro 4 Sekunden', en: 'Fast 1080p generation from €3.44 per 4 seconds', es: 'Generación rápida de 1080p desde 3,44 € por 4 segundos' }),
      USD: 'Fast 1080p generation from $3.44 per 4 seconds',
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
      EUR: 2.365,
      USD: 2.365,
    },
    minDuration: 4,
    maxDuration: 8,
    allowedDurations: [4, 6, 8] as const,
    description: {
      EUR: tx({ de: 'Premium Cinematic 1080p ab 9,46 € pro 4 Sekunden', en: 'Premium Cinematic 1080p from €9.46 per 4 seconds', es: 'Cinemático Premium 1080p desde 9,46 € los 4 segundos' }),
      USD: 'Premium Cinematic 1080p from $9.46 per 4 seconds',
    },
    badge: '👑 Premium-Engine',
  },
} as const;

export type VeoVideoModel = keyof typeof VEO_VIDEO_MODELS;

export const VEO_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export type VeoAspectRatio = typeof VEO_ASPECT_RATIOS[number];
