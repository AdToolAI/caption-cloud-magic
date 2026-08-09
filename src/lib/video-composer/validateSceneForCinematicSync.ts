import { tx } from "@/lib/i18nText";
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
        tx({ de: 'Lip-Sync gewählt, aber weder Cast noch Dialog-Skript. Render fällt automatisch auf reine B-Roll-Plate zurück.', en: 'Lip-Sync selected, but neither Cast nor Dialog Script. Render automatically falls back to pure B-Roll Plate.', es: 'Sincronización labial seleccionada, pero sin elenco ni guion de diálogo. La renderización vuelve automáticamente a una placa de B-Roll pura.' }),
    });
  }

  if (hasCast && !hasPortrait) {
    out.push({
      code: 'cast_missing_portrait',
      level: 'warning',
      message:
        tx({ de: 'Cast vorhanden, aber kein Charakter-Portrait aufgelöst. Scene-Anchor (Nano Banana 2) kann scheitern — dann erfolgt automatisch eine Migration auf Hailuo ohne Lip-Sync auf dem Avatar.', en: 'Cast available, but no character portrait resolved. Scene-Anchor (Nano Banana 2) may fail — then an automatic migration to Hailuo without Lip-Sync on the avatar occurs.', es: 'Elenco disponible, pero no se resolvió ningún retrato de personaje. Scene-Anchor (Nano Banana 2) puede fallar — entonces se produce una migración automática a Hailuo sin sincronización labial en el avatar.' }),
    });
  }

  // Provider lip-sync allowlist (July 2026 policy: providers whose i2v output
  // reliably produces realistic, speaking human faces that pass Sync.so's
  // face-gate on lipsync-2-pro. Pipeline itself is unchanged.)
  const LIPSYNC_ALLOWED = new Set([
    'ai-hailuo',
    'ai-happyhorse',
    'ai-kling',
    'ai-seedance',
    'ai-wan',
  ]);
  if (!LIPSYNC_ALLOWED.has(provider)) {
    out.push({
      code: 'provider_no_lipsync_support',
      level: 'warning',
      message: tx({ de: tx({ de: tx({ de: `Lip-Sync ist zertifiziert für HappyHorse, Hailuo, Kling, Seedance und Wan. Aktuell: ${PROVIDER_CAPS[provider]?.label ?? provider} — Auto-Fallback auf Hailuo.`, en: `Lip-sync is certified for HappyHorse, Hailuo, Kling, Seedance, and Wan. Current: ${PROVIDER_CAPS[provider]?.label ?? provider} — auto-fallback to Hailuo.`, es: `La sincronización labial está certificada para HappyHorse, Hailuo, Kling, Seedance y Wan. Actual: ${PROVIDER_CAPS[provider]?.label ?? provider} — retroceso automático a Hailuo.` }), en: `Lip-sync is certified for HappyHorse, Hailuo, Kling, Seedance, and Wan. Current: ${PROVIDER_CAPS[provider]?.label ?? provider} — auto-fallback to Hailuo.`, es: `La sincronización labial está certificada para HappyHorse, Hailuo, Kling, Seedance y Wan. Actual: ${PROVIDER_CAPS[provider]?.label ?? provider} — retroceso automático a Hailuo.` }), en: `Lip-sync is certified for HappyHorse, Hailuo, Kling, Seedance, and Wan. Current: ${PROVIDER_CAPS[provider]?.label ?? provider} — auto-fallback to Hailuo.`, es: `La sincronización labial está certificada para HappyHorse, Hailuo, Kling, Seedance y Wan. Actual: ${PROVIDER_CAPS[provider]?.label ?? provider} — retroceso automático a Hailuo.` }),
    });
  }


  // Provider-specific duration validation
  const allowedDurations = getProviderDurations(provider);
  if (duration > 0 && !allowedDurations.includes(Math.round(duration))) {
    out.push({
      code: 'duration_not_supported_by_provider',
      level: 'warning',
      message: tx({ de: tx({ de: tx({ de: `${PROVIDER_CAPS[provider]?.label ?? provider} unterstützt nur ${allowedDurations.join('s, ')}s. Gewählt: ${duration}s — wird beim Render auf den nächstmöglichen Wert angepasst.`, en: `${PROVIDER_CAPS[provider]?.label ?? provider} only supports ${allowedDurations.join('s, ')}s. Selected: ${duration}s — will be adjusted to the closest possible value on render.`, es: `${PROVIDER_CAPS[provider]?.label ?? provider} solo admite ${allowedDurations.join('s, ')}s. Seleccionado: ${duration}s — se ajustará al valor más cercano posible al renderizar.` }), en: `${PROVIDER_CAPS[provider]?.label ?? provider} only supports ${allowedDurations.join('s, ')}s. Selected: ${duration}s — will be adjusted to the closest possible value on render.`, es: `${PROVIDER_CAPS[provider]?.label ?? provider} solo admite ${allowedDurations.join('s, ')}s. Seleccionado: ${duration}s — se ajustará al valor más cercano posible al renderizar.` }), en: `${PROVIDER_CAPS[provider]?.label ?? provider} only supports ${allowedDurations.join('s, ')}s. Selected: ${duration}s — will be adjusted to the closest possible value on render.`, es: `${PROVIDER_CAPS[provider]?.label ?? provider} solo admite ${allowedDurations.join('s, ')}s. Seleccionado: ${duration}s — se ajustará al valor más cercano posible al renderizar.` }),
    });
  }

  // HappyHorse multi-speaker is allowed but flagged as Beta
  if (provider === 'ai-happyhorse' && countSpeakers(scene) >= 2) {
    out.push({
      code: 'happyhorse_multispeaker_beta',
      level: 'info',
      message:
        tx({ de: 'HappyHorse mit mehreren Sprechern (Beta) — falls die Plate Sync.so-Face-Detection nicht besteht, werden die Credits automatisch refundiert.', en: 'HappyHorse with multiple speakers (Beta) — if the Plate fails Sync.so face detection, credits will be automatically refunded.', es: 'HappyHorse con varios oradores (Beta) — si la placa falla la detección facial de Sync.so, los créditos se reembolsarán automáticamente.' }),
    });
  }

  return out;
}
