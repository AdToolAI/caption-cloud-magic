import {
  getVideoEnhanceModel,
  validateCombination,
  type EnhanceConfig,
  type SourceMetadata,
} from '@/config/videoEnhanceModels';
import {
  evaluateTrueUp,
  marginMetrics,
  NET_FACTOR,
  PRICING_VERSION,
  type TrueUpEvaluation,
} from '@/lib/pictureModels/marginCurve';
import {
  bufferedProviderCostEur,
  FX_RATE_USD_EUR,
  FX_SAFETY_BUFFER,
} from '@/lib/pictureModels/providerRates';
import {
  curveBand,
  curveFor,
  evaluateCurvePricing,
  evaluatePostDiscount,
  type PostDiscountPricing,
} from './curves';
import { topazUncertaintyBuffer } from './topazCostEstimator';
import {
  UnpriceableRunError,
  VIDEO_PRICING_HARD_MULTIPLIER_CAP,
  VIDEO_PROVIDER_PRICING_VERSION,
  VIDEO_RATE_CARDS,
  videoProviderCostDetail,
} from './rates';


export { NET_FACTOR };

/**
 * Video Enhance pricing engine.
 *
 * The browser value is a display estimate; the edge function recalculates the
 * authoritative price with the SAME code path (mirrored server-side) and
 * freezes the full snapshot on the run before the provider is started.
 */

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
  /** Version of the calibrated provider-cost estimator, when one was used. */
  costEstimatorVersion: string | null;
  /** Topaz: credits the estimator expects for this exact chain. */
  estimatedProviderCredits: number | null;
  /** Interpolation model the price was calculated for (null = none). */
  interpolationModel: string | null;
  /** Uncertainty buffer added to the estimated provider cost (0 = none). */
  costUncertaintyBuffer: number;
  /** price / buffered estimated provider cost. */
  effectiveMultiplier: number | null;
  /** The provider's own degressive band this price must sit in. */
  multiplierBandMin: number;
  multiplierBandMax: number;
  multiplierCap: number;
  /** 'review_required' means the config may not be priced as-is. */
  pricingGate: 'ok' | 'review_required';
  pricingGateReason: string | null;
}


/** Effective output frame rate: `null` means "keep the source frame rate". */
export function effectiveFps(config: EnhanceConfig, source: SourceMetadata): number {
  return config.fps ?? Math.round(source.fps);
}

/**
 * Price one run. Throws `UnpriceableRunError` when no rate card entry exists —
 * an unpriceable run must never start.
 */
export function priceVideoEnhanceRun(
  config: EnhanceConfig,
  source: SourceMetadata,
): VideoPriceSnapshot {
  const model = getVideoEnhanceModel(config.modelId);
  if (!model) throw new UnpriceableRunError(`unknown model ${config.modelId}`);

  const check = validateCombination(config, source.durationSeconds);
  if (!check.ok) throw new UnpriceableRunError(check.error ?? 'invalid combination');

  const card = VIDEO_RATE_CARDS[config.modelId];
  if (!card) throw new UnpriceableRunError(`no rate card for ${config.modelId}`);

  const curve = curveFor(config.modelId);
  if (!curve) throw new UnpriceableRunError(`no pricing curve for ${config.modelId}`);

  const fps = effectiveFps(config, source);
  const outputSeconds = source.durationSeconds;

  const detail = videoProviderCostDetail(card, {
    mode: config.mode,
    resolution: config.resolution,
    fps,
    tier: config.tier,
    outputSeconds,
    sourceFps: source.fps,
    interpolationModel: config.interpolationModel,
  });
  const baseCostEur = bufferedProviderCostEur(detail.costUsd);
  const uncertainty = detail.topaz ? topazUncertaintyBuffer(detail.topaz, baseCostEur) : 0;
  const costEur = Math.round(baseCostEur * (1 + uncertainty) * 1e6) / 1e6;

  const evaluation = evaluateCurvePricing(costEur, curve);
  const price = evaluation.listPriceEur;
  const metrics = marginMetrics(price, costEur);
  const band = curveBand(curve);

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
    providerCostUsdEstimated: detail.costUsd,
    providerCostEurBuffered: costEur,
    fxRateUsed: FX_RATE_USD_EUR,
    fxSafetyBufferUsed: FX_SAFETY_BUFFER,
    multiplierUsed: evaluation.multiplier,
    userPriceEur: price,
    netRevenueEur: metrics.netRevenueEUR,
    contributionEur: metrics.contributionEUR,
    marginPct: metrics.marginPct,
    costUnverified: card.costUnverified === true,
    estimatorCalibrating: card.estimatorCalibrating === true,
    costEstimatorVersion: card.estimatorVersion ?? null,
    estimatedProviderCredits: detail.topaz?.credits ?? null,
    interpolationModel: detail.topaz?.interpolationModel ?? null,
    costUncertaintyBuffer: uncertainty,
    effectiveMultiplier: evaluation.effectiveMultiplier,
    multiplierBandMin: band.min,
    multiplierBandMax: band.max,
    multiplierCap: VIDEO_PRICING_HARD_MULTIPLIER_CAP,
    pricingGate: evaluation.gate,
    pricingGateReason:
      evaluation.gateReason ?? (card.estimatorCalibrating === true ? 'estimator_calibrating' : null),
  };
}

/**
 * Post-discount profitability of a priced run — classification only, the
 * discount itself stays with the wallet RPC.
 */
export function classifyRunProfitability(
  snapshot: VideoPriceSnapshot,
  discountPercent: unknown,
): PostDiscountPricing {
  return evaluatePostDiscount(
    snapshot.userPriceEur,
    discountPercent,
    snapshot.providerCostEurBuffered,
  );
}


/** Display estimate that never throws — returns `null` for invalid setups. */
export function tryPriceVideoEnhanceRun(
  config: EnhanceConfig,
  source: SourceMetadata,
): VideoPriceSnapshot | null {
  try {
    return priceVideoEnhanceRun(config, source);
  } catch {
    return null;
  }
}

/** Actual margin once the provider reported its real cost. */
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
 * Post-run true-up against the VERIFIED provider cost.
 *
 * `providerCostUsdActual` must be the real billed amount; `null` when the
 * provider reports none (then nothing is refunded and the run counts as
 * COST UNVERIFIED). The FX safety buffer is not applied here — it protects the
 * estimate, not the guarantee.
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
