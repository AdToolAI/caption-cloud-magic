import { tx } from "@/lib/i18nText";
import { Currency } from './pricing';

// Margin policy: exactly 3.00× Replicate cost (normalized 14.07.2026)
// LTX 2.3: fast $0.06/s → €0.18/s | pro $0.08/s → €0.24/s
export const LTX_VIDEO_MODELS = {
  'ltx-standard': {
    name: 'LTX 2.3 Fast',
    provider: 'Lightricks (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.12,
      USD: 0.12,
    },
    minDuration: 6,
    maxDuration: 20,
    allowedDurations: [6, 8, 10, 12, 14, 16, 18, 20] as const,
    description: {
      EUR: tx({ de: 'Schnelle, günstige Generierung ab 0,48€ pro 4 Sekunden', en: 'Fast, cheap generation from €0.48 per 4 seconds', es: 'Generación rápida y económica desde 0,48€ cada 4 segundos' }),
      USD: 'Fast and affordable from $0.24 per 4 seconds',
    },
    badge: tx({ de: "Schnell & Günstig", en: "Fast & Affordable", es: "Rápido y Económico" }),
  },
  'ltx-pro': {
    name: 'LTX 2.3 Pro',
    provider: 'Lightricks (Replicate)',
    quality: '1080p',
    costPerSecond: {
      EUR: 0.16,
      USD: 0.16,
    },
    minDuration: 6,
    maxDuration: 10,
    allowedDurations: [6, 8, 10] as const,
    description: {
      EUR: tx({ de: 'Premium 1080p-Qualität ab 0,64€ pro 4 Sekunden', en: 'Premium 1080p quality from €0.64 per 4 seconds', es: 'Calidad premium 1080p desde 0,64€ por 4 segundos' }),
      USD: 'Premium 1080p quality from $0.48 per 4 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type LTXVideoModel = keyof typeof LTX_VIDEO_MODELS;

export const LTX_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export type LTXAspectRatio = typeof LTX_ASPECT_RATIOS[number];
