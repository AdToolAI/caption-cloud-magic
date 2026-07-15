// Render Concurrency Policy — Beta-Launch v1 (AWS Lambda quota = 100)
//
// Global slot budget (100 total Lambdas):
//   - 30 reserved for edge functions (auth, DB, generate-*, etc.)
//   - 10 burst reserve (never touched by scheduler)
//   - 60 render pool (this module governs it)
//
// Per-render worker cap is tiered by frame count so many users can render in
// parallel instead of one user monopolising the pool.

export const RENDER_SLOT_BUDGET_DEFAULT = 60;
export const FRAMES_PER_LAMBDA_DEFAULT = 200;
export const FRAMES_PER_LAMBDA_MIN = 120;

export interface RenderTier {
  label: 'short' | 'standard' | 'long' | 'export';
  maxWorkers: number;
  framesPerLambda: number;
}

/**
 * Choose worker cap + framesPerLambda based on total frames.
 * Lower workers for shorter clips → more parallel renders possible.
 */
export function pickRenderTier(durationInFrames: number): RenderTier {
  const frames = Math.max(1, Math.floor(durationInFrames || 0));

  if (frames < 300) {
    return { label: 'short', maxWorkers: 3, framesPerLambda: Math.max(FRAMES_PER_LAMBDA_MIN, Math.ceil(frames / 3)) };
  }
  if (frames < 900) {
    return { label: 'standard', maxWorkers: 5, framesPerLambda: Math.max(FRAMES_PER_LAMBDA_MIN, Math.ceil(frames / 5)) };
  }
  if (frames < 1800) {
    return { label: 'long', maxWorkers: 8, framesPerLambda: Math.max(FRAMES_PER_LAMBDA_MIN, Math.ceil(frames / 8)) };
  }
  return { label: 'export', maxWorkers: 12, framesPerLambda: Math.max(FRAMES_PER_LAMBDA_MIN, Math.ceil(frames / 12)) };
}

/**
 * Estimate slot usage for a queued job before we know exact frames.
 * Used by render-queue-add to write render_queue.estimated_workers.
 */
export function estimateWorkersFromDuration(estimatedDurationSec?: number | null, fps = 30): number {
  if (!estimatedDurationSec || estimatedDurationSec <= 0) return 5;
  return pickRenderTier(estimatedDurationSec * fps).maxWorkers;
}

/**
 * Founders priority.
 * Lower number = higher priority (matches existing render_queue.priority convention).
 */
export const PRIORITY_FOUNDER = 3;
export const PRIORITY_STANDARD = 5;
export function pickPriority(isFounder: boolean, override?: number | null): number {
  if (typeof override === 'number' && override > 0 && override < 10) return override;
  return isFounder ? PRIORITY_FOUNDER : PRIORITY_STANDARD;
}
