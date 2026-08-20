import { tx } from "@/lib/i18nText";
import { Currency } from './pricing';

// Pricing policy (20.08.2026): sell prices cut by 35% vs. the old 3.00x catalog; margin floor is now 1.75x provider cost. Canonical source: src/lib/cost/videoPricingCatalog.ts
// Verifizierte Replicate-Slugs (21.07.2026):
export const SEEDANCE_VIDEO_MODELS = {
  'seedance-mini': {
    name: 'Seedance 1 Lite (Draft)',
    provider: 'ByteDance (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.04,
      USD: 0.04,
    },
    minDuration: 3,
    maxDuration: 15,
    description: {
      EUR: tx({ de: 'Günstiger Draft-Renderer, 720p — ab 0,20€ pro 5 Sekunden', en: 'Cheap draft renderer, 720p — from €0.20 per 5 seconds', es: 'Renderizador de borradores económico, 720p: desde 0,20 € por 5 segundos' }),
      USD: 'Low-cost draft renderer, 720p — from $0.30 per 5 seconds',
    },
    badge: tx({ de: "Schnell & Günstig", en: "Fast & Affordable", es: "Rápido y Económico" }),
  },
  'seedance-standard': {
    name: 'Seedance 2.0 Fast',
    provider: 'ByteDance (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.29,
      USD: 0.29,
    },
    minDuration: 3,
    maxDuration: 15,
    description: {
      EUR: tx({ de: 'Seedance 2.0 Fast · 720p — ab 1,45€ pro 5 Sekunden', en: 'Seedance 2.0 Fast · 720p — from €1.45 per 5 seconds', es: 'Seedance 2.0 Fast · 720p — desde 1,45 € por 5 segundos' }),
      USD: 'Seedance 2.0 Fast · 720p — from $2.25 per 5 seconds',
    },
    badge: 'Empfohlen',
  },
  'seedance-pro': {
    name: 'Seedance 2.0',
    provider: 'ByteDance (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.35,
      USD: 0.35,
    },
    minDuration: 3,
    maxDuration: 15,
    description: {
      EUR: tx({ de: 'Seedance 2.0 Flagship · 720p — ab 1,75€ pro 5 Sekunden', en: 'Seedance 2.0 Flagship · 720p — from €1.75 per 5 seconds', es: 'Seedance 2.0 Flagship · 720p — desde 1,75 € por 5 segundos' }),
      USD: 'Seedance 2.0 flagship · 720p — from $2.70 per 5 seconds',
    },
    badge: 'Premium',
  },
  // Seedance 2.5 — direkte ByteDance ModelArk API (nicht Replicate).
  // Long-Form: bis 30 s pro Szene, 1080p, First/Last-Frame + Multi-Reference.
  'seedance-2-5': {
    name: 'Seedance 2.5',
    provider: 'ByteDance (ModelArk)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.3983,
      USD: 0.3983,
    },
    minDuration: 4,
    maxDuration: 30,
    description: {
      EUR: tx({ de: 'Seedance 2.5 · bis 30 s pro Szene — 720p 11,95€ / 480p 6,95€ pro 30 Sekunden', en: 'Seedance 2.5 · up to 30 s per scene — 720p €11.95 / 480p €6.95 per 30 seconds', es: 'Seedance 2.5 · hasta 30 s por escena — 720p 11,95 € / 480p 6,95 € por 30 segundos' }),
      USD: 'Seedance 2.5 · 720p · up to 30 s per scene — $19.90 for 30 seconds',
    },
    badge: 'New',
  },
} as const;


export type SeedanceVideoModel = keyof typeof SEEDANCE_VIDEO_MODELS;

export const SEEDANCE_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type SeedanceAspectRatio = typeof SEEDANCE_ASPECT_RATIOS[number];
