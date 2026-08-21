/**
 * HappyHorse 1.0 Pricing Reference
 * --------------------------------------------------------------
 * HappyHorse 1.0 from Alibaba — 11th video provider in the unified
 * AI Video Toolkit. Hosted on Replicate (`alibaba/happyhorse-1.0`).
 *
 * Replicate charges per second of output video:
 *   - 720p:  ~$0.14 / s
 *   - 1080p: ~$0.28 / s
 *
 * Pricing policy (20.08.2026): sell prices cut by 35% vs. the old 3.00x catalog; margin floor is now 1.75x provider cost. Canonical source: src/lib/cost/videoPricingCatalog.ts
 */

export const HAPPYHORSE_VIDEO_MODELS = {
  'happyhorse-standard': {
    name: 'HappyHorse 1.0',
    provider: 'Alibaba (Replicate)',
    resolution: '720p',
    costPerSecond: { EUR: 0.3, USD: 0.3 },
    minDuration: 3,
    maxDuration: 15,
    description: 'Multi-shot consistency · 720p · 3-15s',
    badge: 'New',
  },
  'happyhorse-pro': {
    name: 'HappyHorse 1.0 Pro',
    provider: 'Alibaba (Replicate)',
    resolution: '1080p',
    costPerSecond: { EUR: 0.605, USD: 0.605 },
    minDuration: 3,
    maxDuration: 15,
    description: 'Multi-shot consistency · 1080p · 3-15s',
    badge: 'Premium',
  },
} as const;

export type HappyHorseVideoModelId = keyof typeof HAPPYHORSE_VIDEO_MODELS;
