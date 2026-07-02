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
  /** Original boundary (original_end_time of outgoing scene — source time) */
  originalBoundary: number;
  /** Timeline boundary (end_time of outgoing scene — timeline time) */
  timelineBoundary: number;
  /** Offset in seconds */
  offsetSeconds: number;
  /** NLE placement model chosen by the resolver */
  placement: 'centered' | 'start-at-cut';
  /** Whether the outgoing clip has enough tail handle for a centered transition */
  hasOutgoingHandle: boolean;
  /** Whether the incoming clip has enough head handle for a centered transition */
  hasIncomingHandle: boolean;
  /** Alias used by UI/export code */
  effectiveDuration: number;
  /** Alias used by UI/export code */
  visualStart: number;
  /** Alias used by UI/export code */
  visualEnd: number;
  /** Timeline cut point between outgoing and incoming scenes */
  cutTime: number;
}

export interface TransitionInput {
  sceneId: string;
  transitionType: string;
  duration: number;
  anchorTime?: number;
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
  media_source_start?: number;
  media_source_end?: number;
  mediaSourceStart?: number;
  mediaSourceEnd?: number;
  playbackRate?: number;
}

const DEFAULT_DURATION = 1.2;
const MIN_DURATION = 0.1;

const readStart = (scene: SceneInput) => scene.start_time ?? scene.startTime ?? 0;
const readEnd = (scene: SceneInput) => scene.end_time ?? scene.endTime ?? readStart(scene);
const readSourceStart = (scene: SceneInput) => scene.original_start_time ?? scene.originalStartTime ?? readStart(scene);
const readSourceEnd = (scene: SceneInput) => scene.original_end_time ?? scene.originalEndTime ?? readEnd(scene);
const readFullSourceStart = (scene: SceneInput) => scene.media_source_start ?? scene.mediaSourceStart ?? readSourceStart(scene);
const readFullSourceEnd = (scene: SceneInput) => scene.media_source_end ?? scene.mediaSourceEnd ?? readSourceEnd(scene);

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

    const requestedDuration = Math.max(MIN_DURATION, transition.duration || DEFAULT_DURATION);
    // Legacy builds allowed negative offsets / custom anchors. Those make the
    // transition start before the cut, which reads as "the transition is already
    // over when the next scene appears". Keep only positive delay support and
    // always anchor the default window to the actual timeline cut.
    const offset = Math.max(0, transition.offsetSeconds ?? 0);

    // Get original boundary in source time domain
    const originalBoundary = readSourceEnd(scene);
    
    // Use TIMELINE boundary (end_time) for transition window calculation.
    // NLE-friendly default: the transition starts AT the cut, not half before it.
    // Deprecated anchorTime is intentionally ignored to avoid stale early anchors.
    const timelineBoundary = readEnd(scene);
    const cutTime = timelineBoundary;
    const halfDuration = requestedDuration / 2;

    // Professional NLEs use centered transitions when both clips expose
    // source handles around the cut. If the editor cannot prove handles exist,
    // fall back to a deterministic edge transition that starts at the cut and
    // holds the outgoing frame while the incoming clip plays underneath.
    const outgoingTailHandle = Math.max(0, readFullSourceEnd(scene) - readSourceEnd(scene));
    const incomingHeadHandle = Math.max(0, readSourceStart(nextScene) - readFullSourceStart(nextScene));
    const hasOutgoingHandle = outgoingTailHandle >= halfDuration - 0.001;
    const hasIncomingHandle = incomingHeadHandle >= halfDuration - 0.001;
    const canCenterOnTimeline = readStart(scene) <= cutTime - halfDuration && readEnd(nextScene) >= cutTime + halfDuration;
    const placement: ResolvedTransition['placement'] =
      hasOutgoingHandle && hasIncomingHandle && canCenterOnTimeline ? 'centered' : 'start-at-cut';

    const rawStart = placement === 'centered'
      ? cutTime - halfDuration + offset
      : cutTime + offset;

    const tStart = Math.max(rawStart, prevEnd);
    const tEnd = tStart + requestedDuration;
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
      timelineBoundary,
      offsetSeconds: offset,
      placement,
      hasOutgoingHandle,
      hasIncomingHandle,
      effectiveDuration: tEnd - tStart,
      visualStart: tStart,
      visualEnd: tEnd,
      cutTime,
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
    if (rt.offsetSeconds > 0 && time >= rt.timelineBoundary && time < rt.tStart) {
      return rt;
    }
  }
  return null;
}
