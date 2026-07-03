/**
 * Easing curves for transition progress.
 *
 * CapCut / Premiere use non-linear curves on transition progress so the
 * blend accelerates through the middle and eases out at the edges. This
 * makes crossfades feel "buttery" instead of mechanical.
 *
 * Input:  linear progress ∈ [0, 1]
 * Output: eased progress   ∈ [0, 1] with p(0)=0, p(1)=1
 */

/** Standard smooth ease-in-out (cubic). CapCut "Smooth" default. */
export function easeInOutCubic(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** Gentler ease, closer to linear — good for very short cuts. */
export function easeInOutQuad(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** Default easing used by preview + export. */
export const easeTransition = easeInOutCubic;
