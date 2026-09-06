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
  evaluatePricing,
  evaluateTrueUp,
  FX_RATE_USD_EUR,
  FX_SAFETY_BUFFER,
  marginMetrics,
  multiplierForCost,
  PRICING_VERSION,
  type TrueUpEvaluation,
} from './picture-pricing.ts';
import { resolveTargetFrame } from './video-enhance-frame.ts';
import { topazContainer, TOPAZ_CREDIT_USD_DEFAULT } from './topaz-client.ts';
import {
  TOPAZ_CREDITS_PER_SECOND as TOPAZ_FAMILY_CREDITS,
  TOPAZ_DEFAULT_MODEL_ID,
  TOPAZ_OUTPUT_QUALITY,
  TOPAZ_VIDEO_MODEL_IDS,
  TOPAZ_VIDEO_MODELS,
  isTopazInterpolationId,
  isTopazOutputQuality,
  topazInterpolationApplies,
  topazInterpolationModel,
  topazManualFilterParams,
  topazOutputQuality,
  topazVideoModelOrDefault,
  type TopazCreditFamily,
} from './topaz-video-catalog.ts';


export * from './topaz-video-catalog.ts';


export type VideoResolution = '720p' | '1080p' | '2k' | '4k';
export type QualityTier = 'standard' | 'pro';

export const RESOLUTION_PIXELS: Record<VideoResolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
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
  /** Topaz encoder contract. Ignored by engines that publish no encoder choice. */
  outputQuality?: string;
  /** Topaz frame-interpolation model id; only used when the fps really changes. */
  interpolationModel?: string;
  /** Whitelisted, clamped manual filter parameters (Topaz manual models only). */
  params?: Record<string, number>;
}


export interface SourceMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  container?: string;
  sizeBytes?: number;
  sourceModel?: string;
  /** Where the clip came from — drives the ByteDance `scene` preset. */
  origin?: 'generated' | 'uploaded' | 'unknown';
}

/** Which API actually runs the job. Topaz is called DIRECTLY, not via Replicate. */
export type VideoEnhanceProvider = 'replicate' | 'topaz';

