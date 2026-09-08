/**
 * Topaz provider-cost estimator (CALIBRATED, not provider truth).
 *
 * v2 measured the rate card against real billed runs, v3 recalibrated Apollo at
 * 4K. v4 adds the dimension that explained the last open anomaly: the SOURCE
 * resolution, i.e. how far the clip is enlarged.
 *
 *  - the precision upscale bills a FLAT ~0.017 credits per output frame at the
 *    reference enlargement (verified at 2K and 4K),
 *  - Chronos interpolation is effectively free (verified at 2K and 4K),
 *  - Apollo is the interpolation cost driver (0.0156/frame at 4K),
 *  - the whole per-frame cost scales with the SOURCE resolution: a smaller
 *    source is enlarged further and bills more. Two reproducible billed
 *    points at 4K/60 Apollo: 1080x1920 -> ~0.0322 credits/frame,
 *    720x1280 -> ~0.0565 credits/frame (1.755x at 2.25x fewer source pixels).
 *    Normalised at 1080x1920, so the v3 card stays exactly valid there.
 *
 * The 51-credit run (720x1280, 15.0 s, 4K/60, Apollo, 903 frames) that v3 could
 * not explain was reproduced 1:1 with current code and is predicted by this
 * law to ~52 credits — it was never an outlier, it was a missing dimension.
 *
 * The rates are still INFERRED from our own billed runs, not from a published
 * provider table. Every price snapshot therefore carries
 * `TOPAZ_COST_ESTIMATOR_VERSION`, and every finished run compares the estimate
 * against the credits Topaz really billed.
 */

export const TOPAZ_COST_ESTIMATOR_VERSION = '2026-09-09-calibrated-v4';

export type TopazEstimatorResolution = '720p' | '1080p' | '2k' | '4k';

/**
 * Upscale credits per output frame, precision family (Proteus class), at the
 * reference enlargement (linear factor 2.0).
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
 * Interpolation credits per output frame, by model and OUTPUT resolution, at
 * the reference enlargement.
 */
export const TOPAZ_INTERPOLATION_CREDITS_PER_FRAME: Record<
  string,
  Record<TopazEstimatorResolution, number>
> = {
  none: { '720p': 0, '1080p': 0, '2k': 0, '4k': 0 },
  'chronos-fast': { '720p': 0.0003, '1080p': 0.0003, '2k': 0.0003, '4k': 0.0005 },
  chronos: { '720p': 0.0005, '1080p': 0.0005, '2k': 0.0005, '4k': 0.001 },
  'apollo-fast': { '720p': 0.004, '1080p': 0.006, '2k': 0.011, '4k': 0.028 },
  apollo: { '720p': 0.006, '1080p': 0.008, '2k': 0.0155, '4k': 0.0156 },
  aion: { '720p': 0.006, '1080p': 0.008, '2k': 0.0155, '4k': 0.04 },
};

// ---------------------------------------------------------------------------
// Source resolution / upscale factor (v4)
// ---------------------------------------------------------------------------

/**
 * Reference SOURCE geometry the v2/v3 rate card was measured at: 1080x1920.
 * Every billed 1080p-source sample lands on multiplier 1.0, at 2K and at 4K
 * alike — the measured cost per output frame was the SAME for both targets
 * (2K/60 Apollo 0.0319, 4K/60 Apollo 0.0322 credits/frame), so the target
 * resolution is deliberately NOT part of this dimension.
 */
export const TOPAZ_REFERENCE_SOURCE_PIXELS = 1080 * 1920;
/**
 * Fitted from the two reproducible Apollo 4K/60 points:
 *   1080x1920 source -> 0.0322 credits/frame (reference)
 *    720x1280 source -> 0.0565 credits/frame  => 1.755x at 2.25x fewer pixels
 * exponent = ln(1.755) / ln(2.25) = 0.693.
 */
export const TOPAZ_SOURCE_PIXEL_EXPONENT = 0.693;
/** Guard rails so an odd source geometry can never explode or zero the cost. */
export const TOPAZ_UPSCALE_MULTIPLIER_MIN = 0.6;
export const TOPAZ_UPSCALE_MULTIPLIER_MAX = 3.0;

/** Pixel box of a target resolution, orientation-independent. */
export const TOPAZ_TARGET_PIXELS: Record<TopazEstimatorResolution, number> = {
  '720p': 1280 * 720,
  '1080p': 1920 * 1080,
  '2k': 2560 * 1440,
  '4k': 3840 * 2160,
};

/** Linear upscale factor of the run — reported for observability. */
export function topazUpscaleFactor(
  resolution: TopazEstimatorResolution,
  sourceWidth?: number,
  sourceHeight?: number,
): number {
  const w = Number(sourceWidth) || 0;
  const h = Number(sourceHeight) || 0;
  if (w <= 0 || h <= 0) return 1;
  const factor = Math.sqrt(TOPAZ_TARGET_PIXELS[resolution] / (w * h));
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

/**
 * Cost multiplier for the SOURCE resolution, 1.0 at 1080x1920. A smaller
 * source means more enlargement work per output frame and bills more.
 */
export function topazSourceResolutionMultiplier(sourceWidth?: number, sourceHeight?: number): number {
  const w = Number(sourceWidth) || 0;
  const h = Number(sourceHeight) || 0;
  if (w <= 0 || h <= 0) return 1;
  const raw = Math.pow(TOPAZ_REFERENCE_SOURCE_PIXELS / (w * h), TOPAZ_SOURCE_PIXEL_EXPONENT);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(Math.max(raw, TOPAZ_UPSCALE_MULTIPLIER_MIN), TOPAZ_UPSCALE_MULTIPLIER_MAX);
}

/**
 * Interpolation models whose per-frame rate has no verified billed sample yet.
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
  /** Measured source geometry. Missing geometry falls back to the reference. */
  sourceWidth?: number;
  sourceHeight?: number;
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
  /** Linear enlargement of this run. */
  upscaleFactor: number;
  /** Cost multiplier derived from the source resolution. */
  sourceResolutionMultiplier: number;
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
  const upscaleFactor = topazUpscaleFactor(input.resolution, input.sourceWidth, input.sourceHeight);
  const sourceMultiplier = topazSourceResolutionMultiplier(input.sourceWidth, input.sourceHeight);
  // Topaz bills whole credits and rounds — ceiling here would systematically
  // over-state small jobs (measured: a 239-frame job billed 4, not 5).
  const credits = Math.max(
    1,
    Math.round(outputFrames * (upscale + interpolation) * sourceMultiplier),
  );
  return {
    outputFrames,
    credits,
    upscaleCreditsPerFrame: upscale,
    interpolationCreditsPerFrame: interpolation,
    interpolationModel,
    upscaleFactor: Math.round(upscaleFactor * 1e4) / 1e4,
    sourceResolutionMultiplier: Math.round(sourceMultiplier * 1e4) / 1e4,
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

/** Client mirror of `supabase/functions/_shared/topaz-cost-estimator.ts`. */
