/**
 * Shared Transition Resolver — single source of truth for both preview and export.
 * Resolves transition windows from scenes + transition assignments.
 */

export interface ResolvedTransition {
  /** Index of the outgoing scene */
  sceneIndex: number;
  /** ID of the outgoing scene */
  outgoingSceneId: string;
  /** ID of the incoming scene */
  incomingSceneId: string;
  /** Transition type base (crossfade, fade, wipe, etc.) */
  baseType: string;
  /** Direction for directional transitions */
  direction: string;
  /** Full original type string */
  fullType: string;
  /** Effective duration in seconds */
  duration: number;
  /** Timeline start of transition window */
  tStart: number;
  /** Timeline end of transition window */
  tEnd: number;
  /** Original boundary (original_end_time of outgoing scene) */
  originalBoundary: number;
  /** Offset in seconds */
  offsetSeconds: number;
}

export interface TransitionInput {
  sceneId: string;
  transitionType: string;
  duration: number;
  offsetSeconds?: number;
  // Export format uses these instead:
  sceneIndex?: number;
  type?: string;
}

export interface SceneInput {
  id: string;
  start_time?: number;
  end_time?: number;
  original_start_time?: number;
  original_end_time?: number;
  // camelCase variants from Remotion
  startTime?: number;
  endTime?: number;
  originalStartTime?: number;
  originalEndTime?: number;
}

const DEFAULT_DURATION = 1.2;
const MIN_DURATION = 0.6;

/**
 * Resolve all transition windows from scenes and transition assignments.
 * Works with both snake_case (preview) and camelCase (Remotion) scene formats.
 * Sequential clamping prevents overlapping windows.
 */
export function resolveTransitions(
  scenes: SceneInput[],
  transitions: TransitionInput[],
): ResolvedTransition[] {
  if (scenes.length < 2 || !transitions || transitions.length === 0) return [];

  const resolved: ResolvedTransition[] = [];
  let prevEnd = -Infinity;

  console.log('[resolveTransitions] INPUT transitions:', transitions.map(t => ({
    sceneId: t.sceneId, type: t.transitionType ?? t.type, duration: t.duration, sceneIndex: t.sceneIndex
  })));

  for (let i = 0; i < scenes.length - 1; i++) {
    const scene = scenes[i];
    const nextScene = scenes[i + 1];

    // Find transition for this scene — prefer sceneId match, fallback to sceneIndex
    const transition = transitions.find(t =>
      t.sceneId ? t.sceneId === scene.id : t.sceneIndex === i
    );

    if (!transition) continue;

    const fullType = (transition.transitionType ?? transition.type ?? 'none').toLowerCase();
    if (fullType === 'none') continue;

    const parts = fullType.split('-');
    const baseType = parts[0];
    const direction = parts[1] || 'left';

    const tDuration = Math.max(MIN_DURATION, transition.duration || DEFAULT_DURATION);
    const leadIn = tDuration * 0.05;
    const leadOut = tDuration * 0.95;
    const offset = transition.offsetSeconds ?? 0;

    // Get original boundary in source time domain
    const originalBoundary =
      scene.original_end_time ?? scene.originalEndTime ?? scene.end_time ?? scene.endTime ?? 0;
    const boundary = originalBoundary + offset;

    const tStart = Math.max(boundary - leadIn, prevEnd);
    const tEnd = boundary + leadOut;
    prevEnd = tEnd;

    resolved.push({
      sceneIndex: i,
      outgoingSceneId: scene.id,
      incomingSceneId: nextScene.id,
      baseType,
      direction,
      fullType,
      duration: tEnd - tStart,
      tStart,
      tEnd,
      originalBoundary,
      offsetSeconds: offset,
    });
  }

  return resolved;
}

/**
 * Find the active transition at a given time.
 * Returns the resolved transition and progress (0-1, eased).
 */
export function findActiveTransition(
  time: number,
  resolvedTransitions: ResolvedTransition[],
): { transition: ResolvedTransition; progress: number; rawProgress: number } | null {
  for (const rt of resolvedTransitions) {
    if (time >= rt.tStart && time < rt.tEnd) {
      const rawProgress = (time - rt.tStart) / rt.duration;
      const progress = Math.pow(0.5 - 0.5 * Math.cos(rawProgress * Math.PI), 0.7);
      return { transition: rt, progress, rawProgress };
    }
  }
  return null;
}

/**
 * Check if time falls in a frame-freeze phase (offset > 0, between original boundary and tStart).
 */
export function findFreezePhase(
  time: number,
  resolvedTransitions: ResolvedTransition[],
): ResolvedTransition | null {
  for (const rt of resolvedTransitions) {
    if (rt.offsetSeconds > 0 && time >= rt.originalBoundary && time < rt.tStart) {
      return rt;
    }
  }
  return null;
}
