import type { QualityTier, VideoResolution } from '@/config/videoEnhanceModels/types';

/**
 * Provider rate cards for Video Enhance.
 *
 * Deliberately NOT a generic `seconds x resolutionFactor x fpsFactor` formula:
 * providers do not bill that way. Every model declares how it is really billed
 * and carries its source plus the date the numbers were checked. Unconfirmed
 * numbers are `costUnverified` and block the global rollout.
 *
 * FX and margin come from the shared engine in `src/lib/pictureModels` — there
 * is exactly one margin curve for the whole platform.
 */

/** Bumped whenever any video rate card below changes. */
export const VIDEO_PROVIDER_PRICING_VERSION = 'video-rates-2026-09-05-unverified';

/** Tolerance before an actual/predicted cost gap raises an admin warning. */
export const COST_DRIFT_WARN_RATIO = 0.15;
/** Above this gap new runs of the model are stopped (`costUnverified`). */
export const COST_DRIFT_BLOCK_RATIO = 0.4;

export interface MatrixEntry {
  mode: string;
  resolution: VideoResolution;
  fps: number;
  tier: QualityTier;
  usdPerSecond: number;
}

interface RateCardMeta {
  currency: 'USD';
  /** Where the numbers come from — never "someone said". */
  source: string;
  checkedAt: string;
  /** true until a real, billed AdTool run confirmed the card. */
  costUnverified?: boolean;
}

export type VideoRateCard = RateCardMeta &
  (
    | { type: 'per_second_matrix'; entries: MatrixEntry[] }
    | { type: 'per_output_second'; usdPerSecond: number }
    | {
        type: 'per_unit';
        unitUsd: number;
        unitsPerOutputSecond: Partial<Record<VideoResolution, number>>;
        /** Multiplier applied on top for higher frame rates. */
        fpsFactor?: Record<number, number>;
      }
    | { type: 'tiered'; tiers: { maxOutputSeconds: number; usd: number }[] }
  );

export interface VideoCostConfig {
  mode: string;
  resolution: VideoResolution;
  /** Effective output FPS (source FPS when the user keeps the original). */
  fps: number;
  tier: QualityTier;
  outputSeconds: number;
}

function matrixRates(
  mode: string,
  tier: QualityTier,
  rows: [VideoResolution, number, number][],
): MatrixEntry[] {
  return rows.map(([resolution, fps, usdPerSecond]) => ({
    mode,
    resolution,
    fps,
    tier,
    usdPerSecond,
  }));
}

/** ByteDance vCube: published per-second table, priced by mode/resolution/fps. */
const VCUBE_ENTRIES: MatrixEntry[] = [
  ...matrixRates('aigc', 'standard', [
    ['1080p', 24, 0.012],
    ['1080p', 30, 0.014],
    ['1080p', 60, 0.024],
    ['2k', 24, 0.02],
    ['2k', 30, 0.024],
    ['2k', 60, 0.042],
    ['4k', 24, 0.038],
    ['4k', 30, 0.046],
  ]),
  ...matrixRates('ugc', 'standard', [
    ['1080p', 24, 0.012],
    ['1080p', 30, 0.014],
    ['1080p', 60, 0.024],
    ['2k', 24, 0.02],
    ['2k', 30, 0.024],
    ['2k', 60, 0.042],
    ['4k', 24, 0.038],
    ['4k', 30, 0.046],
  ]),
  ...matrixRates('restoration', 'standard', [
    ['1080p', 24, 0.018],
    ['1080p', 30, 0.021],
    ['2k', 24, 0.03],
    ['2k', 30, 0.036],
  ]),
  // Pro is an entitlement — priced, but unreachable until verified.
  ...matrixRates('aigc', 'pro', [
    ['1080p', 24, 0.024],
    ['1080p', 30, 0.028],
    ['1080p', 60, 0.048],
    ['2k', 24, 0.04],
    ['2k', 30, 0.048],
    ['2k', 60, 0.084],
    ['4k', 24, 0.076],
    ['4k', 30, 0.092],
  ]),
  ...matrixRates('ugc', 'pro', [
    ['1080p', 24, 0.024],
    ['1080p', 30, 0.028],
    ['1080p', 60, 0.048],
    ['2k', 24, 0.04],
    ['2k', 30, 0.048],
    ['2k', 60, 0.084],
    ['4k', 24, 0.076],
    ['4k', 30, 0.092],
  ]),
  ...matrixRates('restoration', 'pro', [
    ['1080p', 24, 0.036],
    ['1080p', 30, 0.042],
    ['2k', 24, 0.06],
    ['2k', 30, 0.072],
  ]),
];

