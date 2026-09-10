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
// FAIL-CLOSED: if a clip's length cannot be measured we do NOT estimate. The
// caller must stop before any wallet deduction and ask for another file — the
// same rule already used for an unreadable wallet currency.
//
// NOTE: 480p (`seedance-2-5-480p`) is assumed to follow the same formula but
// has NOT been measured yet. Marked unverified until a controlled 480p test.
// ============================================================================

/** Pricing ids whose provider bills reference seconds like output seconds. */
export const REFERENCE_SECONDS_BILLED_IDS: ReadonlySet<string> = new Set([
  "seedance-2-5",
  "seedance-2-5-480p",
]);

/** Longest reference clip the model accepts — measured values clamp here. */
export const MAX_REFERENCE_SECONDS = 30;

export function billsReferenceSeconds(pricingId: string): boolean {
  return REFERENCE_SECONDS_BILLED_IDS.has(pricingId);
}

/**
 * Billable seconds contributed by the attached reference clips, or `null` when
 * any clip's length is unknown/invalid (caller must fail closed).
 * Each measured clip is rounded UP to a whole second.
 */
export function referenceBillableSeconds(
  pricingId: string,
  referenceCount: number,
  declaredDurations?: readonly (number | null | undefined)[] | null,
): number | null {
  if (!billsReferenceSeconds(pricingId)) return 0;
  const count = Math.max(0, Math.floor(referenceCount));
  if (count === 0) return 0;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const raw = Number(declaredDurations?.[i]);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    total += Math.min(Math.ceil(raw), MAX_REFERENCE_SECONDS);
  }
  return total;
}

/** Output seconds + reference seconds, or `null` when not billable yet. */
export function computeBillableSeconds(
  pricingId: string,
  outputSeconds: number,
  referenceCount: number,
  declaredDurations?: readonly (number | null | undefined)[] | null,
): number | null {
  const out = Number.isFinite(outputSeconds) && outputSeconds > 0 ? outputSeconds : 0;
  const ref = referenceBillableSeconds(pricingId, referenceCount, declaredDurations);
  return ref === null ? null : out + ref;
}
