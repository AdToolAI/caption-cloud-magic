// ============================================================================
// Reference-video billing (v518, verified 10.09.2026)
// ----------------------------------------------------------------------------
// BytePlus ModelArk bills Seedance 2.5 on tokens, and the measured token rate
// for a video-reference job matches the ordinary rate applied to
// (reference duration + output duration):
//
//   paid test: 8 s reference + 8 s output -> 346,500 tokens
//              346.5 K / 16 s = 21.656 K/s  ==  21.66 K/s measured for normal 720p
//
// So a reference clip is not a fixed surcharge — it costs exactly as many
// seconds as the model has to read. We bill the same way, at the ordinary
// resolution rate, and show the extra seconds to the user before generation.
//
// Only models in REFERENCE_SECONDS_BILLED_IDS behave this way (confirmed for
// the direct ModelArk route). Every other engine keeps its current billing.
// ============================================================================

/** Pricing ids whose provider bills reference seconds like output seconds. */
export const REFERENCE_SECONDS_BILLED_IDS: ReadonlySet<string> = new Set([
  "seedance-2-5",
  "seedance-2-5-480p",
]);

/**
 * Conservative assumption when a reference clip's length is unknown: the
 * longest clip the model accepts. We never guess LOW — that would silently
 * bill less than the provider charges us.
 */
export const UNKNOWN_REFERENCE_SECONDS = 30;

export function billsReferenceSeconds(pricingId: string): boolean {
  return REFERENCE_SECONDS_BILLED_IDS.has(pricingId);
}

/**
 * Billable seconds contributed by the attached reference clips.
 * Each clip is rounded UP to a whole second (the provider bills the material
 * it reads, and partial seconds still cost tokens).
 */
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

/** Output seconds + reference seconds — the quantity we charge for. */
export function computeBillableSeconds(
  pricingId: string,
  outputSeconds: number,
  referenceCount: number,
  declaredDurations?: readonly (number | null | undefined)[] | null,
): number {
  const out = Number.isFinite(outputSeconds) && outputSeconds > 0 ? outputSeconds : 0;
  return out + referenceBillableSeconds(pricingId, referenceCount, declaredDurations);
}
