/**
 * Server-side mirror of the Video Enhance registry, rate cards and pricing.
 *
 * The client registry (`src/config/videoEnhanceModels`) drives the UI; THIS
 * file is the authority for what may run, what reaches the provider and what
 * is charged. A payload built in the browser is never trusted.
 *
 * A parity test asserts both sides describe the same models, the same valid
 * combinations and the same prices.
 */

import {
  bufferedProviderCostEur,
  FX_RATE_USD_EUR,
  FX_SAFETY_BUFFER,
  marginMetrics,
  multiplierForCost,
  PRICING_VERSION,
  userPriceFromProviderCost,
} from './picture-pricing.ts';

export type VideoResolution = '1080p' | '2k' | '4k';
export type QualityTier = 'standard' | 'pro';

export const RESOLUTION_PIXELS: Record<VideoResolution, { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};

export interface OutputCombination {
  resolution: VideoResolution;
  fps: number[];
}

export interface EnhanceConfig {
  modelId: string;
  mode: string;
  resolution: VideoResolution;
  fps: number | null;
  tier: QualityTier;
}

export interface SourceMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  container?: string;
  sizeBytes?: number;
  sourceModel?: string;
}

export interface VideoEnhanceSpec {
  id: string;
  providerModelId: string;
  providerSchemaRef: string;
  modes: string[];
  outputs: OutputCombination[];
  outputsByMode?: Record<string, OutputCombination[]>;
  tiers: QualityTier[];
  entitlementTiers?: QualityTier[];
  minDurationSeconds: number;
  maxDurationSeconds: number;
  /** Backend switch; the frontend flag alone never unlocks a run. */
  backendFlag: string;
  buildInput(config: EnhanceConfig, source: SourceMetadata, sourceUrl: string): Record<string, unknown>;
}

export const VIDEO_ENHANCE_SPECS: Record<string, VideoEnhanceSpec> = {
  'bytedance-vcube': {
    id: 'bytedance-vcube',
    providerModelId: 'bytedance/vcube',
    providerSchemaRef: 'replicate/bytedance-vcube@2026-09',
    modes: ['aigc', 'ugc', 'restoration'],
    outputs: [
      { resolution: '1080p', fps: [24, 30, 60] },
      { resolution: '2k', fps: [24, 30, 60] },
      { resolution: '4k', fps: [24, 30] },
    ],
    outputsByMode: {
      restoration: [
        { resolution: '1080p', fps: [24, 30] },
        { resolution: '2k', fps: [24, 30] },
      ],
    },
    tiers: ['standard', 'pro'],
    entitlementTiers: ['pro'],
    minDurationSeconds: 1,
    maxDurationSeconds: 60,
    backendFlag: 'VIDEO_ENHANCE_BYTEDANCE_ENABLED',
    buildInput(config, source, sourceUrl) {
      return {
        video: sourceUrl,
        scene: config.mode,
        tier: config.tier,
        target_resolution: config.resolution,
        target_fps: config.fps ?? Math.round(source.fps),
      };
    },
  },
  'topaz-video-upscale': {
    id: 'topaz-video-upscale',
    providerModelId: 'topazlabs/video-upscale',
    providerSchemaRef: 'replicate/topazlabs-video-upscale@2026-09',
    modes: ['standard', 'high_fidelity'],
    outputs: [
      { resolution: '1080p', fps: [24, 30, 60] },
      { resolution: '2k', fps: [24, 30, 60] },
      { resolution: '4k', fps: [24, 30, 60] },
    ],
    tiers: ['standard'],
    minDurationSeconds: 1,
    maxDurationSeconds: 120,
    backendFlag: 'VIDEO_ENHANCE_TOPAZ_ENABLED',
    buildInput(config, source, sourceUrl) {
      const target = RESOLUTION_PIXELS[config.resolution];
      return {
        video: sourceUrl,
        model: config.mode === 'high_fidelity' ? 'High Fidelity' : 'Standard',
        target_width: target.width,
        target_height: target.height,
        target_fps: config.fps ?? Math.round(source.fps),
      };
    },
  },
};

// ---------------------------------------------------------------------------
// Combination validation — mirror of src/config/videoEnhanceModels/index.ts
// ---------------------------------------------------------------------------

export type CombinationError =
  | 'unknown_model'
  | 'unknown_mode'
  | 'unsupported_resolution'
  | 'unsupported_fps'
  | 'unknown_tier'
  | 'tier_not_entitled'
  | 'duration_too_short'
  | 'duration_too_long';

export function outputsFor(spec: VideoEnhanceSpec, mode: string): OutputCombination[] {
  return spec.outputsByMode?.[mode] ?? spec.outputs;
}

