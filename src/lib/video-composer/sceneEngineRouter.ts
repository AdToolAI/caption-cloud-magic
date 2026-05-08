/**
 * sceneEngineRouter — Pure routing logic that decides which generation engine
 * a Composer scene should use for *truly film-grade* output.
 *
 * Three engines (matched to the plan):
 *
 *  1. **heygen-talking-head** — frame-perfect lip-sync via HeyGen Photo Avatar.
 *     Used when a scene has dialog text AND a Brand-Character cast.
 *
 *  2. **sync-polish** — Hailuo/Seedance B-roll + sync.so/lipsync-2 polish.
 *     Used when the user explicitly enables `lipSyncWithVoiceover` on a non-
 *     dialog character close-up. Quality on AI faces is unreliable, so this
 *     is opt-in only.
 *
 *  3. **broll** — Hailuo/Seedance/etc. without lip-sync; VO plays as
 *     off-screen narration. The default for landscape, product, drone shots.
 *
 * The router is a *suggestion* — the SceneCard always lets the user override.
 */
import type { ComposerScene } from '@/types/video-composer';

export type SceneEngine = 'heygen-talking-head' | 'sync-polish' | 'broll';

export interface EngineRecommendation {
  engine: SceneEngine;
  /** UI label, German default. */
  label: string;
  /** Short tooltip explaining *why* this engine. */
  reason: string;
  /** Estimated extra cost in EUR over the base AI clip cost (HeyGen ≈ 0.30, sync ≈ 0.05). */
  extraCostEur: number;
}

/** Does this scene contain dialog the user actually wants spoken on-screen? */
export function sceneHasDialog(scene: ComposerScene): boolean {
  const script = (scene.dialogScript ?? '').trim();
  return script.length > 0;
}

/** Does this scene reference at least one Brand-Character (cast)? */
export function sceneHasCast(scene: ComposerScene): boolean {
  if (Array.isArray(scene.characterShots) && scene.characterShots.length > 0) {
    return scene.characterShots.some(
      (cs) => cs && cs.shotType !== 'absent' && (cs.characterId || (cs as any).name),
    );
  }
  if (scene.characterShot && scene.characterShot.shotType !== 'absent') return true;
  return false;
}

export function recommendEngineForScene(scene: ComposerScene): EngineRecommendation {
  const hasDialog = sceneHasDialog(scene);
  const hasCast = sceneHasCast(scene);

  if (hasDialog && hasCast) {
    return {
      engine: 'heygen-talking-head',
      label: '🎙️ HeyGen Lip-Sync',
      reason:
        'Charakter spricht im Bild — HeyGen Photo Avatar liefert frame-genauen Lip-Sync (Werbe-Niveau).',
      extraCostEur: 0.3,
    };
  }

  if (scene.lipSyncWithVoiceover && hasCast) {
    return {
      engine: 'sync-polish',
      label: '✨ Sync.so Polish',
      reason:
        'B-Roll mit Sync.so-Polish-Pass — Qualität auf KI-Gesichtern variiert, nutze HeyGen für sichere Sprecher-Inserts.',
      extraCostEur: 0.05,
    };
  }

  return {
    engine: 'broll',
    label: '🎬 B-Roll',
    reason: 'Off-Screen-Narration — Voiceover läuft über die Szene, keine Lip-Sync nötig.',
    extraCostEur: 0,
  };
}
