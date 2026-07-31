import { Currency } from './pricing';

// Margin policy: exactly 3.00× Replicate cost (normalized 14.07.2026)
// Verifizierte Replicate-Slugs (21.07.2026):
// Mini = seedance-1-lite ($0.02/s → €0.06/s)
// Std  = seedance-2.0-fast ($0.15/s → €0.45/s)
// Pro  = seedance-2.0 ($0.18/s → €0.54/s)
export const SEEDANCE_VIDEO_MODELS = {
  'seedance-mini': {
    name: 'Seedance 1 Lite (Draft)',
    provider: 'ByteDance (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.06,
      USD: 0.06,
    },
    minDuration: 3,
    maxDuration: 15,
    description: {
      EUR: 'Günstiger Draft-Renderer, 720p — ab 0,30€ pro 5 Sekunden',
      USD: 'Low-cost draft renderer, 720p — from $0.30 per 5 seconds',
    },
    badge: 'Schnell & Günstig',
  },
  'seedance-standard': {
    name: 'Seedance 2.0 Fast',
    provider: 'ByteDance (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.45,
      USD: 0.45,
    },
    minDuration: 3,
    maxDuration: 15,
    description: {
      EUR: 'Seedance 2.0 Fast · 720p — ab 2,25€ pro 5 Sekunden',
      USD: 'Seedance 2.0 Fast · 720p — from $2.25 per 5 seconds',
    },
    badge: 'Empfohlen',
  },
  'seedance-pro': {
    name: 'Seedance 2.0',
    provider: 'ByteDance (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.54,
      USD: 0.54,
    },
    minDuration: 3,
    maxDuration: 15,
    description: {
      EUR: 'Seedance 2.0 Flagship · 720p — ab 2,70€ pro 5 Sekunden',
      USD: 'Seedance 2.0 flagship · 720p — from $2.70 per 5 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type SeedanceVideoModel = keyof typeof SEEDANCE_VIDEO_MODELS;

export const SEEDANCE_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type SeedanceAspectRatio = typeof SEEDANCE_ASPECT_RATIOS[number];
