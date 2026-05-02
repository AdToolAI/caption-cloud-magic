/**
 * Magnetic snapping engine for the Director's Cut timeline.
 *
 * Inspired by Artlist / CapCut / Premiere — when the user drags or trims
 * a scene boundary close to a "snap target" (other scene edges, the playhead,
 * AI-detected cut markers, the timeline start/end), the value snaps onto it
 * so the user doesn't need to hit the exact frame manually.
 */

export interface SnapTarget {
  /** Time in seconds (timeline domain). */
  time: number;
  /** Origin of the target — used for visual labeling. */
  kind: 'scene-start' | 'scene-end' | 'cut-marker' | 'playhead' | 'timeline-start' | 'timeline-end';
  /** Optional id of the related scene (so we can ignore self-snap when trimming). */
  sceneId?: string;
}

export interface SnapResult {
  /** The (possibly snapped) value. */
  value: number;
  /** Which target was hit, if any. */
  hit: SnapTarget | null;
}

/**
 * Default snap threshold in pixels. The caller divides by zoom (px/sec) to
 * convert to seconds, so the magnet feels equally strong at any zoom level.
 */
export const DEFAULT_SNAP_PX = 8;

/**
 * Snap a value to the nearest target within `thresholdSec` seconds.
 *
 * If `excludeSceneId` is supplied, targets belonging to that scene are
 * ignored so a scene's left edge does not snap to its own right edge.
 */
export function snapToNearest(
  value: number,
  targets: SnapTarget[],
  thresholdSec: number,
  excludeSceneId?: string,
): SnapResult {
  let best: SnapTarget | null = null;
  let bestDist = thresholdSec;

  for (const t of targets) {
    if (excludeSceneId && t.sceneId === excludeSceneId) continue;
    const dist = Math.abs(t.time - value);
    if (dist <= bestDist) {
      best = t;
      bestDist = dist;
    }
  }

  return best ? { value: best.time, hit: best } : { value, hit: null };
}

/**
 * Build the canonical list of snap targets for a Director's Cut timeline.
 * Caller can prepend playhead / extra markers as needed.
 */
export function buildSnapTargets(opts: {
  scenes: Array<{ id: string; start_time: number; end_time: number }>;
  cutMarkers?: number[];
  duration?: number;
  playhead?: number;
  excludeSceneId?: string;
}): SnapTarget[] {
  const targets: SnapTarget[] = [];

  targets.push({ time: 0, kind: 'timeline-start' });
  if (opts.duration && opts.duration > 0) {
    targets.push({ time: opts.duration, kind: 'timeline-end' });
  }

  for (const s of opts.scenes) {
    if (s.id === opts.excludeSceneId) continue;
    targets.push({ time: s.start_time, kind: 'scene-start', sceneId: s.id });
    targets.push({ time: s.end_time, kind: 'scene-end', sceneId: s.id });
  }

  for (const m of opts.cutMarkers ?? []) {
    targets.push({ time: m, kind: 'cut-marker' });
  }

  if (typeof opts.playhead === 'number') {
    targets.push({ time: opts.playhead, kind: 'playhead' });
  }

  return targets;
}

/**
 * Convert a pixel threshold (e.g. 8 px) to seconds for a given zoom (px/sec).
 * Clamped to a reasonable range so it never becomes useless.
 */
export function pxThresholdToSec(px: number, zoom: number): number {
  if (!zoom || zoom <= 0) return 0.2;
  return Math.min(0.5, Math.max(0.05, px / zoom));
}
