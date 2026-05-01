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
 * We expose two tiers (Standard 720p, Pro 1080p) with healthy margin
 * matching the Kling 3 family.
 */

export const HAPPYHORSE_VIDEO_MODELS = {
  'happyhorse-standard': {
    name: 'HappyHorse 1.0',
    provider: 'Alibaba (Replicate)',
    resolution: '720p',
    // Replicate $0.14/s → user €0.18/s (~22% margin, same band as Hailuo Std)
    costPerSecond: { EUR: 0.18, USD: 0.18 },
    minDuration: 3,
    maxDuration: 15,
    description: 'Multi-shot consistency · 720p · 3-15s',
    badge: 'Neu',
  },
  'happyhorse-pro': {
    name: 'HappyHorse 1.0 Pro',
    provider: 'Alibaba (Replicate)',
    resolution: '1080p',
    // Replicate $0.28/s → user €0.34/s (~21% margin, same band as Kling Pro)
    costPerSecond: { EUR: 0.34, USD: 0.34 },
    minDuration: 3,
    maxDuration: 15,
    description: 'Multi-shot consistency · 1080p · 3-15s',
    badge: 'Premium',
  },
} as const;

export type HappyHorseVideoModelId = keyof typeof HAPPYHORSE_VIDEO_MODELS;
