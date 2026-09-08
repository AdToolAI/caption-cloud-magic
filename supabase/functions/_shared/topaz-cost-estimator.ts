/**
 * Topaz provider-cost estimator (CALIBRATED, not provider truth).
 *
 * v2 replaces the inferred v1 rate card with rates measured against real billed
 * Topaz runs (three dedicated calibration runs on 2026-09-08 plus five
 * historical runs). The measured law is very different from the v1 assumption:
 *
 *  - the precision upscale bills a FLAT ~0.017 credits per output frame,
 *    independent of the output resolution (verified at 2K and 4K),
 *  - Chronos interpolation is effectively free (verified at 2K and 4K),
 *  - Apollo is the real cost driver and DOES scale with output resolution
 *    (~0.0155/frame at 2K, ~0.040/frame at 4K).
 *
 * The rates are still INFERRED from our own billed runs, not from a published
 * provider table. Every price snapshot therefore carries
 * `TOPAZ_COST_ESTIMATOR_VERSION`, and every finished run compares the estimate
 * against the credits Topaz really billed.
 *
 * Mirrored by `src/lib/videoEnhance/topazCostEstimator.ts`.
 */

export const TOPAZ_COST_ESTIMATOR_VERSION = '2026-09-08-calibrated-v2';

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
  apollo: { '720p': 0.006, '1080p': 0.008, '2k': 0.0155, '4k': 0.04 },
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

/** Estimated vs. actually billed credits. */
export function topazCreditDrift(estimatedCredits: number, actualCredits: number) {
  if (!Number.isFinite(actualCredits) || actualCredits <= 0) {
    return { driftPct: null as number | null, flagged: false };
  }
  if (estimatedCredits <= 0) return { driftPct: 1, flagged: true };
  const driftPct = (actualCredits - estimatedCredits) / estimatedCredits;
  return { driftPct, flagged: Math.abs(driftPct) > 0.15 };
}
