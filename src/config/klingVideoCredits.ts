import { Currency } from './pricing';

// Margin policy: exactly 3.00× Replicate cost (updated 14.07.2026 for Kling 3.0 Omni).
// Prices here MUST match _shared/videoPricingCatalog.ts — the backend reads
// from the catalog, and the frontend reads from useVideoPricingCatalog() with
// this file as fallback only.
export const KLING_VIDEO_MODELS = {
  'kling-2.5-turbo': {
    name: 'Kling 2.5 Turbo Pro',
    provider: 'Kuaishou (Replicate)',
    quality: '720p',
    costPerSecond: { EUR: 0.09, USD: 0.09 },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 8, 10] as const,
    description: {
      EUR: 'Schneller Draft-Cut ab 0,45 € pro 5 Sekunden',
      USD: 'Fast draft cut from $0.45 per 5 seconds',
    },
    badge: 'Fast',
  },
  'kling-2.6': {
    name: 'Kling 2.6',
    provider: 'Kuaishou (Replicate)',
    quality: '1080p',
    costPerSecond: { EUR: 0.12, USD: 0.12 },
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 8, 10, 15] as const,
    description: {
      EUR: 'Sweet Spot mit Ambient-Audio ab 0,60 € pro 5 Sekunden',
      USD: 'Sweet spot with ambient audio from $0.60 per 5 seconds',
    },
    badge: 'Ambient Audio',
  },
  'kling-3': {
    name: 'Kling 3.0',
    provider: 'Kuaishou (Replicate)',
    quality: '1080p',
    costPerSecond: { EUR: 0.18, USD: 0.18 },
    minDuration: 3,
    maxDuration: 15,
    allowedDurations: [3, 5, 8, 10, 15] as const,
    description: {
      EUR: 'Kling 3.0 · 1080p · 0,90 € pro 5 Sekunden',
      USD: 'Kling 3.0 · 1080p · $0.90 per 5 seconds',
    },
    badge: 'Empfohlen',
  },
  'kling-omni': {
    name: 'Kling 3.0 Omni',
    provider: 'Kuaishou (Replicate)',
    quality: '1080p · Native Lip-Sync EN',
    costPerSecond: { EUR: 0.60, USD: 0.60 },
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 8, 10, 15] as const,
    description: {
      EUR: 'Native Lip-Sync auf Englisch · DE/ES silent-only · 3,00 € pro 5 Sekunden',
      USD: 'Native lip-sync in English · DE/ES silent-only · $3.00 per 5 seconds',
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
