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

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Derive the USD sell price from the maintained EUR price. */
export function usdFromEur(eur: number): number {
  return round2(eur * USD_PER_EUR);
}
