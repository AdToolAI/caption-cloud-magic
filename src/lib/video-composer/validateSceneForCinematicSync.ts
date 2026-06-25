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
import {
  PROVIDER_CAPS,
  getProviderDurations,
  providerSupportsLipsync,
} from './providerCapabilities';

export type SceneCinematicSyncWarning = {
  code:
    | 'cast_missing_portrait'
    | 'happyhorse_multispeaker_beta'
    | 'no_cast_no_dialog_lipsync_pointless'
    | 'duration_not_supported_by_provider'
    | 'provider_no_lipsync_support';
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

function countSpeakers(scene: ComposerScene): number {
  const dlg = String((scene as any).dialogScript ?? '').trim();
  if (!dlg) return 0;
  const re = /^\s*\[?\s*([A-Za-zÀ-ÿ][\w\s.'-]{0,60}?)\s*\]?\s*(?:[—\-–]\s*[^:：]{0,40})?\s*[:：]/;
  const names = new Set(
    dlg
      .split(/\r?\n/)
      .map((l) => l.match(re))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => m[1].trim().toLowerCase()),
  );
  return names.size;
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
  const provider = (scene.clipSource as string) || 'ai-hailuo';
  const duration = Number(scene.durationSeconds ?? 0);

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

  // Provider lip-sync capability
  if (!providerSupportsLipsync(provider)) {
    out.push({
      code: 'provider_no_lipsync_support',
      level: 'warning',
      message: `Provider ${PROVIDER_CAPS[provider]?.label ?? provider} unterstützt kein Lip-Sync. Bitte Hailuo (6/10s) oder HappyHorse (3–15s) wählen.`,
    });
  }

  // Provider-specific duration validation
  const allowedDurations = getProviderDurations(provider);
  if (duration > 0 && !allowedDurations.includes(Math.round(duration))) {
    out.push({
      code: 'duration_not_supported_by_provider',
      level: 'warning',
      message: `${PROVIDER_CAPS[provider]?.label ?? provider} unterstützt nur ${allowedDurations.join('s, ')}s. Gewählt: ${duration}s — wird beim Render auf den nächstmöglichen Wert angepasst.`,
    });
  }

  // HappyHorse multi-speaker is allowed but flagged as Beta
  if (provider === 'ai-happyhorse' && countSpeakers(scene) >= 2) {
    out.push({
      code: 'happyhorse_multispeaker_beta',
      level: 'info',
      message:
        'HappyHorse mit mehreren Sprechern (Beta) — falls die Plate Sync.so-Face-Detection nicht besteht, werden die Credits automatisch refundiert.',
    });
  }

  return out;
}
