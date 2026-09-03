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
