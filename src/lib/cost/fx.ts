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
