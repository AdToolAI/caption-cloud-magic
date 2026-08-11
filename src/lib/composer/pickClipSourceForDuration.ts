/**
 * v416 — Duration-aware clip-source selection.
 *
 * Most video models cap out at 10–15 s per scene. Only Seedance 2.5
 * (ModelArk) can render a single shot up to 30 s. When a briefing asks for
 * long scenes we therefore MUST route those scenes to Seedance 2.5, otherwise
 * the clip job fails or gets silently truncated by the provider.
 *
 * Everything here is derived from `AI_VIDEO_TOOLKIT_MODELS` so the registry
 * stays the single source of truth for durations.
 */
import { AI_VIDEO_TOOLKIT_MODELS } from '@/config/aiVideoModelRegistry';
import { sourceToModelId, modelIdToSource } from '@/lib/video-composer/modelMapping';
import type { ClipSource } from '@/types/video-composer';

/** Long-form provider: the only composer source that can do >15 s per scene. */
export const LONG_FORM_CLIP_SOURCE: ClipSource = 'ai-seedance25';

/** Max scene seconds supported by any composer model (Seedance 2.5 → 30 s). */
export const ABSOLUTE_MAX_SCENE_SECONDS = 30;

/** Max seconds a given clip source can render in ONE scene. */
export function maxSecondsForClipSource(source: ClipSource | string | undefined | null): number {
  if (!source) return 15;
  const src = String(source);
  if (src === 'stock' || src === 'stock-image' || src === 'upload' || src === 'ai-image') {
    return ABSOLUTE_MAX_SCENE_SECONDS;
  }
  const modelId = sourceToModelId(src as ClipSource, 'standard');
  const model = AI_VIDEO_TOOLKIT_MODELS.find((m) => m.id === modelId);
  const durations = model?.durations ?? [];
  if (!durations.length) return 15;
  return Math.max(...durations);
}

/** True when the requested duration exceeds what the source can render. */
export function exceedsSourceDuration(
  source: ClipSource | string | undefined | null,
  durationSeconds: number,
): boolean {
  return Math.round(durationSeconds) > maxSecondsForClipSource(source);
}

/**
 * Pick the clip source for a scene of `durationSeconds`.
 *
 * - Non-dialog scenes longer than the preferred source allows are moved to
 *   Seedance 2.5, the only long-form provider.
 * - Dialog / lip-sync scenes may only be re-routed to Seedance 2.5 when the
 *   v418 rollout flag certified it as a lip-sync plate provider
 *   (`longFormDialogAllowed`, fed by `useSeedance25Lipsync()`). Without the
 *   flag they keep their certified provider and are merely clamped.
 */
export function pickClipSourceForDuration(input: {
  durationSeconds: number;
  preferred?: ClipSource | string | null;
  dialogMode?: boolean;
  /** v418 — Seedance 2.5 is certified for lip-sync for this account. */
  longFormDialogAllowed?: boolean;
}): { clipSource: ClipSource; durationSeconds: number; switched: boolean } {
  const requested = Math.max(1, Math.round(input.durationSeconds || 0));
  const preferred = (input.preferred as ClipSource) || 'ai-hailuo';

  if (input.dialogMode && !input.longFormDialogAllowed) {
    return {
      clipSource: preferred,
      durationSeconds: Math.min(requested, maxSecondsForClipSource(preferred)),
      switched: false,
    };
  }

  if (!exceedsSourceDuration(preferred, requested)) {
    return { clipSource: preferred, durationSeconds: requested, switched: false };
  }

  const longFormMax = maxSecondsForClipSource(LONG_FORM_CLIP_SOURCE);
  return {
    clipSource: LONG_FORM_CLIP_SOURCE,
    durationSeconds: Math.min(requested, longFormMax),
    switched: preferred !== LONG_FORM_CLIP_SOURCE,
  };
}


/** Snap a duration to the nearest allowed value of the given source. */
export function snapDurationToSource(
  source: ClipSource | string | undefined | null,
  durationSeconds: number,
): number {
  const modelId = sourceToModelId((source || 'ai-hailuo') as ClipSource, 'standard');
  const model = AI_VIDEO_TOOLKIT_MODELS.find((m) => m.id === modelId);
  const durations = model?.durations;
  if (!durations?.length) return Math.round(durationSeconds);
  return durations.reduce((best, d) =>
    Math.abs(d - durationSeconds) < Math.abs(best - durationSeconds) ? d : best,
  durations[0]);
}

/** Re-export for callers that need the reverse mapping in one import. */
export { modelIdToSource };
