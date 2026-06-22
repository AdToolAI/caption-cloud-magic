/**
 * Motion Studio / Video Composer — Project Budget Enforcement
 *
 * Hard cap: every Composer project may total at most MAX_PROJECT_SECONDS (10 min).
 * This is checked client-side on every scene-duration change and on "Add Scene".
 *
 * Lipsync / render / stitch pipelines are NOT affected — they operate per scene
 * and never read this constant.
 */
import type { ComposerScene } from "@/types/video-composer";

export const MAX_PROJECT_SECONDS = 600; // 10 minutes
export const MIN_SCENE_SECONDS = 3;
export const MAX_SCENE_SECONDS = 15;

/** Sum of durations of every scene EXCEPT the one with `excludeSceneId`. */
export function sumOtherScenesDuration(
  scenes: ComposerScene[] | undefined | null,
  excludeSceneId?: string,
): number {
  if (!Array.isArray(scenes)) return 0;
  return scenes.reduce((sum, s) => {
    if (excludeSceneId && s.id === excludeSceneId) return sum;
    const d = Number(s?.durationSeconds);
    return sum + (Number.isFinite(d) ? d : 0);
  }, 0);
}

/** Total of all scene durations. */
export function sumAllScenesDuration(
  scenes: ComposerScene[] | undefined | null,
): number {
  return sumOtherScenesDuration(scenes, undefined);
}

/**
 * Maximum value the duration slider for ONE scene may show, given the
 * remaining project budget. Falls back to provider hard-cap (15 s) when
 * plenty of budget is left.
 */
export function maxDurationForScene(
  scenes: ComposerScene[] | undefined | null,
  sceneId?: string,
): number {
  const otherTotal = sumOtherScenesDuration(scenes, sceneId);
  const remaining = Math.max(0, MAX_PROJECT_SECONDS - otherTotal);
  return Math.max(MIN_SCENE_SECONDS, Math.min(MAX_SCENE_SECONDS, remaining));
}

/**
 * Whether the user can still add another scene (need at least MIN_SCENE_SECONDS
 * free in the budget).
 */
export function canAddScene(
  scenes: ComposerScene[] | undefined | null,
): boolean {
  return sumAllScenesDuration(scenes) <= MAX_PROJECT_SECONDS - MIN_SCENE_SECONDS;
}

/** "m:ss" / "ss s" formatter for budget labels. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Color band for the budget bar. */
export function budgetTone(totalSec: number): "green" | "amber" | "red" {
  if (totalSec >= MAX_PROJECT_SECONDS) return "red";
  if (totalSec >= MAX_PROJECT_SECONDS * 0.8) return "amber";
  return "green";
}