export function isEntitled(
  spec: VideoEnhanceSpec,
  tier: QualityTier,
  env: (key: string) => string | undefined,
): boolean {
  if (!spec.entitlementTiers?.includes(tier)) return true;
  const verified = (env('VIDEO_ENHANCE_VERIFIED_ENTITLEMENTS') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return verified.includes(`${spec.id}:${tier}`);
}

export function validateCombination(
  config: EnhanceConfig,
  durationSeconds: number | undefined,
  env: (key: string) => string | undefined,
): { ok: boolean; error?: CombinationError } {
  const spec = VIDEO_ENHANCE_SPECS[config.modelId];
  if (!spec) return { ok: false, error: 'unknown_model' };
  if (!spec.modes.includes(config.mode)) return { ok: false, error: 'unknown_mode' };
  const combo = outputsFor(spec, config.mode).find((c) => c.resolution === config.resolution);
  if (!combo) return { ok: false, error: 'unsupported_resolution' };
  if (config.fps !== null && !combo.fps.includes(config.fps)) {
    return { ok: false, error: 'unsupported_fps' };
  }
  if (!spec.tiers.includes(config.tier)) return { ok: false, error: 'unknown_tier' };
  if (!isEntitled(spec, config.tier, env)) return { ok: false, error: 'tier_not_entitled' };
  if (durationSeconds !== undefined) {
    if (durationSeconds < spec.minDurationSeconds) return { ok: false, error: 'duration_too_short' };
    if (durationSeconds > spec.maxDurationSeconds) return { ok: false, error: 'duration_too_long' };
  }
  return { ok: true };
}

/**
 * Three-stage unlock: the backend switch is authoritative, the test allowlist
 * enables real runs before the global rollout.
 */
export function isTestAllowlisted(
  env: (key: string) => string | undefined,
  userId?: string,
): boolean {
  const allowlist = (env('VIDEO_ENHANCE_TEST_USER_IDS') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return !!userId && allowlist.includes(userId);
}

export function isModelUnlocked(
  spec: VideoEnhanceSpec,
  env: (key: string) => string | undefined,
  userId?: string,
): boolean {
  if (env(spec.backendFlag) === 'true') return true;
  return isTestAllowlisted(env, userId);
}

// ---------------------------------------------------------------------------
// Rate cards — mirror of src/lib/videoEnhance/rates.ts
// ---------------------------------------------------------------------------

export const VIDEO_PROVIDER_PRICING_VERSION = 'video-rates-2026-09-05-unverified';
export const COST_DRIFT_WARN_RATIO = 0.15;
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
  source: string;
  checkedAt: string;
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
        fpsFactor?: Record<number, number>;
      }
    | { type: 'tiered'; tiers: { maxOutputSeconds: number; usd: number }[] }
  );

function matrixRates(
  mode: string,
  tier: QualityTier,
  rows: [VideoResolution, number, number][],
): MatrixEntry[] {
  return rows.map(([resolution, fps, usdPerSecond]) => ({ mode, resolution, fps, tier, usdPerSecond }));
}

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

export interface VideoCostConfig {
  mode: string;
  resolution: VideoResolution;
  fps: number;
  tier: QualityTier;
  outputSeconds: number;
}

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
      if (perSecond === undefined) throw new UnpriceableRunError(`no unit rate for ${config.resolution}`);
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

export function costDrift(predictedUsd: number, actualUsd: number) {
  if (predictedUsd <= 0) {
    return { ratio: actualUsd > 0 ? 1 : 0, warn: actualUsd > 0, block: actualUsd > 0 };
  }
  const ratio = Math.abs(actualUsd - predictedUsd) / predictedUsd;
  return { ratio, warn: ratio > COST_DRIFT_WARN_RATIO, block: ratio > COST_DRIFT_BLOCK_RATIO };
}

// ---------------------------------------------------------------------------
// Pricing — the authoritative snapshot frozen on the run
// ---------------------------------------------------------------------------

export interface VideoPriceSnapshot {
  modelId: string;
  mode: string;
  resolution: string;
  fps: number;
  tier: string;
  outputSeconds: number;
  pricingVersion: string;
  providerPricingVersion: string;
  rateCardVersion: string;
  providerCostUsdEstimated: number;
  providerCostEurBuffered: number;
  fxRateUsed: number;
  fxSafetyBufferUsed: number;
  multiplierUsed: number;
  userPriceEur: number;
  netRevenueEur: number;
  contributionEur: number;
  marginPct: number;
  costUnverified: boolean;
}

export function effectiveFps(config: EnhanceConfig, source: SourceMetadata): number {
  return config.fps ?? Math.round(source.fps);
}

export function priceVideoEnhanceRun(
  config: EnhanceConfig,
  source: SourceMetadata,
): VideoPriceSnapshot {
  const spec = VIDEO_ENHANCE_SPECS[config.modelId];
  if (!spec) throw new UnpriceableRunError(`unknown model ${config.modelId}`);
  const card = VIDEO_RATE_CARDS[config.modelId];
  if (!card) throw new UnpriceableRunError(`no rate card for ${config.modelId}`);

  const fps = effectiveFps(config, source);
  const outputSeconds = source.durationSeconds;
  const costUsd = videoProviderCostUsd(card, {
    mode: config.mode,
    resolution: config.resolution,
    fps,
    tier: config.tier,
    outputSeconds,
  });
  const costEur = bufferedProviderCostEur(costUsd);
  const price = userPriceFromProviderCost(costEur);
  const metrics = marginMetrics(price, costEur);

  return {
    modelId: config.modelId,
    mode: config.mode,
    resolution: config.resolution,
    fps,
    tier: config.tier,
    outputSeconds,
    pricingVersion: PRICING_VERSION,
    providerPricingVersion: VIDEO_PROVIDER_PRICING_VERSION,
    rateCardVersion: `${card.source} @ ${card.checkedAt}`,
    providerCostUsdEstimated: costUsd,
    providerCostEurBuffered: costEur,
    fxRateUsed: FX_RATE_USD_EUR,
    fxSafetyBufferUsed: FX_SAFETY_BUFFER,
    multiplierUsed: multiplierForCost(costEur),
    userPriceEur: price,
    netRevenueEur: metrics.netRevenueEUR,
    contributionEur: metrics.contributionEUR,
    marginPct: metrics.marginPct,
    costUnverified: card.costUnverified === true,
  };
}

export function actualMargin(userPriceEur: number, providerCostUsdActual: number) {
  const costEur = bufferedProviderCostEur(providerCostUsdActual);
  const metrics = marginMetrics(userPriceEur, costEur);
  return {
    actualProviderCostEur: costEur,
    actualContributionEur: metrics.contributionEUR,
    actualMarginPct: metrics.marginPct,
  };
}
