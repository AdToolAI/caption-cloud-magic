/**
 * Degressive margin engine for Picture Studio.
 *
 *   provider cost (EUR, FX-buffered)
 *     -> multiplier(cost)            (degressive, linearly interpolated)
 *     -> contribution floor           (applied BEFORE the payment deduction)
 *     -> cent rounding                -> user price
 *
 * The percentage margin drops on purpose for expensive runs while the absolute
 * contribution grows. Both KPIs are reported; neither alone is the target.
 *
 * IMPORTANT: `supabase/functions/_shared/picture-pricing.ts` is a byte-level
 * mirror of the maths in this file. A fixture test asserts both agree.
 */

/** Payment processing keeps ~10% of the gross. */
export const NET_FACTOR = 0.9;
/** Minimum contribution (net of payment fees) per run, in EUR. */
export const MIN_CONTRIBUTION_EUR = 0.02;
/** Absolute price floor per run, in EUR. */
export const MIN_PRICE_EUR = 0.03;
/** Bumped whenever the curve, floors or net factor change. */
export const PRICING_VERSION = 'pricing-2026-09-04';

export interface CurvePoint {
  cost: number;
  multiplier: number;
}

/** Degressive multiplier curve. Unambiguous, constant above the last point. */
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

/**
 * User price for a buffered provider cost in EUR.
 * The contribution floor is grossed up by the net factor so that the minimum
 * contribution really survives the payment deduction.
 */
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

/**
 * Pricing policy.
 *
 * The defaults reproduce the historical behaviour exactly, so Picture Studio
 * pricing does not shift just because this engine is shared. Video Enhance
 * opts into the hard cap explicitly.
 */
export interface PricingPolicy {
  /** Absolute upper bound as a multiple of provider cost. */
  hardMultiplierCap?: number;
  /** When false, MIN_PRICE / MIN_CONTRIBUTION may not push a price over the cap. */
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
  /** Price actually to be charged after the policy was applied. */
  priceEur: number;
  /** What the curve + floors alone would have produced. */
  uncappedPriceEur: number;
  multiplierCap: number | null;
  capPriceEur: number | null;
  effectiveMultiplier: number | null;
  gate: PricingGate;
  gateReason: PricingGateReason | null;
}

/**
 * Applies curve, floors and — when configured — the hard multiplier cap.
 *
 * With `allowFloorAboveCap: false` a floor can never silently lift the price
 * above the cap: the price is capped and the run is flagged `floor_conflict`
 * for review instead.
 */
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

  // Which limiter pushed past the cap: a hard floor, or the estimate itself?
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

/**
 * Post-run true-up.
 *
 * The guarantee is literal: after the provider's real cost is known, the
 * customer never keeps a charge above `cap x actual provider cost`. The FX
 * safety buffer is deliberately NOT part of this cost — it only protects the
 * pre-run estimate. A missing, zero or invalid cost produces no multiplier and
 * no refund at all.
 */
export const PRICING_TRUE_UP_TOLERANCE_EUR = 0.01;

export interface TrueUpEvaluation {
  actualProviderCostEur: number | null;
  maxAllowedChargeEur: number | null;
  verifiedMultiplierBeforeTrueUp: number | null;
  verifiedMultiplierAfterTrueUp: number | null;
  refundEur: number;
  netUsageChargeEur: number;
  gateReason: PricingGateReason | null;
  /** Internal alarm only — never reduces the customer refund. */
  driftAlarm: boolean;
}

export function evaluateTrueUp(params: {
  /** Charge actually captured for this run, after price discounts, before VAT. */
  capturedUsageChargeEur: number;
  /** Verified provider cost in EUR, WITHOUT the FX safety buffer. */
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
      driftAlarm: false,
    };
  }

  const maxAllowed = capPriceForCost(cost, params.hardMultiplierCap);
  // Cent-exact for the customer; the tolerance only gates the internal alarm.
  const refund = Math.max(0, Math.round((captured - maxAllowed) * 100) / 100);
  const net = Math.max(0, Math.round((captured - refund) * 100) / 100);

  return {
    actualProviderCostEur: cost,
    maxAllowedChargeEur: maxAllowed,
    verifiedMultiplierBeforeTrueUp: captured / cost,
    verifiedMultiplierAfterTrueUp: net / cost,
    refundEur: refund,
    netUsageChargeEur: net,
    gateReason: refund > 0 ? 'actual_cost_drift' : null,
    driftAlarm: refund > PRICING_TRUE_UP_TOLERANCE_EUR,
  };
}


export interface MarginMetrics {
  netRevenueEUR: number;
  contributionEUR: number;
  marginPct: number;
}

/** All margin KPIs are computed on net revenue, never on the gross price. */
export function marginMetrics(userPriceEur: number, providerCostEur: number): MarginMetrics {
  const netRevenue = userPriceEur * NET_FACTOR;
  const contribution = netRevenue - providerCostEur;
  return {
    netRevenueEUR: netRevenue,
    contributionEUR: contribution,
    marginPct: netRevenue > 0 ? contribution / netRevenue : 0,
  };
}
