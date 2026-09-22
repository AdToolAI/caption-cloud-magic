import { tx } from "@/lib/i18nText";
import { Currency } from './pricing';

// Pricing policy (22.09.2026): break-even — prices are derived from provider cost. Canonical source: src/lib/cost/videoPricingCatalog.ts
export const LTX_VIDEO_MODELS = {
  'ltx-standard': {
    name: 'LTX 2.3 Fast',
    provider: 'Lightricks (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.0908,
      USD: 0.0908,
    },
    minDuration: 6,
    maxDuration: 20,
    allowedDurations: [6, 8, 10, 12, 14, 16, 18, 20] as const,
    description: {
      EUR: tx({ de: 'Schnelle, günstige Generierung ab 0,54 € pro 4 Sekunden', en: 'Fast, cheap generation from €0.54 per 4 seconds', es: 'Generación rápida y económica desde 0,54 € cada 4 segundos' }),
      USD: 'Fast and affordable from $0.54 per 4 seconds',
    },
    badge: tx({ de: "Schnell & Günstig", en: "Fast & Affordable", es: "Rápido y Económico" }),
  },
  'ltx-pro': {
    name: 'LTX 2.3 Pro',
    provider: 'Lightricks (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.1211,
      USD: 0.1211,
    },
    minDuration: 6,
    maxDuration: 10,
    allowedDurations: [6, 8, 10] as const,
    description: {
      EUR: tx({ de: 'Premium 1080p-Qualität ab 0,72 € pro 4 Sekunden', en: 'Premium 1080p quality from €0.72 per 4 seconds', es: 'Calidad premium 1080p desde 0,72 € por 4 segundos' }),
      USD: 'Premium 1080p quality from $0.72 per 4 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type LTXVideoModel = keyof typeof LTX_VIDEO_MODELS;

export const LTX_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export type LTXAspectRatio = typeof LTX_ASPECT_RATIOS[number];
