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
export const PROVIDER_PRICING_VERSION = 'rates-2026-09-05-verified';
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

/** Rounds DOWN to the cent — used wherever a hard cap must never be exceeded. */
export function floorToCent(value: number): number {
  return Math.floor(value * 100 + 1e-9) / 100;
}

export function userPriceFromProviderCost(providerCostEur: number): number {
  const cost = Math.max(0, providerCostEur);
  const contributionFloor = (cost + MIN_CONTRIBUTION_EUR) / NET_FACTOR;
  const curvePrice = cost * multiplierForCost(cost);
  return ceilCent(Math.max(MIN_PRICE_EUR, contributionFloor, curvePrice));
}

/** Highest price a hard multiplier cap allows for a given provider cost. */
export function capPriceForCost(providerCostEur: number, hardMultiplierCap: number): number {
  return floorToCent(Math.max(0, providerCostEur) * hardMultiplierCap);
}

export interface PricingPolicy {
  hardMultiplierCap?: number;
  allowFloorAboveCap?: boolean;
}

export type PricingGate = 'ok' | 'review_required';
export type PricingGateReason =
  | 'estimate_over_cap'
  | 'actual_cost_drift'
  | 'cost_unverified'
  | 'estimator_calibrating'
  | 'floor_conflict';

export interface PricingEvaluation {
  providerCostEur: number;
  priceEur: number;
  uncappedPriceEur: number;
  multiplierCap: number | null;
  capPriceEur: number | null;
  effectiveMultiplier: number | null;
  gate: PricingGate;
  gateReason: PricingGateReason | null;
}

export function evaluatePricing(
  providerCostEur: number,
  policy: PricingPolicy = {},
): PricingEvaluation {
  const cost = Math.max(0, providerCostEur);
  const uncapped = userPriceFromProviderCost(cost);
  const cap = policy.hardMultiplierCap ?? null;

  if (cap === null) {
    return {
      providerCostEur: cost,
      priceEur: uncapped,
      uncappedPriceEur: uncapped,
      multiplierCap: null,
      capPriceEur: null,
      effectiveMultiplier: cost > 0 ? uncapped / cost : null,
      gate: 'ok',
      gateReason: null,
    };
  }

  const capPrice = capPriceForCost(cost, cap);
  const allowFloor = policy.allowFloorAboveCap ?? true;
  const overCap = uncapped > capPrice + 1e-9;
  const price = overCap && !allowFloor ? capPrice : uncapped;
  const curvePrice = ceilCent(cost * multiplierForCost(cost));
  const floorDriven = uncapped > curvePrice + 1e-9;

  return {
    providerCostEur: cost,
    priceEur: price,
    uncappedPriceEur: uncapped,
    multiplierCap: cap,
    capPriceEur: capPrice,
    effectiveMultiplier: cost > 0 ? price / cost : null,
    gate: overCap ? 'review_required' : 'ok',
    gateReason: overCap ? (floorDriven ? 'floor_conflict' : 'estimate_over_cap') : null,
  };
}

export const PRICING_TRUE_UP_TOLERANCE_EUR = 0.01;

/**
 * Lower end of the intended margin corridor. A verified multiplier below this
 * value is a CALIBRATION signal (estimator priced too low), never a pricing
 * gate and never a reason to charge the customer more.
 */
export const PRICING_TARGET_MULTIPLIER_FLOOR = 1.8;

export type CalibrationStatus = 'ok' | 'review';
export type CalibrationReason = 'below_target_corridor' | 'estimator_drift';

export interface TrueUpEvaluation {
  actualProviderCostEur: number | null;
  maxAllowedChargeEur: number | null;
  verifiedMultiplierBeforeTrueUp: number | null;
  verifiedMultiplierAfterTrueUp: number | null;
  refundEur: number;
  netUsageChargeEur: number;
  gateReason: PricingGateReason | null;
  /** Calibration stays strictly separate from pricing-gate semantics. */
  calibrationStatus: CalibrationStatus;
  calibrationReason: CalibrationReason | null;
  driftAlarm: boolean;
}

/**
 * Post-run true-up. The FX safety buffer is deliberately NOT part of the
 * verified cost — it only protects the pre-run estimate. Missing, zero or
 * invalid cost => no multiplier and no refund.
 */
