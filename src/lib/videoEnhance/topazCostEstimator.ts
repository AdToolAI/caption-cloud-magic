/**
 * Topaz provider-cost estimator (CALIBRATED, not provider truth).
 *
 * v2 replaced the inferred v1 rate card with rates measured against real billed
 * Topaz runs. v3 recalibrates ONE cell of that card: Apollo at 4K.
 *
 *  - the precision upscale bills a FLAT ~0.017 credits per output frame,
 *    independent of the output resolution (verified at 2K and 4K),
 *  - Chronos interpolation is effectively free (verified at 2K and 4K),
 *  - Apollo is the real cost driver. v2 assumed ~0.040/frame at 4K; three
 *    repeated billed 4K/60 runs (300 frames -> 10, 596 frames -> 19, 300
 *    frames Master -> 10) show a pooled Apollo share of 18.67 credits over
 *    1196 frames = 0.0156/frame, i.e. essentially the measured 2K rate.
 *
 * Known anomaly: one historical 4K/60 run (15.0 s, 903 frames) billed 51
 * credits, ~0.040/frame. No repetition of that behaviour was observed, and the
 * Master-encoder hypothesis was tested and disproved. It is documented as an
 * unexplained outlier and deliberately NOT fitted; drift logging stays on so a
 * recurrence surfaces immediately.
 *
 * The rates are still INFERRED from our own billed runs, not from a published
 * provider table. Every price snapshot therefore carries
 * `TOPAZ_COST_ESTIMATOR_VERSION`, and every finished run compares the estimate
 * against the credits Topaz really billed.
 *
 * Client mirror of `supabase/functions/_shared/topaz-cost-estimator.ts`.
 */

export const TOPAZ_COST_ESTIMATOR_VERSION = '2026-09-09-calibrated-v3';

export type TopazEstimatorResolution = '720p' | '1080p' | '2k' | '4k';

/**
 * Upscale credits per output frame, precision family (Proteus class).
 * Measured flat across resolutions — 720p/1080p carry the same rate because no
 * billed sample contradicts it and a lower guess would under-price.
 */
export const TOPAZ_UPSCALE_CREDITS_PER_FRAME: Record<TopazEstimatorResolution, number> = {
  '720p': 0.017,
  '1080p': 0.017,
  '2k': 0.017,
  '4k': 0.017,
};

/** Restoration models (Nyx, Themis) bill cheaper per frame. Unverified. */
export const TOPAZ_RESTORATION_DIVISOR = 3.4;

/**
 * Interpolation credits per output frame, by model and OUTPUT resolution.
 * Chronos measured at ~0; a token rate keeps it non-zero without distorting
 * the estimate.
 */
export const TOPAZ_INTERPOLATION_CREDITS_PER_FRAME: Record<
  string,
  Record<TopazEstimatorResolution, number>
> = {
  none: { '720p': 0, '1080p': 0, '2k': 0, '4k': 0 },
  'chronos-fast': { '720p': 0.0003, '1080p': 0.0003, '2k': 0.0003, '4k': 0.0005 },
  chronos: { '720p': 0.0005, '1080p': 0.0005, '2k': 0.0005, '4k': 0.001 },
  'apollo-fast': { '720p': 0.004, '1080p': 0.006, '2k': 0.011, '4k': 0.028 },
  // 4K recalibrated in v3 from three repeated billed runs (pooled 0.0156).
  apollo: { '720p': 0.006, '1080p': 0.008, '2k': 0.0155, '4k': 0.0156 },
  aion: { '720p': 0.006, '1080p': 0.008, '2k': 0.0155, '4k': 0.04 },
};

/**
 * Interpolation models whose per-frame rate has no verified billed sample yet.
 * On an expensive job their estimate gets a safety buffer, so the floor is
 * never trusted blindly on an unverified chain. Apollo is verified at 2K/4K.
 */
export const TOPAZ_UNVERIFIED_INTERPOLATION_IDS = ['apollo-fast', 'aion'];
export const TOPAZ_UNCERTAINTY_BUFFER = 0.15;
/** Above this estimated provider cost the buffer applies (EUR). */
export const TOPAZ_UNCERTAINTY_COST_THRESHOLD_EUR = 2.0;

