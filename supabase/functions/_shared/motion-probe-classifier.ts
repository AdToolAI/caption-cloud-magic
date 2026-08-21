/**
 * FA-4 v404 — Motion Probe Classifier (PURE)
 *
 * ⚠️ V434 CALIBRATION NOTICE (doc-only; no value below is changed)
 * The thresholds in this file are RETIRED AS GROUND TRUTH. `docs/v433-motion-
 * studio-rca.md` proved they were fitted on samples stored at MUTABLE artifact
 * keys that later runs overwrote, so the labelled set is not reproducible
 * (T6 42.5 → 169.5, T4 20.0 → 73.6) and the real Samuel T2 no-op (+42.8) lands
 * deep inside the "motion" class. They remain in force ONLY because the frozen
 * FA-4 production gate runs on them; they must not be cited as evidence for any
 * new decision. Replacement path: `docs/v434-motion-studio-immutability.md`.
 * ------------------------------------------------------------------

 * PURE function. No DB access, no side effects, no Ledger touch.
 *
 * Authoritative scalar (frozen, FA-4 MOTION METRIC RE-SELECTION):
 *
 *   deltaMean = provider.mean - preclip.mean
 *
 * `peak` / `deltaPeak` remain TELEMETRY ONLY. The v403 Δpeak rule is
 * withdrawn: the calibration sweep proved Δpeak does not separate the
 * frozen S11 labels at any N (p4/T3 motion is negative, p3/T6 noop is
 * positive), while ΔMean separates cleanly at N = 6, 8, 10 and 12.
 *
 * Thresholds are derived from the full-precision N = 6 calibration run
 * (gap/4 rule) and are hard-frozen — no rounding in code, no zero
 * heuristic, no speaker-specific rule:
 *
 *   server_delta_min_motion = 21.267221764950364   (p1/T5)
 *   server_delta_max_noop   = -2.1788457676476156  (p5/T4)
 *   gapMean                 = 23.44606753259798
 *   MOTION_THRESHOLD        = 15.405704881800869
 *   NOOP_THRESHOLD          = 3.682671115501879
 */

export interface MotionMetric {
  /** Mean mouth-band temporal luma variance (>= 0). AUTHORITATIVE. */
  mean: number;
  /** Peak mouth-band temporal luma variance (>= 0). TELEMETRY ONLY. */
  peak: number;
  /** Number of sampled frames (diagnostic only). */
  frames?: number;
  /** Algorithm identifier (diagnostic only). */
  method?: string;
}

export interface MotionProbeInput {
  preclip: MotionMetric;
  provider: MotionMetric;
  /** Optional supplementary signals; never the basis for a decision. */
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

export const MOTION_THRESHOLD = 15.405704881800869;
export const NOOP_THRESHOLD = 3.682671115501879;

export function classifyMotionProbe(input: MotionProbeInput): MotionProbeResult {
  const pre = input.preclip;
  const prov = input.provider;

  const preclipMean = Number.isFinite(pre?.mean) ? pre.mean : 0;
  const preclipPeak = Number.isFinite(pre?.peak) ? pre.peak : 0;
  const providerMean = Number.isFinite(prov?.mean) ? prov.mean : 0;
  const providerPeak = Number.isFinite(prov?.peak) ? prov.peak : 0;

  const deltaMean = providerMean - preclipMean;
  const deltaPeak = providerPeak - preclipPeak;

  const inputsValid = !!pre && !!prov &&
    Number.isFinite(pre.mean) &&
    Number.isFinite(pre.peak) &&
    Number.isFinite(prov.mean) &&
    Number.isFinite(prov.peak) &&
    pre.mean >= 0 &&
    prov.mean >= 0 &&
    pre.peak >= 0 &&
    prov.peak >= 0;

  const base = { deltaMean, deltaPeak, preclipMean, preclipPeak, providerMean, providerPeak };

  if (!inputsValid) {
    return { ...base, verdict: "indeterminate", reason: "motion_probe_indeterminate:invalid_metric" };
  }

  if (deltaMean > MOTION_THRESHOLD) {
    return {
      ...base,
      verdict: "motion",
      reason: `motion:delta_mean=${deltaMean}>motion_threshold=${MOTION_THRESHOLD}`,
    };
  }

  if (deltaMean <= NOOP_THRESHOLD) {
    return {
      ...base,
      verdict: "noop",
      reason: `noop:delta_mean=${deltaMean}<=noop_threshold=${NOOP_THRESHOLD}`,
    };
  }

  return {
    ...base,
    verdict: "indeterminate",
    reason:
      `motion_probe_indeterminate:delta_mean=${deltaMean} between noop_threshold=${NOOP_THRESHOLD} and motion_threshold=${MOTION_THRESHOLD}`,
  };
}

/**
 * Frozen S11 measurement fixture — full-precision N = 6 server calibration
 * values (scripts/calibration/fa4-v404-sweep-report.json, run 8b0f659d…,
 * scene e658509d…). ROI for every asset: bx=461 by=411 bw=358 bh=154.
 */
export function getS11FrozenFixture(): Array<{
  passIdx: number;
  turn: string;
  speaker: string;
  preclip: MotionMetric;
  provider: MotionMetric;
  expected: MotionVerdict;
}> {
  return [
    {
      passIdx: 0, turn: "T1", speaker: "Sarah Dusatko", expected: "motion",
      preclip: { mean: 161.4640145256557, peak: 8797.595820249995 },
      provider: { mean: 297.43606692826916, peak: 14683.017102249998 },
    },
    {
      passIdx: 1, turn: "T5", speaker: "Sarah Dusatko", expected: "motion",
      preclip: { mean: 187.99165791958958, peak: 7401.6197337777785 },
      provider: { mean: 209.25887968453995, peak: 9656.042980027773 },
    },
    {
      passIdx: 2, turn: "T2", speaker: "Samuel Dusatko", expected: "motion",
      preclip: { mean: 50.96659481748442, peak: 4402.322500000001 },
      provider: { mean: 100.99510151406523, peak: 7169.770950250001 },
    },
    {
      passIdx: 3, turn: "T6", speaker: "Samuel Dusatko", expected: "noop",
      preclip: { mean: 47.708638094135566, peak: 5436.850224999997 },
      provider: { mean: 42.490909239192135, peak: 5485.402032249998 },
    },
    {
      passIdx: 4, turn: "T3", speaker: "Matthew Dusatko", expected: "motion",
      preclip: { mean: 168.78734640928786, peak: 16408.79871002778 },
      provider: { mean: 220.67172708891837, peak: 16025.618858777772 },
    },
    {
      passIdx: 5, turn: "T4", speaker: "Kay Mark", expected: "noop",
      preclip: { mean: 22.148069293884582, peak: 4442.5779737777775 },
      provider: { mean: 19.969223526236966, peak: 2745.6202684444434 },
    },
  ];
}
