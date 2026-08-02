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

/**
 * Founders reserve band: when >= this share of the slot budget is in use,
 * only Founders are admitted. Non-founders get a 429 with a retry hint.
 * Default: at 50/60 slots (~83%) reserve the last 10 for Founders.
 */
export const FOUNDER_RESERVE_HIGH_WATER = 50;

export interface AdmissionResult {
  admitted: boolean;
  reason?: 'slot_budget_exhausted' | 'founder_reserve';
  usedWorkers: number;
  slotBudget: number;
  neededWorkers: number;
  retryAfterSeconds: number;
}

/**
 * Central admission check used by direct-render entry points
 * (render-with-remotion, render-directors-cut) as a safety net so that a
 * viral burst can't blow past the AWS Lambda quota.
 */
export async function checkRenderAdmission(params: {
  supabaseAdmin: any;
  isFounder: boolean;
  tierMaxWorkers: number;
  slotBudget?: number;
  highWater?: number;
}): Promise<AdmissionResult> {
  const {
    supabaseAdmin,
    isFounder,
    tierMaxWorkers,
    slotBudget = RENDER_SLOT_BUDGET_DEFAULT,
    highWater = FOUNDER_RESERVE_HIGH_WATER,
  } = params;

  let used = 0;
  try {
    const { data } = await supabaseAdmin.rpc('render_queue_running_workers');
    used = Number(data ?? 0);
  } catch (_err) {
    // Fail-open: if RPC fails we don't want to block renders entirely,
    // but log for observability.
    console.warn('[render-admission] running-workers RPC failed, admitting');
    return {
      admitted: true,
      usedWorkers: 0,
      slotBudget,
      neededWorkers: tierMaxWorkers,
      retryAfterSeconds: 0,
    };
  }

  const need = Math.max(1, tierMaxWorkers);

  if (used + need > slotBudget) {
    return {
      admitted: false,
      reason: 'slot_budget_exhausted',
      usedWorkers: used,
      slotBudget,
      neededWorkers: need,
      retryAfterSeconds: 45,
    };
  }
  if (!isFounder && used >= highWater) {
    return {
      admitted: false,
      reason: 'founder_reserve',
      usedWorkers: used,
      slotBudget,
      neededWorkers: need,
      retryAfterSeconds: 30,
    };
  }
  return {
    admitted: true,
    usedWorkers: used,
    slotBudget,
    neededWorkers: need,
    retryAfterSeconds: 0,
  };
}