export interface VideoEnhanceSpec {
  id: string;
  provider: VideoEnhanceProvider;
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


/**
 * Exactly the `scene` enum of the published `bytedance/video-upscaler` schema.
 * `scene` is a QUALITY PRESET, not a style: it must always be one of these.
 */
export const VCUBE_SCENES = ['aigc', 'short_series', 'ugc', 'old_film', 'common'] as const;
export type VcubeScene = (typeof VCUBE_SCENES)[number];

export function isVcubeScene(value: unknown): value is VcubeScene {
  return typeof value === 'string' && (VCUBE_SCENES as readonly string[]).includes(value);
}

/**
 * `processing_type` of the published schema. Pro is priced at 10x and stays
 * intentionally unavailable until the provider entitlement is verified
 * (`isEntitled`), so every run that reaches the provider today is `standard`.
 */
export function vcubeProcessingType(tier: QualityTier): 'standard' | 'pro' {
  return tier === 'pro' ? 'pro' : 'standard';
}

/**
 * Legacy single-model constants. The runnable set now lives in
 * `topaz-video-catalog.ts`; these remain as the documented defaults.
 */
export const TOPAZ_VIDEO_UPSCALE_MODEL = 'prob-4';


/** Encoder contract of our masters: H.265 Main10 in an MP4 container. */
export const TOPAZ_VIDEO_ENCODER = 'H265';
export const TOPAZ_VIDEO_PROFILE = 'Main10';

export const VIDEO_ENHANCE_SPECS: Record<string, VideoEnhanceSpec> = {
  'bytedance-vcube': {
    id: 'bytedance-vcube',
    provider: 'replicate',
    providerModelId: 'bytedance/video-upscaler',
    providerSchemaRef: 'replicate/bytedance-video-upscaler@2026-09-05',
    modes: [...VCUBE_SCENES],
    outputs: [
      { resolution: '720p', fps: [24, 30, 60] },
      { resolution: '1080p', fps: [24, 30, 60] },
      { resolution: '2k', fps: [24, 30, 60] },
      { resolution: '4k', fps: [24, 30, 60] },
    ],
    tiers: ['standard', 'pro'],
    entitlementTiers: ['pro'],
    minDurationSeconds: 1,
    maxDurationSeconds: 60,
    backendFlag: 'VIDEO_ENHANCE_BYTEDANCE_ENABLED',
    buildInput(config, source, sourceUrl) {
      // The provider payload NEVER carries an invalid scene: a mode that is not
      // part of the published enum (e.g. a leftover from another engine) falls
      // back to the deterministic provenance preset.
      const provenance = sceneForSource(source, [...VCUBE_SCENES]);
      const scene: VcubeScene = isVcubeScene(config.mode)
        ? config.mode
        : isVcubeScene(provenance)
          ? provenance
          : 'common';
      return {
        video: sourceUrl,
        scene,
        processing_type: vcubeProcessingType(config.tier),
        target_resolution: config.resolution,
        target_fps: config.fps ?? Math.round(source.fps),
      };
    },
  },
  'topaz-video-upscale': {
    id: 'topaz-video-upscale',
    // DIRECT Topaz API (api.topazlabs.com), not Replicate. That is what makes
    // the explicit output geometry below possible.
    provider: 'topaz',
    providerModelId: TOPAZ_VIDEO_UPSCALE_MODEL,
    providerSchemaRef: 'topaz/video-express@2026-09-07',
    // One mode per runnable Topaz model. The catalogue is the single source of
    // truth for which codes the express endpoint really accepts.
    modes: [...TOPAZ_VIDEO_MODEL_IDS],
    // The direct API takes an explicit output width/height, so every label and
    // every documented frame rate is reachable in both orientations.
    outputs: [
      { resolution: '720p', fps: [24, 30, 60] },
      { resolution: '1080p', fps: [24, 30, 60] },
      { resolution: '2k', fps: [24, 30, 60] },
      { resolution: '4k', fps: [24, 30, 60] },
    ],
    tiers: ['standard'],
    minDurationSeconds: 1,
    maxDurationSeconds: 120,
    backendFlag: 'VIDEO_ENHANCE_TOPAZ_ENABLED',
    /**
     * Body of `POST /video/express`. `source.external` lets Topaz pull the
     * clip from our storage; the caller only adds `notifications.webhookUrl`.
     */
    buildInput(config, source, sourceUrl) {
      const target = resolveTargetFrame(config.resolution, source.width, source.height);
      const sourceFps = Math.round(source.fps) || 30;
      const fps = config.fps ?? sourceFps;
      const model = topazVideoModelOrDefault(config.mode);
      const encoder = TOPAZ_OUTPUT_QUALITY[topazOutputQuality(config.outputQuality)];

      // `auto: 'Auto'` lets Topaz derive the filter parameters. Manual values
      // are only sent for models that document them, and only the whitelisted,
      // clamped keys ever reach the provider.
      const manual = model.manualParameters ? topazManualFilterParams(config.params) : {};
      const upscale: Record<string, unknown> = Object.keys(manual).length
        ? { model: model.slug, auto: 'Manual', ...manual }
        : { model: model.slug, auto: 'Auto' };

      const filters: Record<string, unknown>[] = [upscale];
      // Frame interpolation is only requested when the frame rate really
      // changes — otherwise Topaz would re-time a clip that is already right
      // and bill a second model for a no-op.
      if (topazInterpolationApplies(sourceFps, config.fps)) {
        filters.push({ model: topazInterpolationModel(config.interpolationModel).slug, fps });
      }


      return {
        source: {
          container: topazContainer(source.container),
          external: { provider: 's3', presignedUrl: sourceUrl },
        },
        filters,
        output: {
          // Topaz rounds the frame to a multiple of 4; our labels already are.
          resolution: { width: target.width, height: target.height },
          frameRate: fps,
          videoEncoder: encoder.videoEncoder,
          videoProfile: encoder.videoProfile,
          // Topaz defaults this to `High` — the most compressed variant. We
          // always state it so a master is never silently downgraded.
          dynamicCompressionLevel: encoder.dynamicCompressionLevel,
          container: encoder.container,
          audioTransfer: 'Copy',
          audioCodec: 'AAC',
        },
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

export const VIDEO_PROVIDER_PRICING_VERSION = 'video-rates-2026-09-06-topaz-direct-credits';
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
        /** Per-mode override; a mode missing here falls back to the table above. */
        unitsPerOutputSecondByMode?: Record<string, Partial<Record<VideoResolution, number>>>;
        fpsFactor?: Record<number, number>;
        entries?: MatrixEntry[];
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

const VCUBE_MODES: string[] = [...VCUBE_SCENES];
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
 * Topaz is now called DIRECTLY (api.topazlabs.com) and bills in CREDITS, not
 * in Replicate units. The USD value of one credit is an account number, not an
 * API field, so it lives in `TOPAZ_CREDIT_USD` (default below) and every
 * recorded cost is `credits x TOPAZ_CREDIT_USD`.
 *
 * Credit consumption comes from the published Proteus table (estimates at
 * 30 fps): 720p 1 credit / 10 s, 1080p 2 / 10 s, 4K 6 / 10 s. 2K sits between
 * 1080p and 4K. The card stays `estimatorCalibrating` until real billed runs
 * confirm the consumption; the hard multiplier cap plus the post-run true-up
 * keep an over-estimate away from the customer.
 */
export const TOPAZ_CREDIT_USD = TOPAZ_CREDIT_USD_DEFAULT;

/**
 * Credits per second of OUTPUT at 30 fps, per credit FAMILY.
 *
 * Topaz does not bill every model alike: the Proteus-class models follow the
 * published credit table, while the restoration models (Nyx, Themis) are
 * billed per frame and land far cheaper per second. Charging the Proteus rate
 * for a Nyx run would push the customer price above the multiplier cap, so the
 * family — not the engine — decides the rate.
 */
const TOPAZ_CREDITS_PER_SECOND: Partial<Record<VideoResolution, number>> =
  TOPAZ_FAMILY_CREDITS.precision;

const TOPAZ_CREDITS_BY_MODE: Record<string, Partial<Record<VideoResolution, number>>> =
  Object.fromEntries(
    TOPAZ_VIDEO_MODELS.map((m) => [m.id, TOPAZ_FAMILY_CREDITS[m.creditFamily]]),
  );

const TOPAZ_FPS_FACTOR: Record<number, number> = { 24: 0.8, 30: 1, 60: 2 };

const TOPAZ_ENTRIES: MatrixEntry[] = TOPAZ_VIDEO_MODELS.flatMap((model) => {
  const family: TopazCreditFamily = model.creditFamily;
  const credits = TOPAZ_FAMILY_CREDITS[family];
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
    unitsPerOutputSecondByMode: TOPAZ_CREDITS_BY_MODE,
    fpsFactor: TOPAZ_FPS_FACTOR,
    source:
      'Topaz direct API credit pricing (published Proteus + Nyx/Themis credit tables); credit USD value from TOPAZ_CREDIT_USD',
    checkedAt: '2026-09-07',
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
      const table = card.unitsPerOutputSecondByMode?.[config.mode] ?? card.unitsPerOutputSecond;
      const perSecond = table[config.resolution];
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
  /** true while the estimator is not calibrated from real billed runs. */
  estimatorCalibrating: boolean;
  /** price / buffered estimated provider cost. */
  effectiveMultiplier: number | null;
  multiplierCap: number;
  /** 'review_required' means the config may not be priced as-is. */
  pricingGate: 'ok' | 'review_required';
  pricingGateReason: string | null;
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
  const evaluation = evaluatePricing(costEur, {
    hardMultiplierCap: VIDEO_PRICING_HARD_MULTIPLIER_CAP,
    // A price floor may never silently lift a run above the cap.
    allowFloorAboveCap: false,
  });
  const price = evaluation.priceEur;
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
    estimatorCalibrating: card.estimatorCalibrating === true,
    effectiveMultiplier: evaluation.effectiveMultiplier,
    multiplierCap: VIDEO_PRICING_HARD_MULTIPLIER_CAP,
    pricingGate: evaluation.gate,
    pricingGateReason:
      evaluation.gateReason ?? (card.estimatorCalibrating === true ? 'estimator_calibrating' : null),
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

/**
 * Post-run true-up against the VERIFIED provider cost. Mirror of
 * `src/lib/videoEnhance/pricing.ts#verifiedPricing`.
 */
export function verifiedPricing(params: {
  capturedUsageChargeEur: number;
  providerCostUsdActual: number | null | undefined;
}): TrueUpEvaluation {
  const costEur =
    params.providerCostUsdActual === null || params.providerCostUsdActual === undefined
      ? null
      : params.providerCostUsdActual * FX_RATE_USD_EUR;
  return evaluateTrueUp({
    capturedUsageChargeEur: params.capturedUsageChargeEur,
    actualProviderCostEur: costEur,
    hardMultiplierCap: VIDEO_PRICING_HARD_MULTIPLIER_CAP,
  });
}

/**
 * ByteDance `scene` is a QUALITY preset, so it must follow the real provenance
 * of the clip and never a leftover value from another engine:
 *   aigc   — the clip came out of one of our AI video models
 *   ugc    — an ordinary phone / social upload
 *   common — provenance unknown
 */
export function sceneForSource(source: SourceMetadata, available: string[]): string {
  const preferred = source.sourceModel || source.origin === 'generated'
    ? 'aigc'
    : source.origin === 'uploaded'
      ? 'ugc'
      : 'common';
  if (available.includes(preferred)) return preferred;
  // Topaz modes are MODELS, not provenance presets: the documented
  // general-purpose model is the honest default, never an arbitrary first row.
  if (available.includes(TOPAZ_DEFAULT_MODEL_ID)) return TOPAZ_DEFAULT_MODEL_ID;
  return available.includes('common') ? 'common' : available[0];
}

/** Where the executing mode came from — recorded for the estimate response. */
export type ExecutionModeSource = 'explicit' | 'provenance' | 'engine_default';

/**
 * The mode that really reaches the provider.
 *
 * For ByteDance the `scene` preset is derived deterministically from the
 * clip's provenance UNLESS the customer explicitly chose a footage type
 * (`modeExplicit`). This applies to DIRECT ByteDance requests exactly as it
 * applies to runs routed from another engine — the client default is never
 * mistaken for a choice. Single-mode engines (Topaz) keep their only mode.
 */
export function resolveExecutionMode(
  config: EnhanceConfig,
  spec: VideoEnhanceSpec,
  source: SourceMetadata,
  modeExplicit: boolean,
): { mode: string; source: ExecutionModeSource } {
  if (spec.modes.length === 1) {
    return {
      mode: spec.modes[0],
      source: config.mode === spec.modes[0] ? 'explicit' : 'engine_default',
    };
  }
  if (modeExplicit && spec.modes.includes(config.mode)) {
    return { mode: config.mode, source: 'explicit' };
  }
  return { mode: sceneForSource(source, spec.modes), source: 'provenance' };
}

/**
 * Adapt a customer configuration to a DIFFERENT engine.
 *
 * Used when the requested engine cannot deliver the promised target frame and
 * the run is routed to an engine that can (see `video-enhance-frame.ts`).
 * Mode, fps and tier are mapped onto what the executing engine really offers —
 * never invented, always taken from its own published combination table.
 */

export function adaptConfigToSpec(
  config: EnhanceConfig,
  spec: VideoEnhanceSpec,
  source: SourceMetadata,
): EnhanceConfig {
  if (config.modelId === spec.id) return config;

  // A mode from another engine is meaningless here — pick the preset that
  // matches the source instead of blindly falling back to `common`.
  const mode = spec.modes.includes(config.mode)
    ? config.mode
    : sceneForSource(source, spec.modes);

  const combo = outputsFor(spec, mode).find((c) => c.resolution === config.resolution);
  const allowedFps = combo?.fps ?? [];
  const wanted = config.fps ?? Math.round(source.fps);
  const fps = allowedFps.length === 0
    ? config.fps
    : (allowedFps.includes(wanted)
      ? wanted
      : allowedFps.reduce((best, value) =>
        Math.abs(value - wanted) < Math.abs(best - wanted) ? value : best, allowedFps[0]));

  const tier: QualityTier = spec.tiers.includes(config.tier) ? config.tier : spec.tiers[0];

  return {
    modelId: spec.id,
    mode,
    resolution: config.resolution,
    fps,
    tier,
    // Encoder / interpolation / manual parameters are Topaz-only concepts; they
    // travel with the run and are simply ignored by an engine without them.
    outputQuality: config.outputQuality,
    interpolationModel: config.interpolationModel,
    params: config.params,
  };
}

