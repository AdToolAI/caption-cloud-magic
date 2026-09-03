// ============================================================================
// FX — client mirror of supabase/functions/_shared/fx.ts
// ----------------------------------------------------------------------------
// AI model prices are maintained in EUR only; USD prices are derived with one
// constant so display and deduction stay identical in both currencies.
// ============================================================================

/** 1 EUR ≈ 1.15 USD. Must stay in sync with the shared Deno mirror. */
export const USD_PER_EUR = 1.15;

// Per-second prices need sub-cent precision: rounding to full cents here would
// distort the clip total (e.g. 30 s x 0.3833 = $11.50, but 30 s x 0.38 = $11.40).
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Derive the USD sell price from the maintained EUR price. */
export function usdFromEur(eur: number): number {
  return round4(eur * USD_PER_EUR);
}

// ----------------------------------------------------------------------------
// Payment-processing net factor — mirror of the shared Deno file.
// A gross sale loses ~10% to payment fees (method fee + cross-border surcharge
// + conversion spread), measured on a real $10 -> 7.69 EUR PayPal purchase.
// Margin floors are therefore checked against NET revenue, not the gross price.
// ----------------------------------------------------------------------------

/** Share of the gross price that actually arrives after payment fees. */
export const PAYMENT_NET_FACTOR = 0.90;

/** Minimum margin over provider cost, measured on NET revenue. */
export const MARGIN_FLOOR_MULTIPLE = 1.75;

/** What we really receive from a gross EUR price. */
export function netRevenueEUR(grossEUR: number): number {
  return round4(grossEUR * PAYMENT_NET_FACTOR);
}

/** Lowest gross EUR price whose NET revenue still clears the margin floor. */
export function minGrossEURForCost(costEUR: number): number {
  return Math.ceil((costEUR * MARGIN_FLOOR_MULTIPLE) / PAYMENT_NET_FACTOR * 10000) / 10000;
}

/**
 * Catalog entries intentionally priced BELOW the net margin floor.
 * Seedance 2.5 is a documented commercial exception (10 EUR per 30 s).
 */
export const NET_MARGIN_FLOOR_EXCEPTIONS = new Set(['seedance-2-5', 'seedance-2-5-480p']);
