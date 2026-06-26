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
 * Pricing policy: ~65% margin (aligned with rest of video provider suite).
 *   - Standard 720p:  $0.14/s → €0.40/s (65%)
 *   - Pro 1080p:      $0.28/s → €0.80/s (65%)
 */

export const HAPPYHORSE_VIDEO_MODELS = {
  'happyhorse-standard': {
    name: 'HappyHorse 1.0',
    provider: 'Alibaba (Replicate)',
    resolution: '720p',
    // Replicate $0.14/s → user €0.40/s (65% margin)
    costPerSecond: { EUR: 0.40, USD: 0.40 },
    minDuration: 3,
    maxDuration: 15,
    description: 'Multi-shot consistency · 720p · 3-15s',
    badge: 'Neu',
  },
  'happyhorse-pro': {
    name: 'HappyHorse 1.0 Pro',
    provider: 'Alibaba (Replicate)',
    resolution: '1080p',
    // Replicate $0.28/s → user €0.80/s (65% margin)
    costPerSecond: { EUR: 0.80, USD: 0.80 },
    minDuration: 3,
    maxDuration: 15,
    description: 'Multi-shot consistency · 1080p · 3-15s',
    badge: 'Premium',
  },
} as const;

export type HappyHorseVideoModelId = keyof typeof HAPPYHORSE_VIDEO_MODELS;
