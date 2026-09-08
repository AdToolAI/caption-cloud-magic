/**
 * Topaz provider-cost estimator (CALIBRATED, not provider truth).
 *
 * Topaz bills in credits per OUTPUT FRAME and the interpolation model is by far
 * the biggest cost driver — Apollo costs roughly 3.4x a Chronos pass. A generic
 * "fps factor" hid that and produced the 51-credit job we priced as if it were
 * a 19-credit job.
 *
 * The per-frame rates below are INFERRED from our own billed runs, not from a
 * published provider table. Every price snapshot therefore carries
 * `TOPAZ_COST_ESTIMATOR_VERSION`, and every finished run compares the estimate
 * against the credits Topaz really billed.
 *
 * Mirrored by `src/lib/videoEnhance/topazCostEstimator.ts`.
 */

export const TOPAZ_COST_ESTIMATOR_VERSION = '2026-09-08-calibrated-v1';

export type TopazEstimatorResolution = '720p' | '1080p' | '2k' | '4k';

/** Upscale credits per output frame, precision family (Proteus class). */
export const TOPAZ_UPSCALE_CREDITS_PER_FRAME: Record<TopazEstimatorResolution, number> = {
  '720p': 0.0033,
  '1080p': 0.0067,
  '2k': 0.0117,
  '4k': 0.02,
};

/** Restoration models (Nyx, Themis) bill far cheaper per frame. */
export const TOPAZ_RESTORATION_DIVISOR = 3.4;

/** Interpolation credits per output frame, by model. */
export const TOPAZ_INTERPOLATION_CREDITS_PER_FRAME: Record<string, number> = {
  none: 0,
  'chronos-fast': 0.005,
  chronos: 0.011,
  'apollo-fast': 0.024,
  apollo: 0.0375,
  aion: 0.0375,
};

/**
 * Interpolation models whose per-frame rate has no verified billed sample yet.
 * On an expensive job their estimate gets a safety buffer, so the 1.2x floor is
 * never trusted blindly on an unverified chain.
 */
export const TOPAZ_UNVERIFIED_INTERPOLATION_IDS = ['apollo', 'apollo-fast', 'aion'];
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

export function topazInterpolationCreditsPerFrame(id: string | undefined): number {
  if (!id) return 0;
  return TOPAZ_INTERPOLATION_CREDITS_PER_FRAME[id] ?? TOPAZ_INTERPOLATION_CREDITS_PER_FRAME.chronos;
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
    ? topazInterpolationCreditsPerFrame(interpolationModel)
    : 0;
  const credits = Math.max(1, Math.ceil(outputFrames * (upscale + interpolation)));
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