export interface TopazCostInput {
  durationSeconds: number;
  /** Effective OUTPUT frame rate. */
  targetFps: number;
  resolution: TopazEstimatorResolution;
  creditFamily: 'precision' | 'restoration';
  /** Interpolation model id, or undefined/`none` when the fps does not change. */
  interpolationModel?: string;
  /** false when the frame rate is unchanged — no interpolation is billed then. */
  interpolationApplies: boolean;
}

export function topazInterpolationCreditsPerFrame(
  id: string | undefined,
  resolution: TopazEstimatorResolution,
): number {
  if (!id) return 0;
  const row = TOPAZ_INTERPOLATION_CREDITS_PER_FRAME[id] ??
    TOPAZ_INTERPOLATION_CREDITS_PER_FRAME.chronos;
  return row[resolution];
}

export function topazUpscaleCreditsPerFrame(
  resolution: TopazEstimatorResolution,
  family: 'precision' | 'restoration',
): number {
  const base = TOPAZ_UPSCALE_CREDITS_PER_FRAME[resolution];
  return family === 'restoration' ? base / TOPAZ_RESTORATION_DIVISOR : base;
}

export interface TopazCostEstimate {
  outputFrames: number;
  credits: number;
  upscaleCreditsPerFrame: number;
  interpolationCreditsPerFrame: number;
  interpolationModel: string;
  estimatorVersion: string;
  /** true when the interpolation rate is not confirmed by a billed run. */
  unverifiedChain: boolean;
}

export function topazEstimatedCredits(input: TopazCostInput): TopazCostEstimate {
  const seconds = Math.max(0, Number(input.durationSeconds) || 0);
  const fps = Math.max(1, Math.round(Number(input.targetFps) || 30));
  const outputFrames = Math.ceil(seconds * fps);
  const upscale = topazUpscaleCreditsPerFrame(input.resolution, input.creditFamily);
  const interpolationModel = input.interpolationApplies ? (input.interpolationModel ?? 'chronos') : 'none';
  const interpolation = input.interpolationApplies
    ? topazInterpolationCreditsPerFrame(interpolationModel, input.resolution)
    : 0;
  // Topaz bills whole credits and rounds — ceiling here would systematically
  // over-state small jobs (measured: a 239-frame job billed 4, not 5).
  const credits = Math.max(1, Math.round(outputFrames * (upscale + interpolation)));
  return {
    outputFrames,
    credits,
    upscaleCreditsPerFrame: upscale,
    interpolationCreditsPerFrame: interpolation,
    interpolationModel,
    estimatorVersion: TOPAZ_COST_ESTIMATOR_VERSION,
    unverifiedChain:
      input.interpolationApplies && TOPAZ_UNVERIFIED_INTERPOLATION_IDS.includes(interpolationModel),
  };
}

/**
 * Safety buffer on the ESTIMATED provider cost of an uncertain, expensive
 * chain. It raises the assumed cost, never the multiple.
 */
export function topazUncertaintyBuffer(estimate: TopazCostEstimate, costEur: number): number {
  return estimate.unverifiedChain && costEur > TOPAZ_UNCERTAINTY_COST_THRESHOLD_EUR
    ? TOPAZ_UNCERTAINTY_BUFFER
    : 0;
}

/** Relative drift that puts a run into review. */
export const TOPAZ_DRIFT_PCT_THRESHOLD = 0.15;
/**
 * Absolute guard. Topaz bills whole credits, so a 2-credit job that lands on 3
 * is a 50 % "drift" with no financial meaning. A run is only reviewed when the
 * relative AND the absolute miss are material. The raw drift is still stored.
 */
export const TOPAZ_DRIFT_ABS_THRESHOLD = 2;

/** Estimated vs. actually billed credits. */
export function topazCreditDrift(estimatedCredits: number, actualCredits: number) {
  if (!Number.isFinite(actualCredits) || actualCredits <= 0) {
    return { driftPct: null as number | null, flagged: false };
  }
  if (estimatedCredits <= 0) return { driftPct: 1, flagged: true };
  const driftPct = (actualCredits - estimatedCredits) / estimatedCredits;
  const absDelta = Math.abs(actualCredits - estimatedCredits);
  return {
    driftPct,
    flagged:
      Math.abs(driftPct) > TOPAZ_DRIFT_PCT_THRESHOLD && absDelta >= TOPAZ_DRIFT_ABS_THRESHOLD,
  };
}