export function evaluateTrueUp(params: {
  capturedUsageChargeEur: number;
  actualProviderCostEur: number | null | undefined;
  hardMultiplierCap: number;
}): TrueUpEvaluation {
  const captured = Math.max(0, params.capturedUsageChargeEur);
  const cost = params.actualProviderCostEur;

  if (cost === null || cost === undefined || !Number.isFinite(cost) || cost <= 0) {
    return {
      actualProviderCostEur: null,
      maxAllowedChargeEur: null,
      verifiedMultiplierBeforeTrueUp: null,
      verifiedMultiplierAfterTrueUp: null,
      refundEur: 0,
      netUsageChargeEur: captured,
      gateReason: 'cost_unverified',
      calibrationStatus: 'ok',
      calibrationReason: null,
      driftAlarm: false,
    };
  }

  const maxAllowed = capPriceForCost(cost, params.hardMultiplierCap);
  const refund = Math.max(0, Math.round((captured - maxAllowed) * 100) / 100);
  const net = Math.max(0, Math.round((captured - refund) * 100) / 100);
  const verifiedMultiplier = net / cost;
  // Below the corridor the run earned less than planned: calibrate the
  // estimator. Never a block, never a back-charge.
  const belowCorridor = verifiedMultiplier < PRICING_TARGET_MULTIPLIER_FLOOR;

  return {
    actualProviderCostEur: cost,
    maxAllowedChargeEur: maxAllowed,
    verifiedMultiplierBeforeTrueUp: captured / cost,
    verifiedMultiplierAfterTrueUp: verifiedMultiplier,
    refundEur: refund,
    netUsageChargeEur: net,
    gateReason: refund > 0 ? 'actual_cost_drift' : null,
    calibrationStatus: belowCorridor ? 'review' : 'ok',
    calibrationReason: belowCorridor ? 'below_target_corridor' : null,
    driftAlarm: refund > PRICING_TRUE_UP_TOLERANCE_EUR,
  };
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

/**
 * Official Replicate rate cards, read from the model pages on 2026-09-05.
 *
 * - topazlabs/image-upscale: unit table by output megapixels
 *   (12/24 MP $0.05 · 36/48 MP $0.10 · 60 MP $0.15 · 96 MP $0.20 ·
 *    132 MP $0.24 · 168 MP $0.29 · 336 MP $0.53 · 512 MP $0.82)
 * - philz1337x/clarity-upscaler: hardware billed, A100 40GB @ $0.00115/s,
 *   published median run $0.016
 * - topazlabs/dust-and-scratch-v2 / image-colorization: $0.08 per unit;
 *   measured on 2026-09-05 — both consume exactly 1 unit per run.
 *
 * Reconciled against real AdTool runs on 2026-09-05 (Replicate prediction
 * metrics): upscale 16.8 MP = 1 unit, 24.0 MP = 1 unit, 26.0 MP = 2 units,
 * dust-and-scratch = 1 unit, colorization = 1 unit.
 */
export const PROVIDER_RATE_CARDS: Record<string, ProviderRateCard> = {
  'clarity-pro': { currency: 'USD', type: 'per_run', rateUsd: 0.016, costUnverified: true },
  'topaz-image-upscale': {
    currency: 'USD',
    type: 'output_mp_tier',
    tiers: [
      { maxMegapixels: 24, rateUsd: 0.05 },
      { maxMegapixels: 48, rateUsd: 0.1 },
      { maxMegapixels: 60, rateUsd: 0.15 },
      { maxMegapixels: 96, rateUsd: 0.2 },
      { maxMegapixels: 132, rateUsd: 0.24 },
      { maxMegapixels: 168, rateUsd: 0.29 },
      { maxMegapixels: 336, rateUsd: 0.53 },
      { maxMegapixels: 512, rateUsd: 0.82 },
      // Beyond the published table: extrapolated at the top-tier unit rate.
      { maxMegapixels: 1024, rateUsd: 1.64 },
    ],
  },
  'topaz-dust-scratch': { currency: 'USD', type: 'per_run', rateUsd: 0.08 },
  'topaz-colorization': { currency: 'USD', type: 'per_run', rateUsd: 0.08 },
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
