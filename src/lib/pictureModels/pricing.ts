import { getPictureModel } from '@/config/pictureModels';
import {
  marginMetrics,
  multiplierForCost,
  PRICING_VERSION,
  NET_FACTOR,
  userPriceFromProviderCost,
} from './marginCurve';
import {
  bufferedProviderCostEur,
  FX_RATE_USD_EUR,
  FX_SAFETY_BUFFER,
  outputMegapixels,
  PROVIDER_PRICING_VERSION,
  PROVIDER_RATE_CARDS,
  providerCostUsd,
} from './providerRates';

/**
 * Picture Studio pricing engine (display only — the server recalculates the
 * authoritative price for every run). Returns the complete snapshot so a run
 * can be explained months later.
 */

export { NET_FACTOR, NET_FACTOR as PAYMENT_NET_FACTOR };

export type PricingMode = 'curve' | 'legacy_fixed';

export interface PriceConfig {
  modelId: string;
  inputWidth?: number;
  inputHeight?: number;
  scale?: number;
  /** Number of images in this run (batch). */
  images?: number;
  values?: Record<string, unknown>;
}

export interface PriceEstimate {
  modelId: string;
  pricingMode: PricingMode;
  pricingVersion: string;
  providerPricingVersion: string;
  providerCostUsdEstimated: number;
  providerCostEurBuffered: number;
  fxRateUsed: number;
  fxSafetyBufferUsed: number;
  multiplierUsed: number | null;
  userPriceEur: number;
  netRevenueEur: number;
  contributionEur: number;
  marginPct: number;
  outputWidth?: number;
  outputHeight?: number;
  outputMegapixels?: number;
  costUnverified: boolean;
  /** @deprecated use userPriceEur */
  sellEUR: number;
  /** @deprecated use providerCostEurBuffered */
  providerCostEUR: number;
}

export function outputDimensions(config: PriceConfig): { width?: number; height?: number } {
  const scale = config.scale ?? 1;
  if (!config.inputWidth || !config.inputHeight) return {};
  return { width: config.inputWidth * scale, height: config.inputHeight * scale };
}

function legacyFixedPrice(modelId: string, scale?: number): number | null {
  const fixed = getPictureModel(modelId)?.pricing.fixedSellEUR;
  if (typeof fixed === 'number') return fixed;
  if (fixed && scale != null && fixed[scale] != null) return fixed[scale] as number;
  return null;
}

export function estimatePrice(config: PriceConfig): PriceEstimate | null {
  const model = getPictureModel(config.modelId);
  if (!model) return null;

  const card = PROVIDER_RATE_CARDS[config.modelId];
  const images = Math.max(1, config.images ?? 1);
  const { width, height } = outputDimensions(config);

  const costUsd = card ? providerCostUsd(card, { ...config, images }) : 0;
  const costEur = bufferedProviderCostEur(costUsd);

  const fixed = legacyFixedPrice(config.modelId, config.scale);
  const isLegacy = fixed !== null;
  const price = isLegacy ? fixed! * images : userPriceFromProviderCost(costEur);
  const metrics = marginMetrics(price, costEur);

  return {
    modelId: model.id,
    pricingMode: isLegacy ? 'legacy_fixed' : 'curve',
    pricingVersion: PRICING_VERSION,
    providerPricingVersion: PROVIDER_PRICING_VERSION,
    providerCostUsdEstimated: costUsd,
    providerCostEurBuffered: costEur,
    fxRateUsed: FX_RATE_USD_EUR,
    fxSafetyBufferUsed: FX_SAFETY_BUFFER,
    multiplierUsed: isLegacy ? null : multiplierForCost(costEur),
    userPriceEur: price,
    netRevenueEur: metrics.netRevenueEUR,
    contributionEur: metrics.contributionEUR,
    marginPct: metrics.marginPct,
    outputWidth: width,
    outputHeight: height,
    outputMegapixels: width && height ? (width * height) / 1_000_000 : outputMegapixels(config),
    costUnverified: card?.costUnverified === true || model.pricing.costUnverified === true,
    sellEUR: price,
    providerCostEUR: costEur,
  };
}

export function formatDimensions(width?: number, height?: number): string | null {
  if (!width || !height) return null;
  return `${Math.round(width)} × ${Math.round(height)}`;
}
