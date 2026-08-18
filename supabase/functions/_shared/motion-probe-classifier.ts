/**
 * FA-4 Provider-No-op Fix Contract — Motion Probe Classifier (v403)
 * ------------------------------------------------------------------
 * PURE function. No DB access, no side effects, no Ledger touch.
 *
 * Input:  motion metrics for the exact Provider-Input-Preclip and the
 *         exact Provider-Output (both produced by the same mouth-band
 *         variance algorithm).
 * Output: motion | noop | indeterminate + measurements + reason.
 *
 * The classifier is intentionally conservative around the frozen S11
 * fixture.  It never classifies on HTTP status, file size, ETag or
 * resolution alone — those remain supplementary evidence only.
 */

export interface MotionMetric {
  /** Mean mouth-band motion energy (normalised, >= 0). */
  mean: number;
  /** Peak mouth-band motion energy (normalised, >= 0). */
  peak: number;
  /** Number of sampled frames (diagnostic only). */
  frames?: number;
  /** Algorithm identifier (diagnostic only). */
  method?: string;
}

export interface MotionProbeInput {
  preclip: MotionMetric;
  provider: MotionMetric;
  /** Optional supplementary signals; never the sole basis for a decision. */
  supplementary?: {
    syncOutputUnchanged?: boolean;
    syncOutputResolutionRegression?: boolean;
    sizeRatio?: number;
  };
}

export type MotionVerdict = "motion" | "noop" | "indeterminate";

export interface MotionProbeResult {
  verdict: MotionVerdict;
  deltaMean: number;
  deltaPeak: number;
  preclipMean: number;
  preclipPeak: number;
  providerMean: number;
  providerPeak: number;
  reason: string;
}

/**
 * Frozen S11 fixture (from RCA run 8b0f659d…, Scene e658509d…).
 *
 * The binding sensitivity anchor is T2 (Δpeak = +0.13) versus the strongest
 * noop case p3/T6 (Δpeak = -0.07).  A threshold must leave a documented
 * margin between these two values.
 *
 * | Pass | Turn       | Pre (mean/peak) | Provider (mean/peak) | Δpeak | Expected |
 * | p0   | T1 Sarah   | 1.076 / 2.907   | 1.157 / 3.768          | +0.86 | motion   |
 * | p1   | T5 Sarah   | 0.635 / 1.981   | 0.717 / 2.953          | +0.97 | motion   |
 * | p2   | T2 Samuel  | 0.328 / 0.886   | 0.340 / 1.019          | +0.13 | motion   |
 * | p3   | T6 Samuel  | 0.355 / 0.936   | 0.356 / 0.864          | -0.07 | noop     |
 * | p4   | T3 Matthew | 0.329 / 1.073   | 0.357 / 2.213          | +1.14 | motion   |
 * | p5   | T4 Kay     | 0.307 / 0.836   | 0.292 / 0.688          | -0.15 | noop     |
 */

// Sensitivity margin: halfway between the weakest motion case (+0.13)
// and the strongest noop case (-0.07).  This is the documented gap that
// separates the frozen fixture classes.
const MOTION_NOOP_GAP = 0.13 - (-0.07); // 0.20
const MOTION_THRESHOLD = 0.13 - MOTION_NOOP_GAP / 4; // +0.08
const NOOP_THRESHOLD = -0.07 + MOTION_NOOP_GAP / 4;  // -0.02

export function classifyMotionProbe(input: MotionProbeInput): MotionProbeResult {
  const pre = input.preclip;
  const prov = input.provider;

  const preclipMean = Number.isFinite(pre.mean) ? pre.mean : 0;
  const preclipPeak = Number.isFinite(pre.peak) ? pre.peak : 0;
  const providerMean = Number.isFinite(prov.mean) ? prov.mean : 0;
  const providerPeak = Number.isFinite(prov.peak) ? prov.peak : 0;

  const deltaMean = providerMean - preclipMean;
  const deltaPeak = providerPeak - preclipPeak;

  // Sanity: both inputs must be valid, non-negative motion metrics.
  const inputsValid =
    Number.isFinite(pre.mean) &&
    Number.isFinite(pre.peak) &&
    Number.isFinite(prov.mean) &&
    Number.isFinite(prov.peak) &&
    pre.peak >= 0 &&
    prov.peak >= 0;

  if (!inputsValid) {
    return {
      verdict: "indeterminate",
      deltaMean,
      deltaPeak,
      preclipMean,
      preclipPeak,
      providerMean,
      providerPeak,
      reason: "motion_probe_indeterminate:invalid_metric",
    };
  }

  // Primary rule: Δpeak must show a clear increase (motion) or decrease/no-gain
  // (noop).  The gap between +0.08 and -0.02 is the indeterminate band.
  if (deltaPeak > MOTION_THRESHOLD) {
    return {
      verdict: "motion",
      deltaMean,
      deltaPeak,
      preclipMean,
      preclipPeak,
      providerMean,
      providerPeak,
      reason: `motion:delta_peak=${deltaPeak.toFixed(4)}>motion_threshold=${MOTION_THRESHOLD.toFixed(4)}`,
    };
  }

  if (deltaPeak <= NOOP_THRESHOLD) {
    return {
      verdict: "noop",
      deltaMean,
      deltaPeak,
      preclipMean,
      preclipPeak,
      providerMean,
      providerPeak,
      reason: `noop:delta_peak=${deltaPeak.toFixed(4)}<=noop_threshold=${NOOP_THRESHOLD.toFixed(4)}`,
    };
  }

  // Indeterminate band: the motion change is too close to the noise floor
  // to make a fail-open decision.  Fail closed.
  return {
    verdict: "indeterminate",
    deltaMean,
    deltaPeak,
    preclipMean,
    preclipPeak,
    providerMean,
    providerPeak,
    reason: `indeterminate:delta_peak=${deltaPeak.toFixed(4)} between noop_threshold=${NOOP_THRESHOLD.toFixed(4)} and motion_threshold=${MOTION_THRESHOLD.toFixed(4)}`,
  };
}

/**
 * Convenience: frozen S11 fixture as a test harness.  Returns the expected
 * classification for each pass index p0..p5.
 */
export function getS11FrozenFixture(): Array<{
  passIdx: number;
  turn: string;
  preclip: MotionMetric;
  provider: MotionMetric;
  expected: MotionVerdict;
}> {
  return [
    { passIdx: 0, turn: "T1 Sarah", preclip: { mean: 1.076, peak: 2.907 }, provider: { mean: 1.157, peak: 3.768 }, expected: "motion" },
    { passIdx: 1, turn: "T5 Sarah", preclip: { mean: 0.635, peak: 1.981 }, provider: { mean: 0.717, peak: 2.953 }, expected: "motion" },
    { passIdx: 2, turn: "T2 Samuel", preclip: { mean: 0.328, peak: 0.886 }, provider: { mean: 0.340, peak: 1.019 }, expected: "motion" },
    { passIdx: 3, turn: "T6 Samuel", preclip: { mean: 0.355, peak: 0.936 }, provider: { mean: 0.356, peak: 0.864 }, expected: "noop" },
    { passIdx: 4, turn: "T3 Matthew", preclip: { mean: 0.329, peak: 1.073 }, provider: { mean: 0.357, peak: 2.213 }, expected: "motion" },
    { passIdx: 5, turn: "T4 Kay", preclip: { mean: 0.307, peak: 0.836 }, provider: { mean: 0.292, peak: 0.688 }, expected: "noop" },
  ];
}
