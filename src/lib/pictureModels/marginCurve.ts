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
