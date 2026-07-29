/**
 * Cutting rhythm — deterministic scene-duration planning.
 *
 * A spot where every scene is exactly 5 seconds reads as machine-made no matter
 * how good the pixels are. Real edits breathe: the hook is a blink, the proof
 * lingers, the sign-off resolves. This module assigns durations from the
 * narrative beat, then snaps them to what the engines can actually deliver.
 */

import type { SceneBeat, SceneGrammar } from './types';

/**
 * Relative weight per beat. Higher = more screen time. These come from how
 * conventional ad edits are cut, not from a model.
 */
const BEAT_WEIGHT: Record<SceneBeat, number> = {
  hook: 0.6,
  problem: 1.0,
  reveal: 0.85,
  proof: 1.35,
  benefit: 1.15,
  emotion: 1.25,
  cta: 0.9,
};

/** Engines refuse sub-3s clips; anything under this is padded. */
const MIN_SCENE_SECONDS = 3;
const MAX_SCENE_SECONDS = 10;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Distributes `totalSeconds` across beats using the weights above, then clamps
 * each scene into the engine-safe band and redistributes the remainder so the
 * total still lands on target.
 */
export function planRhythm(beats: SceneBeat[], totalSeconds: number): number[] {
  if (!beats.length) return [];

  const weights = beats.map((b) => BEAT_WEIGHT[b] ?? 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  let durations = weights.map((w) => (w / weightSum) * totalSeconds);

  // Clamp into the engine band. Track how much we had to add or remove.
  let debt = 0;
  durations = durations.map((d) => {
    const clamped = Math.min(MAX_SCENE_SECONDS, Math.max(MIN_SCENE_SECONDS, d));
    debt += d - clamped;
    return clamped;
  });

  // Give the debt back to the scenes that still have headroom, largest first,
  // so short punchy beats stay short.
  if (Math.abs(debt) > 0.05) {
    const order = durations
      .map((d, i) => ({ i, d }))
      .sort((a, b) => (debt > 0 ? b.d - a.d : a.d - b.d));
    for (const { i } of order) {
      if (Math.abs(debt) < 0.05) break;
      const room =
        debt > 0 ? MAX_SCENE_SECONDS - durations[i] : durations[i] - MIN_SCENE_SECONDS;
      if (room <= 0) continue;
      const shift = Math.sign(debt) * Math.min(Math.abs(debt), room);
      durations[i] += shift;
      debt -= shift;
    }
  }

  return durations.map(round1);
}

/** Applies planned durations onto scenes in place-safe fashion. */
export function applyRhythm(scenes: SceneGrammar[], totalSeconds: number): SceneGrammar[] {
  const durations = planRhythm(
    scenes.map((s) => s.beat),
    totalSeconds,
  );
  return scenes.map((scene, i) => ({ ...scene, durationSeconds: durations[i] ?? scene.durationSeconds }));
}

/**
 * Nudges cut points onto the nearest musical beat, but only when the shift is
 * small enough that the pacing intent survives. A cut dragged a full second to
 * hit a beat ruins the edit it was supposed to improve.
 */
export function snapCutsToBeats(
  durations: number[],
  beatTimes: number[],
  maxShiftSeconds = 0.25,
): number[] {
  if (!beatTimes.length || !durations.length) return durations;

  const cuts: number[] = [];
  let acc = 0;
  for (const d of durations) {
    acc += d;
    cuts.push(acc);
  }

  const snapped = cuts.map((cut, idx) => {
    // Never move the final cut — it defines total runtime.
    if (idx === cuts.length - 1) return cut;
    let best = cut;
    let bestDist = Infinity;
    for (const beat of beatTimes) {
      const dist = Math.abs(beat - cut);
      if (dist < bestDist) {
        bestDist = dist;
        best = beat;
      }
    }
    return bestDist <= maxShiftSeconds ? best : cut;
  });

  const out: number[] = [];
  let prev = 0;
  for (const cut of snapped) {
    out.push(round1(Math.max(MIN_SCENE_SECONDS, cut - prev)));
    prev = cut;
  }
  return out;
}

/**
 * Varies the camera move across consecutive scenes. Six identical slow push-ins
 * is the second-most obvious tell after uniform durations.
 */
export function diversifyCameraMoves(scenes: SceneGrammar[]): SceneGrammar[] {
  const alternatives: SceneGrammar['cameraMove'][] = [
    'slow_push_in',
    'handheld',
    'pan_right',
    'static',
    'slow_pull_out',
    'rack_focus',
    'tilt_up',
  ];

  let lastMove: string | null = null;
  let repeat = 0;

  return scenes.map((scene, i) => {
    if (scene.cameraMove === lastMove) {
      repeat += 1;
    } else {
      repeat = 0;
      lastMove = scene.cameraMove;
    }
    if (repeat < 1) return scene;

    const replacement = alternatives[(i + repeat) % alternatives.length];
    lastMove = replacement;
    repeat = 0;
    return { ...scene, cameraMove: replacement };
  });
}
