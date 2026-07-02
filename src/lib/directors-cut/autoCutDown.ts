import type { SceneAnalysis } from '@/types/directors-cut';

/**
 * W4.4 Auto-Cut-Down
 *
 * Produces short-form ad cutdowns (15s / 6s / custom) from a master timeline.
 *
 * Strategy:
 *  1. Always keep the HOOK (first scene) and the PAYOFF (last scene).
 *  2. Fill the remaining budget with the strongest middle beats
 *     (ranked by current timeline duration, descending).
 *  3. Proportionally shrink kept scenes so their total equals target,
 *     preserving each scene's source-in point (identity anchor stays intact).
 *  4. Re-lay start/end times contiguously.
 *
 * Pure — no side effects. Callers can preview or apply via setScenes+commitHistory.
 */

export type CutDownPreset = 15 | 6;

export interface CutDownPlan {
  target: number;
  scenes: SceneAnalysis[];
  keptIndexes: number[];
  droppedIndexes: number[];
  shrinkRatio: number;
  feasible: boolean;
  reason: string;
}

const MIN_SCENE_DURATION = 0.6; // seconds — anything shorter reads as a glitch

function sceneDuration(s: SceneAnalysis): number {
  return Math.max(0, (s.end_time ?? 0) - (s.start_time ?? 0));
}

export function computeCutDown(
  scenes: SceneAnalysis[],
  target: number,
): CutDownPlan {
  if (!scenes || scenes.length === 0) {
    return {
      target,
      scenes: [],
      keptIndexes: [],
      droppedIndexes: [],
      shrinkRatio: 1,
      feasible: false,
      reason: 'Keine Szenen in der Timeline.',
    };
  }

  const currentTotal = scenes.reduce((acc, s) => acc + sceneDuration(s), 0);
  if (currentTotal <= target + 0.05) {
    return {
      target,
      scenes: [...scenes],
      keptIndexes: scenes.map((_, i) => i),
      droppedIndexes: [],
      shrinkRatio: 1,
      feasible: true,
      reason: `Master ist bereits ≤ ${target}s (${currentTotal.toFixed(1)}s) — kein Cut-Down nötig.`,
    };
  }

  // 1. Force-keep hook + payoff.
  const forceKeep = new Set<number>();
  forceKeep.add(0);
  if (scenes.length > 1) forceKeep.add(scenes.length - 1);

  // 2. Rank middle scenes by duration desc, fill budget with min-duration slots.
  const middle = scenes
    .map((s, idx) => ({ idx, dur: sceneDuration(s) }))
    .filter((x) => !forceKeep.has(x.idx))
    .sort((a, b) => b.dur - a.dur);

  const minPerKept = MIN_SCENE_DURATION;
  const budget = target;
  let reservedForForced = forceKeep.size * minPerKept;
  const kept = new Set<number>(forceKeep);

  for (const m of middle) {
    if (reservedForForced + kept.size * 0 + (kept.size - forceKeep.size + 1) * minPerKept + reservedForForced - reservedForForced > budget) {
      // safeguard — shouldn't hit; explicit check below is the real gate
    }
    const projected = kept.size + 1;
    if (projected * minPerKept <= budget) {
      kept.add(m.idx);
    } else {
      break;
    }
  }

  const keptIndexes = Array.from(kept).sort((a, b) => a - b);
  const droppedIndexes = scenes.map((_, i) => i).filter((i) => !kept.has(i));

  const keptTotal = keptIndexes.reduce((acc, i) => acc + sceneDuration(scenes[i]), 0);
  const shrinkRatio = keptTotal > 0 ? Math.min(1, target / keptTotal) : 1;

  // 3. Rebuild kept scenes with proportional shrink + contiguous timeline.
  let cursor = 0;
  const out: SceneAnalysis[] = keptIndexes.map((i) => {
    const s = scenes[i];
    const origDur = sceneDuration(s);
    let newDur = Math.max(MIN_SCENE_DURATION, origDur * shrinkRatio);

    // Cap by media source range (do not read past end of source).
    const srcStart = s.original_start_time ?? s.start_time ?? 0;
    const srcEndAvail = s.media_source_end;
    if (typeof srcEndAvail === 'number') {
      const maxAvail = Math.max(MIN_SCENE_DURATION, srcEndAvail - srcStart);
      newDur = Math.min(newDur, maxAvail);
    }

    const start = cursor;
    const end = cursor + newDur;
    cursor = end;

    return {
      ...s,
      id: `${s.id}__cd${target}`,
      start_time: start,
      end_time: end,
      // Preserve identity anchor: keep original_* pointing at the same source frame.
      original_start_time: srcStart,
      original_end_time: srcStart + newDur,
    };
  });

  const finalTotal = cursor;
  const feasible = Math.abs(finalTotal - target) < 0.75; // 0.75s tolerance

  return {
    target,
    scenes: out,
    keptIndexes,
    droppedIndexes,
    shrinkRatio,
    feasible,
    reason: feasible
      ? `${keptIndexes.length}/${scenes.length} Szenen behalten, auf ${finalTotal.toFixed(1)}s gestrafft.`
      : `Cut-Down erreicht ${finalTotal.toFixed(1)}s (Ziel ${target}s) — Quelle zu kurz für exaktes Ziel.`,
  };
}
