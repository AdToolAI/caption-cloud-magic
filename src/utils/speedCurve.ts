/**
 * Speed Curve Utility
 * Provides easing-aware interpolation between speed keyframes,
 * weighted duration calculation, and timeline↔source mapping.
 */

export interface SpeedKF {
  time: number;
  speed: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/** Easing functions (0→1 input, 0→1 output) */
function applyEasing(t: number, easing: string): number {
  const c = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'ease-in':
      return c * c;
    case 'ease-out':
      return 1 - (1 - c) * (1 - c);
    case 'ease-in-out':
      return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
    default: // linear
      return c;
  }
}

/**
 * Get the interpolated speed at a given time from sorted keyframes.
 * Keyframes times are relative (0 = start of segment/scene).
 */
export function getSpeedAtTime(keyframes: SpeedKF[], time: number): number {
  if (!keyframes || keyframes.length === 0) return 1;

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  // Before first keyframe
  if (time <= sorted[0].time) return sorted[0].speed;

  // After last keyframe
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].speed;

  // Find the two surrounding keyframes
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (time >= curr.time && time < next.time) {
      const segDuration = next.time - curr.time;
      if (segDuration <= 0) return curr.speed;
      const rawT = (time - curr.time) / segDuration;
      const easedT = applyEasing(rawT, next.easing || 'linear');
      return curr.speed + (next.speed - curr.speed) * easedT;
    }
  }

  return sorted[sorted.length - 1].speed;
}

/**
 * Calculate the weighted average speed across a duration,
 * using numerical integration of the speed curve.
 * Returns the effective average speed (for duration calculation).
 */
export function getWeightedAverageSpeed(keyframes: SpeedKF[], sceneDuration: number): number {
  if (!keyframes || keyframes.length === 0) return 1;
  if (sceneDuration <= 0) return 1;

  // Integrate speed over the scene using small steps
  const STEPS = 100;
  const dt = sceneDuration / STEPS;
  let totalSpeed = 0;

  for (let i = 0; i < STEPS; i++) {
    const t = (i + 0.5) * dt; // midpoint
    totalSpeed += getSpeedAtTime(keyframes, t);
  }

  return Math.max(0.1, totalSpeed / STEPS);
}

/**
 * Calculate new scene duration from speed keyframes.
 * Uses: newDuration = originalDuration / weightedAvgSpeed
 * Clamped to max 3x original.
 */
export function calculateSceneDuration(
  keyframes: SpeedKF[],
  originalDuration: number,
): { newDuration: number; avgSpeed: number } {
  const avgSpeed = getWeightedAverageSpeed(keyframes, originalDuration);
  const newDuration = Math.min(originalDuration * 3, Math.max(0.5, originalDuration / avgSpeed));
  return { newDuration, avgSpeed };
}
