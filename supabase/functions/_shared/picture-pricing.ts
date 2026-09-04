/**
 * Server-side pricing authority for Picture Studio.
 *
 * Byte-level mirror of `src/lib/pictureModels/marginCurve.ts` +
 * `providerRates.ts`. The browser price is a display estimate only; this file
 * decides what is actually charged. A fixture test asserts both agree.
 */

export const NET_FACTOR = 0.9;
export const MIN_CONTRIBUTION_EUR = 0.02;
export const MIN_PRICE_EUR = 0.03;
export const PRICING_VERSION = 'pricing-2026-09-04';

export const FX_RATE_USD_EUR = 0.92;
export const FX_RATE_UPDATED_AT = '2026-09-04';
export const FX_SAFETY_BUFFER = 0.03;
export const PROVIDER_PRICING_VERSION = 'rates-2026-09-04';
export const FALLBACK_OUTPUT_MEGAPIXELS = 12;

export interface CurvePoint {
  cost: number;
  multiplier: number;
}

export const MARGIN_CURVE: CurvePoint[] = [
  { cost: 0.0, multiplier: 3.0 },
  { cost: 0.05, multiplier: 3.0 },
  { cost: 0.3, multiplier: 2.7 },
  { cost: 1.0, multiplier: 2.3 },
  { cost: 3.0, multiplier: 2.0 },
  { cost: 5.0, multiplier: 1.8 },
];

export function multiplierForCost(providerCostEur: number): number {
  const cost = Math.max(0, providerCostEur);
  const first = MARGIN_CURVE[0];
  const last = MARGIN_CURVE[MARGIN_CURVE.length - 1];
  if (cost <= first.cost) return first.multiplier;
  if (cost >= last.cost) return last.multiplier;
  for (let i = 1; i < MARGIN_CURVE.length; i++) {
    const a = MARGIN_CURVE[i - 1];
    const b = MARGIN_CURVE[i];
    if (cost <= b.cost) {
      const span = b.cost - a.cost;
      const ratio = span === 0 ? 0 : (cost - a.cost) / span;
      return a.multiplier + ratio * (b.multiplier - a.multiplier);
    }
  }
  return last.multiplier;
}

export function ceilCent(value: number): number {
  return Math.ceil(value * 100 - 1e-9) / 100;
}

export function userPriceFromProviderCost(providerCostEur: number): number {
  const cost = Math.max(0, providerCostEur);
  const contributionFloor = (cost + MIN_CONTRIBUTION_EUR) / NET_FACTOR;
  const curvePrice = cost * multiplierForCost(cost);
  return ceilCent(Math.max(MIN_PRICE_EUR, contributionFloor, curvePrice));
}

export function marginMetrics(userPriceEur: number, providerCostEur: number) {
  const netRevenue = userPriceEur * NET_FACTOR;
  const contribution = netRevenue - providerCostEur;
  return {
    netRevenueEUR: netRevenue,
    contributionEUR: contribution,
    marginPct: netRevenue > 0 ? contribution / netRevenue : 0,
  };
}

export type ProviderRateCard =
  | { currency: 'USD'; type: 'per_run'; rateUsd: number; costUnverified?: boolean }
  | {
      currency: 'USD';
      type: 'per_output_mp';
      rateUsd: number;
      minMegapixels?: number;
      costUnverified?: boolean;
    }
  | {
      currency: 'USD';
      type: 'output_mp_tier';
      tiers: { maxMegapixels: number; rateUsd: number }[];
      costUnverified?: boolean;
    };

export interface ProviderCostConfig {
  scale?: number;
  inputWidth?: number;
  inputHeight?: number;
  images?: number;
}

export const PROVIDER_RATE_CARDS: Record<string, ProviderRateCard> = {
  'clarity-pro': { currency: 'USD', type: 'per_run', rateUsd: 0.013 },
  'topaz-image-upscale': {
    currency: 'USD',
    type: 'per_output_mp',
    rateUsd: 0.002,
    minMegapixels: 1,
    costUnverified: true,
  },
  'topaz-dust-scratch': { currency: 'USD', type: 'per_run', rateUsd: 0.022, costUnverified: true },
  'topaz-colorization': { currency: 'USD', type: 'per_run', rateUsd: 0.022, costUnverified: true },
};

export function outputMegapixels(config: ProviderCostConfig): number {
  const scale = config.scale ?? 1;
  const width = (config.inputWidth ?? 0) * scale;
  const height = (config.inputHeight ?? 0) * scale;
  if (!width || !height) return FALLBACK_OUTPUT_MEGAPIXELS;
  return (width * height) / 1_000_000;
}

export function providerCostUsd(card: ProviderRateCard, config: ProviderCostConfig): number {
  const images = Math.max(1, config.images ?? 1);
  let perRun: number;
  switch (card.type) {
    case 'per_run':
      perRun = card.rateUsd;
      break;
    case 'per_output_mp': {
      const mp = Math.max(card.minMegapixels ?? 0, outputMegapixels(config));
      perRun = card.rateUsd * mp;
      break;
    }
    case 'output_mp_tier': {
      const mp = outputMegapixels(config);
      const tier =
        card.tiers.find((t) => mp <= t.maxMegapixels) ?? card.tiers[card.tiers.length - 1];
      perRun = tier.rateUsd;
      break;
    }
  }
  return perRun * images;
}

export function bufferedProviderCostEur(costUsd: number): number {
  return costUsd * FX_RATE_USD_EUR * (1 + FX_SAFETY_BUFFER);
}

export type PricingMode = 'curve' | 'legacy_fixed';

/** Live prices that must not change with the backend migration. */
export const LEGACY_FIXED_PRICES: Record<string, Record<number, number>> = {
  'clarity-pro': { 2: 0.03, 4: 0.06 },
};

export interface PricingSnapshot {
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
}

/** Authoritative price + full snapshot for one run. */
export function priceRun(modelId: string, config: ProviderCostConfig): PricingSnapshot {
  const card = PROVIDER_RATE_CARDS[modelId];
  const images = Math.max(1, config.images ?? 1);
  const costUsd = card ? providerCostUsd(card, { ...config, images }) : 0;
  const costEur = bufferedProviderCostEur(costUsd);

  const legacy = LEGACY_FIXED_PRICES[modelId];
  const fixed = legacy && config.scale != null ? legacy[config.scale] : undefined;
  const isLegacy = typeof fixed === 'number';
  const price = isLegacy ? fixed * images : userPriceFromProviderCost(costEur);
  const metrics = marginMetrics(price, costEur);

  return {
    modelId,
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
  };
}
