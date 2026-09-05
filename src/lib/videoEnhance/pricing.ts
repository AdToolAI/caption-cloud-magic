import {
  getVideoEnhanceModel,
  validateCombination,
  type EnhanceConfig,
  type SourceMetadata,
} from '@/config/videoEnhanceModels';
import {
  marginMetrics,
  multiplierForCost,
  NET_FACTOR,
  PRICING_VERSION,
  userPriceFromProviderCost,
} from '@/lib/pictureModels/marginCurve';
import {
  bufferedProviderCostEur,
  FX_RATE_USD_EUR,
  FX_SAFETY_BUFFER,
} from '@/lib/pictureModels/providerRates';
import {
  UnpriceableRunError,
  VIDEO_PROVIDER_PRICING_VERSION,
  VIDEO_RATE_CARDS,
  videoProviderCostUsd,
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
