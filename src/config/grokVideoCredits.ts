import { tx } from "@/lib/i18nText";
import { Currency } from './pricing';

// Pricing policy (20.08.2026): sell prices cut by 35% vs. the old 3.00x catalog; margin floor is now 1.75x provider cost. Canonical source: src/lib/cost/videoPricingCatalog.ts
export const GROK_VIDEO_MODELS = {
  'grok-imagine': {
    name: 'Grok Imagine',
    provider: 'xAI (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.11,
      USD: 0.11,
    },
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 6, 10, 12, 15] as const,
    description: {
      EUR: tx({ de: 'Trending AI-Videos mit nativer Audio-Spur ab 0,66 € pro 6 Sekunden', en: 'Trending AI videos with native audio track from €0.66 per 6 seconds', es: 'Vídeos de IA de tendencia con pista de audio nativa desde 0,66 € por 6 segundos' }),
      USD: 'Trending AI videos with native audio from $0.66 per 6 seconds',
    },
    badge: 'Premium-Engine',
  },
} as const;

export type GrokVideoModel = keyof typeof GROK_VIDEO_MODELS;

export const GROK_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'] as const;
export type GrokAspectRatio = typeof GROK_ASPECT_RATIOS[number];
