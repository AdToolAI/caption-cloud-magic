import { tx } from "@/lib/i18nText";
import { Currency } from './pricing';

export const HAILUO_VIDEO_MODELS = {
  'hailuo-standard': {
    name: 'Hailuo 2.3 Standard',
    provider: 'MiniMax (Replicate)',
    quality: '768p',
    costPerSecond: {
      EUR: 0.1,
      USD: 0.1,
    },
    minDuration: 6,
    maxDuration: 10,
    allowedDurations: [6, 10] as const,
    allowedResolutions: ['768p', '1080p'] as const,
    description: {
      EUR: tx({ de: 'Realistische AI-Videos ab 0,60 € pro 6 Sekunden', en: 'Realistic AI videos from €0.60 per 6 seconds', es: 'Vídeos realistas con IA desde 0,60 € cada 6 segundos' }),
      USD: 'Realistic AI videos from $0.60 per 6 seconds',
    },
    badge: 'Empfohlen',
  },
  'hailuo-pro': {
    name: 'Hailuo 2.3 Pro',
    provider: 'MiniMax (Replicate)',
    quality: '1080p',
    // Pricing policy (20.08.2026): sell prices cut by 35% vs. the old 3.00x catalog; margin floor is now 1.75x provider cost. Canonical source: src/lib/cost/videoPricingCatalog.ts
    costPerSecond: {
      EUR: 0.165,
      USD: 0.165,
    },
    minDuration: 6,
    maxDuration: 10,
    allowedDurations: [6, 10] as const,
    allowedResolutions: ['768p', '1080p'] as const,
    description: {
      EUR: tx({ de: 'Premium 1080p-Qualität ab 0,99 € pro 6 Sekunden', en: 'Premium 1080p quality from €0.99 per 6 seconds', es: 'Calidad premium 1080p desde 0,99 € por 6 segundos' }),
      USD: 'Premium 1080p quality from $0.99 per 6 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type HailuoVideoModel = keyof typeof HAILUO_VIDEO_MODELS;

export const HAILUO_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type HailuoAspectRatio = typeof HAILUO_ASPECT_RATIOS[number];

export type HailuoResolution = '768p' | '1080p';
