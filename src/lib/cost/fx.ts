// ============================================================================
// FX — client mirror of supabase/functions/_shared/fx.ts
// ----------------------------------------------------------------------------
// AI model prices are maintained in EUR only; USD prices are derived with one
// constant so display and deduction stay identical in both currencies.
// ============================================================================

/** 1 EUR ≈ 1.15 USD. Must stay in sync with the shared Deno mirror. */
export const USD_PER_EUR = 1.15;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Derive the USD sell price from the maintained EUR price. */
export function usdFromEur(eur: number): number {
  return round2(eur * USD_PER_EUR);
}
