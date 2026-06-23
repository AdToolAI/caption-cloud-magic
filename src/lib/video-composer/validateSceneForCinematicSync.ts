/**
 * validateSceneForCinematicSync — Frontend-only preflight hint.
 *
 * Pure read-only validator. Does NOT block any render. Returns a list of
 * human-readable warnings to surface above the Render button so the user
 * understands what will happen at dispatch time. The Lip-Sync pipeline
 * itself (compose-dialog-segments, sync.so webhook, dialog_shots) is NOT
 * called from here — this is UI sugar only.
 */
import type { ComposerScene } from '@/types/video-composer';

export type SceneCinematicSyncWarning = {
  code:
    | 'cast_missing_portrait'
    | 'happyhorse_will_auto_migrate'
    | 'no_cast_no_dialog_lipsync_pointless';
  level: 'info' | 'warning';
  message: string;
};

function hasResolvableCastPortrait(scene: ComposerScene): boolean {
  const shots = Array.isArray(scene.characterShots) ? scene.characterShots : [];
  for (const cs of shots) {
    if (!cs || cs.shotType === 'absent') continue;
    if (cs.characterId || (cs as any).referenceImageUrl || (cs as any).portraitUrl) {
      return true;
    }
  }
  const single = (scene as any).characterShot;
  if (single && single.shotType !== 'absent' && (single.characterId || single.portraitUrl)) {
    return true;
  }
  return false;
}

function sceneHasAnyCastSlot(scene: ComposerScene): boolean {
  const shots = Array.isArray(scene.characterShots) ? scene.characterShots : [];
  if (shots.some((cs) => cs && cs.shotType !== 'absent')) return true;
  const single = (scene as any).characterShot;
  return !!(single && single.shotType !== 'absent');
}

export function validateSceneForCinematicSync(
  scene: ComposerScene,
): SceneCinematicSyncWarning[] {
  const out: SceneCinematicSyncWarning[] = [];
  const engine = scene.engineOverride ?? 'auto';
  const isSyncEngine = engine === 'cinematic-sync' || engine === 'sync-segments';
  if (!isSyncEngine) return out;

  const hasDialog = ((scene.dialogScript ?? '').trim().length) > 0;
  const hasCast = sceneHasAnyCastSlot(scene);
  const hasPortrait = hasResolvableCastPortrait(scene);

  if (!hasCast && !hasDialog) {
    out.push({
      code: 'no_cast_no_dialog_lipsync_pointless',
      level: 'warning',
      message:
        'Lip-Sync gewählt, aber weder Cast noch Dialog-Skript. Render fällt automatisch auf reine B-Roll-Plate zurück.',
    });
  }

  if (hasCast && !hasPortrait) {
    out.push({
      code: 'cast_missing_portrait',
      level: 'warning',
      message:
        'Cast vorhanden, aber kein Charakter-Portrait aufgelöst. Scene-Anchor (Nano Banana 2) kann scheitern — dann erfolgt automatisch eine Migration auf Hailuo ohne Lip-Sync auf dem Avatar.',
    });
  }

  if ((scene.clipSource as string) === 'ai-happyhorse') {
    out.push({
      code: 'happyhorse_will_auto_migrate',
      level: 'info',
      message:
        'HappyHorse + Lip-Sync wird vor dem Render automatisch auf Hailuo migriert — HappyHorse ist als Master-Plate für Sync.so nicht stabil.',
    });
  }

  return out;
}
