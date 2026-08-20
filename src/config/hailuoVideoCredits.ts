import { tx } from "@/lib/i18nText";
import { Currency } from './pricing';

export const HAILUO_VIDEO_MODELS = {
  'hailuo-standard': {
    name: 'Hailuo 2.3 Standard',
    provider: 'MiniMax (Replicate)',
    quality: '768p',
    costPerSecond: {
      EUR: 0.09,
      USD: 0.09,
    },
    minDuration: 6,
    maxDuration: 10,
    allowedDurations: [6, 10] as const,
    allowedResolutions: ['768p', '1080p'] as const,
    description: {
      EUR: tx({ de: 'Realistische AI-Videos ab 0,54€ pro 6 Sekunden', en: 'Realistic AI videos from €0.54 per 6 seconds', es: 'Vídeos realistas con IA desde 0,54€ cada 6 segundos' }),
      USD: 'Realistic AI videos from $0.84 per 6 seconds',
    },
    badge: 'Empfohlen',
  },
  'hailuo-pro': {
    name: 'Hailuo 2.3 Pro',
    provider: 'MiniMax (Replicate)',
    quality: '1080p',
    // Pricing policy (20.08.2026): sell prices cut by 35% vs. the old 3.00x catalog; margin floor is now 1.75x provider cost. Canonical source: src/lib/cost/videoPricingCatalog.ts
    costPerSecond: {
      EUR: 0.15,
      USD: 0.15,
    },
    minDuration: 6,
    maxDuration: 10,
    allowedDurations: [6, 10] as const,
    allowedResolutions: ['768p', '1080p'] as const,
    description: {
      EUR: tx({ de: 'Premium 1080p-Qualität ab 0,90€ pro 6 Sekunden', en: 'Premium 1080p quality from €0.90 per 6 seconds', es: 'Calidad premium 1080p desde 0,90€ por 6 segundos' }),
      USD: 'Premium 1080p quality from $1.38 per 6 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type HailuoVideoModel = keyof typeof HAILUO_VIDEO_MODELS;

export const HAILUO_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type HailuoAspectRatio = typeof HAILUO_ASPECT_RATIOS[number];

export type HailuoResolution = '768p' | '1080p';
