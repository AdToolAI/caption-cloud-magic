import { tx } from "@/lib/i18nText";
import { Currency } from './pricing';

// Margin policy: exactly 3.00× Replicate cost (normalized 14.07.2026)
// $0.05/s → €0.15/s (xai/grok-imagine-video)
export const GROK_VIDEO_MODELS = {
  'grok-imagine': {
    name: 'Grok Imagine',
    provider: 'xAI (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.15,
      USD: 0.15,
    },
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 6, 10, 12, 15] as const,
    description: {
      EUR: tx({ de: 'Trending AI-Videos mit nativer Audio-Spur ab 2,70€ pro 6 Sekunden', en: 'Trending AI videos with native audio track from €2.70 per 6 seconds', es: 'Vídeos de IA de tendencia con pista de audio nativa desde 2,70 € por 6 segundos' }),
      USD: 'Trending AI videos with native audio from $2.70 per 6 seconds',
    },
    badge: 'Premium-Engine',
  },
} as const;

export type GrokVideoModel = keyof typeof GROK_VIDEO_MODELS;

export const GROK_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'] as const;
export type GrokAspectRatio = typeof GROK_ASPECT_RATIOS[number];
