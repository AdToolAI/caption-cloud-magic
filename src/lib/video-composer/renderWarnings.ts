import { tx } from "@/lib/i18nText";
/**
 * renderWarnings — derives contextual warnings for a scene about to be
 * rendered. Used by the Pre-Flight Confirm Dialog so the user sees
 * provider quirks (resolution down-grades, auto-migrations, beta paths)
 * BEFORE credits get spent.
 *
 * Pure read of scene state; no I/O, no side-effects.
 */

import type { ComposerScene } from '@/types/video-composer';
import { providerSupportsLipsync } from './providerCapabilities';

export type WarningLevel = 'info' | 'warning';

export interface RenderWarning {
  level: WarningLevel;
  message: string;
}

function isLipsyncScene(scene: ComposerScene): boolean {
  if (scene.withAudio === false) return false;
  if ((scene as any).engineOverride === 'cinematic-sync') return true;
  if ((scene as any).lipSyncWithVoiceover === true) return true;
  if (scene.dialogScript && scene.dialogScript.trim().length > 0) return true;
  return false;
}

function speakerCount(scene: ComposerScene): number {
  const voices = (scene as any).dialogVoices;
  if (voices && typeof voices === 'object') {
    return Math.max(1, Object.keys(voices).length);
  }
  return 1;
}

export function getRenderWarnings(scene: ComposerScene): RenderWarning[] {
  const out: RenderWarning[] = [];
  const src = scene.clipSource;
  const dur = Math.round(scene.durationSeconds || 0);
  const quality = (scene.clipQuality || 'standard') as string;
  const lipsync = isLipsyncScene(scene);

  // Hailuo 10s → 768p forced
  if (src === 'ai-hailuo' && dur >= 10 && quality !== 'standard') {
    out.push({
      level: 'warning',
      message: tx({ de: 'Hailuo bei 10s wird automatisch auf 768p gerendert (Provider-Limit).', en: 'Hailuo at 10s is automatically rendered at 768p (provider limit).', es: 'Hailuo a 10 segundos se renderiza automáticamente a 768p (límite del proveedor).' }),
    });
  }

  // HappyHorse multi-speaker is beta
  if (src === 'ai-happyhorse' && lipsync && speakerCount(scene) > 1) {
    out.push({
      level: 'warning',
      message:
        tx({ de: 'HappyHorse Multi-Speaker ist Beta — Identity-Drift möglich. Hailuo ist die stabile Empfehlung.', en: 'HappyHorse Multi-Speaker is beta — identity drift possible. Hailuo is the stable recommendation.', es: 'HappyHorse Multi-Speaker es beta: es posible una deriva de identidad. Hailuo es la recomendación estable.' }),
    });
  }

  // Pika maintenance → auto-migration
  if (src === 'ai-pika') {
    out.push({
      level: 'warning',
      message: tx({ de: 'Pika ist im Wartungsmodus — wird automatisch auf Hailuo migriert.', en: 'Pika is in maintenance mode — will be automatically migrated to Hailuo.', es: 'Pika está en modo de mantenimiento — se migrará automáticamente a Hailuo.' }),
    });
  }

  // Lipsync requested on a non-lipsync provider
  if (lipsync && !providerSupportsLipsync(src)) {
    out.push({
      level: 'warning',
      message: tx({ de: `${src} kann keinen Lip-Sync rendern — wird auf Hailuo migriert (Provider-Wechsel kann Kosten beeinflussen).`, en: `${src} cannot render lip-sync — migrating to Hailuo (provider change may affect costs).`, es: `${src} no puede renderizar la sincronización labial — migrando a Hailuo (el cambio de proveedor puede afectar los costos).` }),
    });
  }

  // Cinematic-sync needs an anchor URL
  if ((scene as any).engineOverride === 'cinematic-sync' && !(scene as any).anchorImageUrl && !(scene as any).characterAnchorUrl) {
    out.push({
      level: 'info',
      message:
        tx({ de: 'Kein Charakter-Anker gesetzt — die Pipeline rendert den Anker automatisch in einem Vorlauf-Schritt.', en: 'No character anchor set — the pipeline will automatically render the anchor in a pre-run step.', es: 'No se ha establecido un ancla de personaje — el pipeline renderizará automáticamente el ancla en un paso previo.' }),
    });
  }

  // Voiceover potentially longer than scene
  const voSeconds = (scene as any).voiceoverDurationSec as number | undefined;
  if (lipsync && voSeconds && voSeconds > dur + 0.25) {
    out.push({
      level: 'warning',
      message: tx({ de: `Voiceover (${voSeconds.toFixed(1)}s) ist länger als die Szene (${dur}s) — das Audio wird gekürzt.`, en: `Voiceover (${voSeconds.toFixed(1)}s) is longer than the scene (${dur}s) — audio will be cut.`, es: `La voz en off (${voSeconds.toFixed(1)}s) es más larga que la escena (${dur}s) — el audio se cortará.` }),
    });
  }

  return out;
}

export function aggregateWarnings(scenes: ComposerScene[]): RenderWarning[] {
  const seen = new Set<string>();
  const out: RenderWarning[] = [];
  for (const s of scenes) {
    for (const w of getRenderWarnings(s)) {
      const key = `${w.level}|${w.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
    }
  }
  return out;
}
