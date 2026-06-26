/**
 * Phase 5.2 — Provider ETA estimation
 *
 * Returns a realistic expected wall-clock duration (in seconds) for a
 * given AI clip provider + quality + scene duration. Used by the
 * SceneGenerationSkeleton to show a live progress bar during generation.
 *
 * Numbers are based on observed Replicate/Provider medians from production
 * (`video_creations` history) — kept hardcoded for a zero-network ETA call.
 * They are intentionally slightly pessimistic so the bar reaches ~80% by
 * actual completion (under-promise, over-deliver).
 */

import type { ClipSource, ClipQuality } from '@/types/video-composer';

interface ProviderEtaConfig {
  /** Base latency (cold-start + queue + decode), seconds. */
  base: number;
  /** Per-second-of-output cost, seconds. */
  perSecond: number;
  /** Pro-quality multiplier. */
  proMultiplier: number;
  /** Visual brand tint (HSL token). */
  tint: string;
  /** Friendly label. */
  label: string;
}

const PROVIDER_ETA: Record<string, ProviderEtaConfig> = {
  'ai-hailuo':     { base: 25, perSecond: 5,  proMultiplier: 1.4, tint: '210 90% 60%', label: 'Hailuo' },
  'ai-kling':      { base: 30, perSecond: 6,  proMultiplier: 1.5, tint: '280 80% 65%', label: 'Kling' },
  'ai-sora':       { base: 40, perSecond: 8,  proMultiplier: 1.6, tint: '0 0% 95%',    label: 'Sora 2' },
  'ai-wan':        { base: 25, perSecond: 5,  proMultiplier: 1.4, tint: '195 85% 60%', label: 'Wan' },
  'ai-seedance':   { base: 20, perSecond: 4,  proMultiplier: 1.3, tint: '25 90% 60%',  label: 'Seedance' },
  'ai-luma':       { base: 30, perSecond: 6,  proMultiplier: 1.4, tint: '320 80% 65%', label: 'Luma Ray' },
  'ai-veo':        { base: 45, perSecond: 8,  proMultiplier: 1.5, tint: '140 70% 55%', label: 'Veo' },
  'ai-runway':     { base: 50, perSecond: 10, proMultiplier: 1.4, tint: '15 90% 60%',  label: 'Runway' },
  'ai-pika':       { base: 25, perSecond: 5,  proMultiplier: 1.4, tint: '340 85% 65%', label: 'Pika' },
  'ai-vidu':       { base: 30, perSecond: 6,  proMultiplier: 1.4, tint: '170 80% 55%', label: 'Vidu Q2' },
  'ai-happyhorse': { base: 25, perSecond: 5,  proMultiplier: 1.4, tint: '50 90% 60%',  label: 'HappyHorse' },
  'ai-image':      { base: 8,  perSecond: 0,  proMultiplier: 1.2, tint: '45 90% 65%',  label: 'Nano Banana' },
};

const DEFAULT_CONFIG: ProviderEtaConfig = {
  base: 30,
  perSecond: 5,
  proMultiplier: 1.4,
  tint: '45 90% 65%',
  label: 'AI',
};

export interface ProviderEtaResult {
  etaSeconds: number;
  tint: string;
  label: string;
}

/**
 * Pure ETA calculator — no React hook semantics. Safe to call from
 * helpers, cost aggregators, and edge function payload prep.
 */
export function computeProviderEta(
  clipSource: ClipSource | string | undefined,
  durationSeconds: number = 5,
  quality: ClipQuality = 'standard',
): ProviderEtaResult {
  const config = (clipSource && PROVIDER_ETA[clipSource]) || DEFAULT_CONFIG;
  const raw = config.base + config.perSecond * Math.max(1, durationSeconds);
  const eta = quality === 'pro' ? raw * config.proMultiplier : raw;
  return {
    etaSeconds: Math.round(eta),
    tint: config.tint,
    label: config.label,
  };
}

export function useProviderEta(
  clipSource: ClipSource | string | undefined,
  durationSeconds: number = 5,
  quality: ClipQuality = 'standard',
): ProviderEtaResult {
  return computeProviderEta(clipSource, durationSeconds, quality);
}

/** Format seconds → human range like "~2-3 min" or "~45s". */
export function formatEtaRange(etaSeconds: number): string {
  if (etaSeconds <= 0) return '~sofort';
  if (etaSeconds < 90) {
    const lo = Math.max(15, Math.round(etaSeconds * 0.8));
    const hi = Math.round(etaSeconds * 1.3);
    return `~${lo}-${hi}s`;
  }
  const minLo = Math.max(1, Math.floor((etaSeconds * 0.8) / 60));
  const minHi = Math.ceil((etaSeconds * 1.3) / 60);
  return minLo === minHi ? `~${minLo} min` : `~${minLo}-${minHi} min`;
}
