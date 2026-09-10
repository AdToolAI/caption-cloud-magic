/**
 * Client mirror of `supabase/functions/_shared/referenceVideoBilling.ts`.
 *
 * The price shown before generation must be computed with the exact same rule
 * the Edge Function deducts with: a Seedance 2.5 reference clip is billed like
 * extra video seconds (verified against real BytePlus billing on 10.09.2026).
 * Keep both files in sync.
 */

export const REFERENCE_SECONDS_BILLED_IDS: ReadonlySet<string> = new Set([
  'seedance-2-5',
  'seedance-2-5-480p',
]);

export const UNKNOWN_REFERENCE_SECONDS = 30;

export function billsReferenceSeconds(pricingId: string): boolean {
  return REFERENCE_SECONDS_BILLED_IDS.has(pricingId);
}

export function referenceBillableSeconds(
  pricingId: string,
  referenceCount: number,
  declaredDurations?: readonly (number | null | undefined)[] | null,
): number {
  if (!billsReferenceSeconds(pricingId)) return 0;
  const count = Math.max(0, Math.floor(referenceCount));
  if (count === 0) return 0;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const raw = Number(declaredDurations?.[i]);
    const seconds = Number.isFinite(raw) && raw > 0
      ? Math.min(Math.ceil(raw), UNKNOWN_REFERENCE_SECONDS)
      : UNKNOWN_REFERENCE_SECONDS;
    total += seconds;
  }
  return total;
}

export function computeBillableSeconds(
  pricingId: string,
  outputSeconds: number,
  referenceCount: number,
  declaredDurations?: readonly (number | null | undefined)[] | null,
): number {
  const out = Number.isFinite(outputSeconds) && outputSeconds > 0 ? outputSeconds : 0;
  return out + referenceBillableSeconds(pricingId, referenceCount, declaredDurations);
}
