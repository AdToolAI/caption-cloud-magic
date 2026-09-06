// Render Concurrency Policy — v2 (AWS Lambda quota = 100)
//
// Global slot budget (100 total Lambdas):
//   - ~20 reserved for edge functions (auth, DB, generate-*, etc.)
//   - 80 render pool (this module governs it)
//
// Every render now fans out to up to 12 workers regardless of clip length —
// speed per export is prioritised over max parallel renders while the active
// user base is small. Re-tune once the AWS quota increase lands.

export const RENDER_SLOT_BUDGET_DEFAULT = 80;
export const FRAMES_PER_LAMBDA_DEFAULT = 200;
export const FRAMES_PER_LAMBDA_MIN = 120;

export const MAX_WORKERS_PER_RENDER = 12;

export interface RenderTier {
  label: 'short' | 'standard' | 'long' | 'export';
  maxWorkers: number;
  framesPerLambda: number;
}

/**
 * Choose worker cap + framesPerLambda based on total frames.
 * All tiers fan out to MAX_WORKERS_PER_RENDER (12). Short/medium clips drop the
 * 120-frame floor (min 30 frames per chunk) so a 10s/24fps 4K/8K export really
 * splits 12 ways; from 900 frames up the floor stays to avoid chunk overhead.
 */
export function pickRenderTier(durationInFrames: number): RenderTier {
  const frames = Math.max(1, Math.floor(durationInFrames || 0));
  const W = MAX_WORKERS_PER_RENDER;

  if (frames < 300) {
    return { label: 'short', maxWorkers: W, framesPerLambda: Math.max(30, Math.ceil(frames / W)) };
  }
  if (frames < 900) {
    return { label: 'standard', maxWorkers: W, framesPerLambda: Math.max(30, Math.ceil(frames / W)) };
  }
  if (frames < 1800) {
    return { label: 'long', maxWorkers: W, framesPerLambda: Math.max(FRAMES_PER_LAMBDA_MIN, Math.ceil(frames / W)) };
  }
  return { label: 'export', maxWorkers: W, framesPerLambda: Math.max(FRAMES_PER_LAMBDA_MIN, Math.ceil(frames / W)) };
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
