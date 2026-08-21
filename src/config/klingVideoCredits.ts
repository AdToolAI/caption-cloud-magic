import { tx } from "@/lib/i18nText";
import { Currency } from './pricing';

// Pricing policy (20.08.2026): sell prices cut by 35% vs. the old 3.00x catalog; margin floor is now 1.75x provider cost. Canonical source: src/lib/cost/videoPricingCatalog.ts
// Prices here MUST match _shared/videoPricingCatalog.ts — the backend reads
// from the catalog, and the frontend reads from useVideoPricingCatalog() with
// this file as fallback only.
export const KLING_VIDEO_MODELS = {
  'kling-2.5-turbo': {
    name: 'Kling 2.5 Turbo Pro',
    provider: 'Kuaishou (Replicate)',
    quality: '720p',
    costPerSecond: { EUR: 0.07, USD: 0.07 },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 8, 10] as const,
    description: {
      EUR: tx({ de: 'Schneller Draft-Cut ab 0,35 € pro 5 Sekunden', en: 'Fast draft cut from €0.35 per 5 seconds', es: 'Reducción rápida del borrador desde 0,35 € cada 5 segundos' }),
      USD: 'Fast draft cut from $0.35 per 5 seconds',
    },
    badge: 'Fast',
  },
  'kling-2.6': {
    name: 'Kling 2.6',
    provider: 'Kuaishou (Replicate)',
    quality: '1080p',
    costPerSecond: { EUR: 0.09, USD: 0.09 },
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 8, 10, 15] as const,
    description: {
      EUR: tx({ de: 'Sweet Spot mit Ambient-Audio ab 0,45 € pro 5 Sekunden', en: 'Sweet Spot with ambient audio from €0.45 per 5 seconds', es: 'Sweet Spot con audio ambiental desde 0,45 € los 5 segundos' }),
      USD: 'Sweet spot with ambient audio from $0.45 per 5 seconds',
    },
    badge: 'Ambient Audio',
  },
  'kling-3': {
    name: 'Kling 3.0',
    provider: 'Kuaishou (Replicate)',
    quality: '1080p',
    costPerSecond: { EUR: 0.135, USD: 0.135 },
    minDuration: 3,
    maxDuration: 15,
    allowedDurations: [3, 5, 8, 10, 15] as const,
    description: {
      EUR: tx({ de: 'Kling 3.0 · 1080p · 0,68 € pro 5 Sekunden', en: 'Sound 3.0 · 1080p · €0.68 per 5 seconds', es: 'Sonido 3.0 · 1080p · 0,68 € por 5 segundos' }),
      USD: 'Kling 3.0 · 1080p · $0.68 per 5 seconds',
    },
    badge: 'Empfohlen',
  },
  'kling-omni': {
    name: 'Kling 3.0 Omni',
    provider: 'Kuaishou (Replicate)',
    quality: '1080p · Native Lip-Sync EN',
    costPerSecond: { EUR: 0.43, USD: 0.43 },
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 8, 10, 15] as const,
    description: {
      EUR: tx({ de: 'Native Lip-Sync auf Englisch · DE/ES silent-only · 2,15 € pro 5 Sekunden', en: 'Native Lip-Sync in English · DE/ES silent-only · €2.15 per 5 seconds', es: 'Lip-Sync nativo en inglés · DE/ES solo en silencio · 2,15 € por 5 segundos' }),
      USD: 'Native lip-sync in English · DE/ES silent-only · $2.15 per 5 seconds',
    },
    badge: 'Lip-Sync EN',
  },
} as const;

export type KlingVideoModel = keyof typeof KLING_VIDEO_MODELS;

export const KLING_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type KlingAspectRatio = typeof KLING_ASPECT_RATIOS[number];

export const KLING_GENERATION_MODES = ['text-to-video', 'image-to-video', 'video-to-video'] as const;
export type KlingGenerationMode = typeof KLING_GENERATION_MODES[number];

export const KLING_VIDEO_REFERENCE_TYPES = ['feature', 'base'] as const;
export type KlingVideoReferenceType = typeof KLING_VIDEO_REFERENCE_TYPES[number];
