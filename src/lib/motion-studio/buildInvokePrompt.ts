/**
 * buildInvokePrompt — single-scene prompt composition for invoke calls.
 *
 * Both useSceneGenerate and SceneDialogStudio used to send `scene.aiPrompt`
 * raw to `compose-video-clips`, which silently dropped `scene.performance`
 * (mimik/gestik/blick/energy) and `scene.actionBeat` — the very fields the
 * Briefing-Plan extracts and `useApplyProductionPlan` writes to the DB. The
 * "Render all" path already runs composeFinalPrompt so it didn't suffer.
 *
 * This helper mirrors that path with the minimum inputs available to a
 * single-scene invoke: rawPrompt + shotDirector + directorModifiers +
 * cinematicStylePreset + performanceEntries. Brand/library lookups are
 * intentionally NOT redone here — single-scene callers already render with
 * the Cinematic-Sync master plate which handles character anchoring.
 */
import { composeFinalPrompt, type DirectorLanguage } from './composeFinalPrompt';
import { derivePerformanceEntries } from './buildPerformanceBlock';
import type { ComposerScene, ComposerCharacter } from '@/types/video-composer';

export function buildInvokePrompt(
  scene: ComposerScene,
  characters: ComposerCharacter[] | undefined,
  language: DirectorLanguage = 'en',
): { aiPrompt: string; negativePrompt?: string } {
  try {
    const composed = composeFinalPrompt({
      rawPrompt: scene.aiPrompt || '',
      directorModifiers: scene.directorModifiers,
      shotDirector: scene.shotDirector,
      cinematicStylePresetId: (scene as any).cinematicStylePresetId,
      audioPlan: scene.audioPlan,
      performanceEntries: derivePerformanceEntries(scene, characters ?? []),
      language,
    });
    return {
      aiPrompt: composed.finalPrompt || scene.aiPrompt || '',
      negativePrompt: composed.negativePrompt || undefined,
    };
  } catch (err) {
    console.warn('[buildInvokePrompt] compose failed, falling back to raw', err);
    return { aiPrompt: scene.aiPrompt || '' };
  }
}
