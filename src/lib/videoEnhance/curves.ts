/**
 * Video Enhance — provider-specific degressive pricing curves.
 *
 * Upscaling is NOT priced with the general AI-video / Picture margin curve.
 * Provider economics differ far too much: ByteDance vCube is cheap and carries
 * a healthy multiple, Topaz is expensive and must stay close to cost so an
 * Apollo job does not become an absurd customer price.
 *
 * Client mirror of `supabase/functions/_shared/video-enhance-curves.ts`, used
 * for the UI estimate only. A parity test keeps both identical.

 */

export interface CurvePoint {
  /** Estimated provider cost in EUR. */
  cost: number;
  multiplier: number;
}

/** ByteDance vCube — value option, 1.6x .. 2.5x. */
export const VCUBE_CURVE: CurvePoint[] = [
  { cost: 0.0, multiplier: 2.5 },
  { cost: 0.2, multiplier: 2.5 },
  { cost: 0.5, multiplier: 2.2 },
  { cost: 1.0, multiplier: 2.0 },
  { cost: 2.0, multiplier: 1.8 },
  { cost: 5.0, multiplier: 1.6 },
];

/** Topaz — premium option, deliberately close to cost: 1.2x .. 1.8x. */
export const TOPAZ_CURVE: CurvePoint[] = [
  { cost: 0.0, multiplier: 1.8 },
  { cost: 0.5, multiplier: 1.8 },
  { cost: 1.0, multiplier: 1.6 },
  { cost: 2.0, multiplier: 1.5 },
  { cost: 4.0, multiplier: 1.35 },
  { cost: 10.0, multiplier: 1.2 },
];

export const VIDEO_ENHANCE_CURVES: Record<string, CurvePoint[]> = {
  'bytedance-vcube': VCUBE_CURVE,
  'topaz-video-upscale': TOPAZ_CURVE,
};

export function curveFor(modelId: string): CurvePoint[] | undefined {
  return VIDEO_ENHANCE_CURVES[modelId];
}

export function curveBand(curve: CurvePoint[]): { min: number; max: number } {
  const values = curve.map((p) => p.multiplier);
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Linear interpolation between the points, constant outside the range. */
export function curveMultiplier(curve: CurvePoint[], costEur: number): number {
  const cost = Number.isFinite(costEur) ? Math.max(costEur, 0) : 0;
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (cost <= first.cost) return first.multiplier;
  if (cost >= last.cost) return last.multiplier;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (cost <= b.cost) {
      const span = b.cost - a.cost;
      if (span <= 0) return b.multiplier;
      const t = (cost - a.cost) / span;
      return a.multiplier + (b.multiplier - a.multiplier) * t;
    }
  }
  return last.multiplier;
}

export function ceilCent(value: number): number {
  return Math.ceil((Number.isFinite(value) ? Math.max(value, 0) : 0) * 100 - 1e-9) / 100;
}

export interface CurvePricing {
  /**
   * TARGET multiplier read off the degressive curve — the customer-facing
   * pricing intent, before the price is rounded to whole cents.
   */
  multiplier: number;
  /** Alias of `multiplier`, named for telemetry readers. */
  targetMultiplier: number;
  listPriceEur: number;
  /**
   * EFFECTIVE multiplier: listPrice / estimated provider cost, i.e. the target
   * multiplier AFTER cent rounding. On tiny jobs this sits above the target.
   */
  effectiveMultiplier: number | null;
  /** effective - target, i.e. the pure cent-rounding uplift. */
  roundingUplift: number | null;
  band: { min: number; max: number };
  gate: 'ok' | 'review_required';
  gateReason: string | null;
}

/**
 * List price for one run.
 *
 * The price may never fall below the estimated provider cost — not even
 * through cent rounding, and always BEFORE any account discount.
 */
export function evaluateCurvePricing(costEur: number, curve: CurvePoint[]): CurvePricing {
  const cost = Number.isFinite(costEur) ? Math.max(costEur, 0) : 0;
  const band = curveBand(curve);
  const multiplier = curveMultiplier(curve, cost);
  const listPriceEur = Math.max(ceilCent(cost * multiplier), ceilCent(cost), 0.01);
  const effectiveMultiplier = cost > 0 ? listPriceEur / cost : null;

  let gate: 'ok' | 'review_required' = 'ok';
  let gateReason: string | null = null;
  // Rounding may lift a tiny job slightly over the band; only a real overshoot
  // (more than one cent above the band ceiling) is a pricing question.
  if (cost > 0 && listPriceEur > cost * band.max + 0.01) {
    gate = 'review_required';
    gateReason = 'floor_conflict';
  }

  return {
    multiplier,
    targetMultiplier: multiplier,
    listPriceEur,
    effectiveMultiplier,
    roundingUplift: effectiveMultiplier === null ? null : effectiveMultiplier - multiplier,
    band,
    gate,
    gateReason,
  };
}

// ---------------------------------------------------------------------------
// Post-discount loss policy
// ---------------------------------------------------------------------------

export type ProfitabilityClass = 'profitable' | 'subsidized';

export interface PostDiscountPricing {
  discountPercent: number;
  chargedPriceEur: number;
  /** final customer charge / estimated provider cost. */
  effectiveMultipleAfterDiscount: number | null;
  profitability: ProfitabilityClass;
  /** How much of the provider cost the charge does not cover (EUR). */
  subsidyEur: number;
}

export function normalizeDiscountPercent(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.round(n), 0), 100);
}

/**
 * What the customer really pays after their account discount, and whether that
 * charge still covers the estimated provider cost.
 *
 * This NEVER changes the price or the discount — it only classifies the run so
 * a subsidised configuration is observable instead of silent.
 */
export function evaluatePostDiscount(
  listPriceEur: number,
  discountPercentRaw: unknown,
  providerCostEur: number,
): PostDiscountPricing {
  const discountPercent = normalizeDiscountPercent(discountPercentRaw);
  const chargedPriceEur =
    Math.round(Math.max(listPriceEur, 0) * ((100 - discountPercent) / 100) * 100) / 100;
  const cost = Number.isFinite(providerCostEur) ? Math.max(providerCostEur, 0) : 0;
  const effectiveMultipleAfterDiscount = cost > 0 ? chargedPriceEur / cost : null;
  const profitability: ProfitabilityClass =
    effectiveMultipleAfterDiscount === null || effectiveMultipleAfterDiscount >= 1
      ? 'profitable'
      : 'subsidized';
  return {
    discountPercent,
    chargedPriceEur,
    effectiveMultipleAfterDiscount,
    profitability,
    subsidyEur: profitability === 'subsidized' ? Math.round((cost - chargedPriceEur) * 100) / 100 : 0,
  };
}
