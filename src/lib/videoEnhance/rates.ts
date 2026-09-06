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
export const VIDEO_PROVIDER_PRICING_VERSION = 'video-rates-2026-09-06-topaz-direct-credits';

/** Tolerance before an actual/predicted cost gap raises an admin warning. */
/**
 * Hard ceiling on the customer price as a multiple of provider cost.
 * AdTool Video Enhance stays deliberately cheap: the effective multiplier must
 * always sit inside the degressive band and may NEVER exceed the cap — neither
 * on the pre-run estimate nor, after the true-up, on verified provider cost.
 */
export const VIDEO_PRICING_HARD_MULTIPLIER_CAP = 3.0;
/** Lower end of the degressive band; informational for admin checks. */
export const VIDEO_PRICING_TARGET_MIN_MULTIPLIER = 1.8;

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
  /** true while the units/seconds estimator is not calibrated from real runs. */
  estimatorCalibrating?: boolean;
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
        /** Published reference table, kept for admin comparison only. */
        entries?: MatrixEntry[];
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

/**
 * ByteDance vCube (`bytedance/video-upscaler`) is billed per second of OUTPUT
 * video, by processing tier x target resolution x fps band (<=30 / >30).
 * Numbers below are the provider's published sticker prices.
 */
const VCUBE_STANDARD_USD_PER_SECOND: Record<VideoResolution, { low: number; high: number }> = {
  '720p': { low: 0.003443, high: 0.006887 },
  '1080p': { low: 0.006887, high: 0.013773 },
  '2k': { low: 0.013773, high: 0.027548 },
  '4k': { low: 0.027548, high: 0.055097 },
};
/** The Pro model is billed at ten times the Standard rate. */
const VCUBE_PRO_FACTOR = 10;

const VCUBE_MODES = ['aigc', 'short_series', 'ugc', 'old_film', 'common'];
const VCUBE_RESOLUTIONS: VideoResolution[] = ['720p', '1080p', '2k', '4k'];
const VCUBE_FPS = [24, 30, 60];

const VCUBE_ENTRIES: MatrixEntry[] = VCUBE_MODES.flatMap((mode) =>
  VCUBE_RESOLUTIONS.flatMap((resolution) =>
    VCUBE_FPS.flatMap((fps) => {
      const band = fps > 30 ? 'high' : 'low';
      const base = VCUBE_STANDARD_USD_PER_SECOND[resolution][band];
      return [
        { mode, resolution, fps, tier: 'standard' as QualityTier, usdPerSecond: base },
        { mode, resolution, fps, tier: 'pro' as QualityTier, usdPerSecond: base * VCUBE_PRO_FACTOR },
      ];
    }),
  ),
);

/**
 * Topaz is called DIRECTLY (api.topazlabs.com) and bills in CREDITS. The USD
 * value of one credit is an account number, not an API field: the server reads
 * it from `TOPAZ_CREDIT_USD`, this mirror carries the same documented default.
 *
 * Credit consumption comes from the published Proteus table (estimates at
 * 30 fps): 720p 1 credit / 10 s, 1080p 2 / 10 s, 4K 6 / 10 s.
 */
export const TOPAZ_CREDIT_USD = 0.1;

/** Credits per second of OUTPUT at 30 fps, from the published Proteus table. */
const TOPAZ_CREDITS_PER_SECOND: Partial<Record<VideoResolution, number>> = {
  '720p': 0.1,
  '1080p': 0.2,
  '2k': 0.35,
  '4k': 0.6,
};

const TOPAZ_FPS_FACTOR: Record<number, number> = { 24: 0.8, 30: 1, 60: 2 };

const TOPAZ_ENTRIES: MatrixEntry[] = (
  Object.keys(TOPAZ_CREDITS_PER_SECOND) as VideoResolution[]
).flatMap((resolution) =>
  [24, 30, 60].map((fps) => ({
    mode: 'standard',
    resolution,
    fps,
    tier: 'standard' as QualityTier,
    usdPerSecond:
      (TOPAZ_CREDITS_PER_SECOND[resolution] ?? 0) * (TOPAZ_FPS_FACTOR[fps] ?? 1) * TOPAZ_CREDIT_USD,
  })),
);

export const VIDEO_RATE_CARDS: Record<string, VideoRateCard> = {
  'bytedance-vcube': {
    currency: 'USD',
    type: 'per_second_matrix',
    source: 'Replicate bytedance/video-upscaler published billing tiers (per output second)',
    checkedAt: '2026-09-05',
    costUnverified: true,
    entries: VCUBE_ENTRIES,
  },
  'topaz-video-upscale': {
    currency: 'USD',
    type: 'per_unit',
    unitUsd: TOPAZ_CREDIT_USD,
    unitsPerOutputSecond: TOPAZ_CREDITS_PER_SECOND,
    fpsFactor: TOPAZ_FPS_FACTOR,
    source:
      'Topaz direct API credit pricing (published Proteus credit table); credit USD value from TOPAZ_CREDIT_USD',
    checkedAt: '2026-09-06',
    costUnverified: true,
    estimatorCalibrating: true,
    entries: TOPAZ_ENTRIES,
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
