import type { QualityTier, VideoResolution } from '@/config/videoEnhanceModels/types';
import {
  TOPAZ_VIDEO_MODEL_VIEWS,
  topazInterpolationAppliesView,
  topazModelView,
  type TopazCreditFamily,
} from '@/config/videoEnhanceModels/topazCatalog';
import {
  TOPAZ_COST_ESTIMATOR_VERSION,
  topazEstimatedCredits,
  type TopazCostEstimate,
} from './topazCostEstimator';


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
export const VIDEO_PROVIDER_PRICING_VERSION = 'video-rates-2026-09-09-vcube-pro-120fps';

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
  /** Version of a calibrated estimator, frozen into every price snapshot. */
  estimatorVersion?: string;
}

export type VideoRateCard = RateCardMeta &
  (
    | { type: 'per_second_matrix'; entries: MatrixEntry[] }
    | { type: 'per_output_second'; usdPerSecond: number }
    | {
        type: 'per_unit';
        unitUsd: number;
        unitsPerOutputSecond: Partial<Record<VideoResolution, number>>;
        /** Per-mode override; a mode missing here falls back to the table above. */
        unitsPerOutputSecondByMode?: Record<string, Partial<Record<VideoResolution, number>>>;
        /** Multiplier applied on top for higher frame rates. */
        fpsFactor?: Record<number, number>;
        /** Model-aware estimator that replaces the flat units x fps factor. */
        estimator?: 'topaz_credits';
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
  /** Measured source frame rate — decides whether interpolation is billed. */
  sourceFps?: number;
  /** Measured source geometry — drives the Topaz upscale-factor dimension. */
  sourceWidth?: number;
  sourceHeight?: number;
  /** Topaz interpolation model id, when the frame rate changes. */
  interpolationModel?: string;
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
/**
 * The Pro model is billed at ten times the Standard rate. VERIFIED 2026-09-09
 * against Replicate's published billing rules for `bytedance/video-upscaler`:
 * every Pro tier is exactly 10x its Standard counterpart on the same
 * `video_output_duration_seconds` metric.
 */
const VCUBE_PRO_FACTOR = 10;

const VCUBE_MODES = ['aigc', 'short_series', 'ugc', 'old_film', 'common'];
const VCUBE_RESOLUTIONS: VideoResolution[] = ['720p', '1080p', '2k', '4k'];
const VCUBE_FPS = [24, 30, 60, 120];

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

/**
 * Credits per second of OUTPUT at 30 fps, per credit FAMILY. Mirror of
 * `supabase/functions/_shared/topaz-video-catalog.ts`. Topaz bills the
 * restoration models (Nyx, Themis) per frame — far cheaper per second than the
 * Proteus-class table — so the family, not the engine, picks the rate.
 */
export const TOPAZ_CREDITS_PER_SECOND_BY_FAMILY: Record<
  TopazCreditFamily,
  Record<VideoResolution, number>
> = {
  precision: { '720p': 0.1, '1080p': 0.2, '2k': 0.35, '4k': 0.6 },
  restoration: { '720p': 0.026, '1080p': 0.058, '2k': 0.103, '4k': 0.233 },
};

const TOPAZ_CREDITS_PER_SECOND: Partial<Record<VideoResolution, number>> =
  TOPAZ_CREDITS_PER_SECOND_BY_FAMILY.precision;

const TOPAZ_CREDITS_BY_MODE: Record<string, Partial<Record<VideoResolution, number>>> =
  Object.fromEntries(
    TOPAZ_VIDEO_MODEL_VIEWS.map((m) => [m.id, TOPAZ_CREDITS_PER_SECOND_BY_FAMILY[m.creditFamily]]),
  );

const TOPAZ_FPS_FACTOR: Record<number, number> = { 24: 0.8, 30: 1, 60: 2 };

const TOPAZ_ENTRIES: MatrixEntry[] = TOPAZ_VIDEO_MODEL_VIEWS.flatMap((model) => {
  const credits = TOPAZ_CREDITS_PER_SECOND_BY_FAMILY[model.creditFamily];
  return (Object.keys(credits) as VideoResolution[]).flatMap((resolution) =>
    [24, 30, 60].map((fps) => ({
      mode: model.id,
      resolution,
      fps,
      tier: 'standard' as QualityTier,
      usdPerSecond: credits[resolution] * (TOPAZ_FPS_FACTOR[fps] ?? 1) * TOPAZ_CREDIT_USD,
    })),
  );
});

export const VIDEO_RATE_CARDS: Record<string, VideoRateCard> = {
  'bytedance-vcube': {
    currency: 'USD',
    type: 'per_second_matrix',
    // VERIFIED 2026-09-09 against real billed AdTool runs (1080p30 / 4K30 /
    // 4K60): the published per-output-second matrix matched to the cent.
    source: 'Replicate bytedance/video-upscaler published billing tiers (per output second)',
    checkedAt: '2026-09-09',
    entries: VCUBE_ENTRIES,
  },
  'topaz-video-upscale': {
    currency: 'USD',
    type: 'per_unit',
    unitUsd: TOPAZ_CREDIT_USD,
    unitsPerOutputSecond: TOPAZ_CREDITS_PER_SECOND,
    unitsPerOutputSecondByMode: TOPAZ_CREDITS_BY_MODE,
    fpsFactor: TOPAZ_FPS_FACTOR,
    // Model-aware, per-output-frame estimator: the interpolation model (Apollo
    // vs Chronos) drives the credits, not a blanket fps factor.
    estimator: 'topaz_credits',
    source:
      'Topaz direct API credits, model-aware per-frame estimator calibrated on billed AdTool runs',
    checkedAt: '2026-09-08',
    costUnverified: true,
    estimatorCalibrating: true,
    estimatorVersion: TOPAZ_COST_ESTIMATOR_VERSION,
    entries: TOPAZ_ENTRIES,
  },
};


export class UnpriceableRunError extends Error {
  constructor(public readonly reason: string) {
    super(`Run cannot be priced: ${reason}`);
    this.name = 'UnpriceableRunError';
  }
}

export interface VideoCostDetail {
  costUsd: number;
  /** Present for the model-aware Topaz estimator. */
  topaz?: TopazCostEstimate;
}

/** Provider cost for one run. Throws when the card has no entry. */
export function videoProviderCostDetail(
  card: VideoRateCard,
  config: VideoCostConfig,
): VideoCostDetail {
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
      return { costUsd: entry.usdPerSecond * seconds };
    }
    case 'per_output_second':
      return { costUsd: card.usdPerSecond * seconds };
    case 'per_unit': {
      if (card.estimator === 'topaz_credits') {
        const sourceFps = Math.round(config.sourceFps ?? config.fps) || 30;
        const estimate = topazEstimatedCredits({
          durationSeconds: seconds,
          targetFps: config.fps,
          resolution: config.resolution,
          creditFamily: topazModelView(config.mode)?.creditFamily,
          interpolationModel: config.interpolationModel,
          interpolationApplies: topazInterpolationAppliesView(sourceFps, config.fps),
          sourceWidth: config.sourceWidth,
          sourceHeight: config.sourceHeight,
        });
        return { costUsd: card.unitUsd * estimate.credits, topaz: estimate };
      }
      const table = card.unitsPerOutputSecondByMode?.[config.mode] ?? card.unitsPerOutputSecond;
      const perSecond = table[config.resolution];
      if (perSecond === undefined) {
        throw new UnpriceableRunError(`no unit rate for ${config.resolution}`);
      }
      const fpsFactor = card.fpsFactor?.[config.fps] ?? 1;
      const units = Math.ceil(perSecond * fpsFactor * seconds);
      return { costUsd: card.unitUsd * Math.max(1, units) };
    }
    case 'tiered': {
      const tier =
        card.tiers.find((t) => seconds <= t.maxOutputSeconds) ?? card.tiers[card.tiers.length - 1];
      if (!tier) throw new UnpriceableRunError('empty tier table');
      return { costUsd: tier.usd };
    }
  }
}

export function videoProviderCostUsd(card: VideoRateCard, config: VideoCostConfig): number {
  return videoProviderCostDetail(card, config).costUsd;
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
