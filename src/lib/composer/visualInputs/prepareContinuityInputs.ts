import { captureTransitionFrame } from './transitionFrame';
import { isLipSyncIntentionalRow } from '@/lib/video-composer/lipSyncIntent';
import type { ComposerScene } from '@/types/video-composer';

export interface ContinuityInput {
  transitionFrameUrl?: string;
  previousClipUrl?: string;
}

/**
 * Collects the continuity inputs for a render run: for every scene that is
 * about to be generated, the last usable frame (and clip URL) of the scene
 * directly before it in the timeline.
 *
 * Deliberately conservative:
 *  - scenes with lip-sync intent are skipped entirely (their first frame is
 *    the protected identity anchor of the frozen v400 chain),
 *  - scenes the user pinned to `match-cut` / `identity` are skipped,
 *  - a failed capture is silently dropped — the render then simply runs
 *    without continuity instead of failing.
 *
 * The resolver on the server has the final say; this only supplies material.
 */
export async function prepareContinuityInputs(
  orderedScenes: ComposerScene[],
  targetSceneIds: string[],
  userId: string | null | undefined,
): Promise<Map<string, ContinuityInput>> {
  const out = new Map<string, ContinuityInput>();
  if (!userId) return out;

  const targets = new Set(targetSceneIds);

  const jobs = orderedScenes.map(async (scene, index) => {
    if (!targets.has(scene.id) || index === 0) return;
    if (!scene.clipSource?.startsWith('ai-')) return;
    if (scene.visualContinuity === 'match-cut' || scene.visualContinuity === 'identity') return;
    if (isLipSyncIntentionalRow(scene as never)) return;

    const previous = orderedScenes[index - 1];
    const previousClipUrl = previous?.clipUrl;
    if (!previousClipUrl) return;

    const entry: ContinuityInput = { previousClipUrl };
    try {
      const frame = await captureTransitionFrame(previousClipUrl, userId);
      entry.transitionFrameUrl = frame.url;
      if (frame.degraded) {
        console.warn(
          `[continuity] scene ${scene.id}: no clean end frame in the previous clip — using the best available one`,
        );
      }
    } catch (err) {
      console.warn(`[continuity] scene ${scene.id}: frame capture skipped`, err);
    }
    out.set(scene.id, entry);
  });

  await Promise.all(jobs);
  return out;
}