export const VIDEO_RATE_CARDS: Record<string, VideoRateCard> = {
  'bytedance-vcube': {
    currency: 'USD',
    type: 'per_second_matrix',
    source: 'ByteDance vCube published per-second price table (Replicate listing)',
    checkedAt: '2026-09-05',
    costUnverified: true,
    entries: VCUBE_ENTRIES,
  },
  'topaz-video-upscale': {
    currency: 'USD',
    type: 'per_unit',
    source: 'Replicate topazlabs/video-upscale unit pricing',
    checkedAt: '2026-09-05',
    costUnverified: true,
    unitUsd: 0.05,
    unitsPerOutputSecond: { '1080p': 1, '2k': 1.8, '4k': 4 },
    fpsFactor: { 24: 1, 30: 1.25, 60: 2.5 },
  },
};

export class UnpriceableRunError extends Error {
  constructor(public readonly reason: string) {
    super(`Run cannot be priced: ${reason}`);
    this.name = 'UnpriceableRunError';
  }
}

/** Provider cost in USD for one run. Throws when the card has no entry. */
export function videoProviderCostUsd(card: VideoRateCard, config: VideoCostConfig): number {
  const seconds = Math.max(0, config.outputSeconds);
  switch (card.type) {
    case 'per_second_matrix': {
      const entry = card.entries.find(
        (e) =>
          e.mode === config.mode &&
          e.resolution === config.resolution &&
          e.fps === config.fps &&
          e.tier === config.tier,
      );
      if (!entry) {
        throw new UnpriceableRunError(
          `no rate for ${config.mode}/${config.resolution}/${config.fps}fps/${config.tier}`,
        );
      }
      return entry.usdPerSecond * seconds;
    }
    case 'per_output_second':
      return card.usdPerSecond * seconds;
    case 'per_unit': {
      const perSecond = card.unitsPerOutputSecond[config.resolution];
      if (perSecond === undefined) {
        throw new UnpriceableRunError(`no unit rate for ${config.resolution}`);
      }
      const fpsFactor = card.fpsFactor?.[config.fps] ?? 1;
      const units = Math.ceil(perSecond * fpsFactor * seconds);
      return card.unitUsd * Math.max(1, units);
    }
    case 'tiered': {
      const tier =
        card.tiers.find((t) => seconds <= t.maxOutputSeconds) ?? card.tiers[card.tiers.length - 1];
      if (!tier) throw new UnpriceableRunError('empty tier table');
      return tier.usd;
    }
  }
}

export interface CostDriftVerdict {
  ratio: number;
  warn: boolean;
  block: boolean;
}

/** Compares the frozen prediction with what the provider really billed. */
export function costDrift(predictedUsd: number, actualUsd: number): CostDriftVerdict {
  if (predictedUsd <= 0) {
    return { ratio: actualUsd > 0 ? 1 : 0, warn: actualUsd > 0, block: actualUsd > 0 };
  }
  const ratio = Math.abs(actualUsd - predictedUsd) / predictedUsd;
  return {
    ratio,
    warn: ratio > COST_DRIFT_WARN_RATIO,
    block: ratio > COST_DRIFT_BLOCK_RATIO,
  };
}
