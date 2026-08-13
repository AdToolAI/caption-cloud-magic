/**
 * durationClamp — leaf module (no imports) holding the provider duration
 * clamp semantics, shared by `providerMatrix.ts` and the v425 lip-sync
 * contract (`lipsyncMasterProvider.ts`) so neither keeps its own copy.
 *
 * Semantics are a verbatim port of the pre-v430 behaviour.
 */

export function snapDurationToBuckets(
  requested: number,
  allowed: number[],
): { duration: number; changed: boolean } {
  if (allowed.length === 0) return { duration: requested, changed: false };
  if (allowed.includes(Math.round(requested))) {
    const rounded = Math.round(requested);
    return { duration: rounded, changed: rounded !== requested };
  }
  const next = allowed.find((d) => d >= requested);
  const picked = next ?? allowed[allowed.length - 1];
  const min = allowed[0];
  const max = allowed[allowed.length - 1];
  const final = requested < min ? min : requested > max ? max : picked;
  return { duration: final, changed: final !== requested };
}

/**
 * Hard clamp for a provider.
 *  - Hailuo: two buckets — `>= 10 → 10`, otherwise `6`
 *  - HappyHorse: continuous 3–15 s
 *  - everything else: snap into `allowed`
 */
export function clampDurationForSource(
  clipSource: string | null | undefined,
  duration: number,
  allowed: number[],
): number {
  const picked = Number.isFinite(duration) ? Math.ceil(duration) : 6;
  if (clipSource === 'ai-hailuo') return picked >= 10 ? 10 : 6;
  if (clipSource === 'ai-happyhorse') return Math.min(15, Math.max(3, picked));
  return snapDurationToBuckets(picked, allowed).duration;
}
