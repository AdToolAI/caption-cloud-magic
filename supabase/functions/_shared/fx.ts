// ============================================================================
// FX — single source of truth for the EUR -> USD split (03.09.2026)
// ----------------------------------------------------------------------------
// AI model prices are maintained in EUR only. USD prices are DERIVED from the
// EUR price with one constant, so USD customers carry the real FX difference
// instead of us (previously EUR and USD were 1:1, costing ~13% margin on every
// USD sale). Credit packs stay 1:1 ($50 pack = 50 wallet units) — the split
// happens on the price side, exactly once, here.
// ============================================================================

/** 1 EUR ≈ 1.15 USD. The ONLY place this factor may be defined. */
export const USD_PER_EUR = 1.15;

// Per-second prices need sub-cent precision: rounding to full cents here would
// distort the clip total (e.g. 30 s x 0.3833 = $11.50, but 30 s x 0.38 = $11.40).
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Derive the USD sell price from the maintained EUR price. */
export function usdFromEur(eur: number): number {
  return round4(eur * USD_PER_EUR);
}

// ----------------------------------------------------------------------------
// Payment-processing net factor (03.09.2026)
// ----------------------------------------------------------------------------
// A gross sale never lands 1:1 on the bank account. Measured on a real $10
// PayPal purchase: 10.00 USD gross -> 7.69 EUR net (FX 1.16 => 8.62 EUR
// equivalent, minus 0.93 EUR ≈ 10.8% in method fee + cross-border surcharge +
// conversion spread). The 1.75x margin floor used to be measured against the
// GROSS price, so the real margin was only ~1.5x. Every margin check must run
// against the NET revenue instead.
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
 * Catalog entries that are intentionally priced BELOW the net margin floor.
 * Seedance 2.5 is a deliberate commercial exception (10 EUR per 30 s standard,
 * 480p scaled proportionally) — documented, not accidental drift.
 */
export const NET_MARGIN_FLOOR_EXCEPTIONS = new Set(['seedance-2-5', 'seedance-2-5-480p']);
