/**
 * v430 Schritt 6.1 — „Kontinuität aktualisieren" als einziger Handler.
 *
 * Aus `SceneContinuityStatus` extrahiert, damit Badge (Anzeige) und Aktion
 * (Menü) dieselbe Wahrheit benutzen. Semantik unverändert:
 *   • bindet die Szene an den AKTUELLEN finalen Output des Vorgängers,
 *   • schreibt NUR die Abhängigkeit, löst NIE einen Render aus,
 *   • deaktiviert, solange der Vorgänger-Output nicht final ist.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { pickText } from '@/lib/i18nText';
import { resolveSceneOutput } from '@/lib/composer/output/resolveSceneOutput';
import {
  isSceneOutputFinal,
  needsContinuityRerender,
  sceneWasEverRendered,
} from '@/lib/composer/continuity/continuityState';
import type { ComposerScene } from '@/types/video-composer';

const PRED_COLUMNS =
  'id, clip_url, processed_video_url, base_video_url, lip_sync_source_clip_url, upload_url, lip_sync_status, lip_sync_with_voiceover, dialog_mode, engine_override';

export interface SceneContinuityAction {
  /** Szene ist überhaupt an einen Vorgänger gebunden. */
  configured: boolean;
  /** `continuity_stale` (DB-Trigger, wertbasiert). */
  stale: boolean;
  /** Bestehendes Video wurde mit einem anderen Continuity-Input gerendert. */
  dirty: boolean;
  /** Vorgänger-Output ist semantisch final. */
  predecessorFinal: boolean;
  /** Vorgänger hat einen effektiven Output. */
  predecessorHasOutput: boolean;
  busy: boolean;
  update: () => Promise<void>;
}

export function useSceneContinuityAction(
  scene: ComposerScene,
  language: string,
  onRefresh?: () => void,
): SceneContinuityAction {
  const tx = (m: { de: string; en: string; es: string }) => pickText(language, m);
  const { toast } = useToast();

  const predecessorId = (scene as any).continuationSourceSceneId as string | null | undefined;
  const configured = scene.continuitySourceClipUrl ?? null;

  const [pred, setPred] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!predecessorId || !configured) {
      setPred(null);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from('composer_scenes')
        .select(PRED_COLUMNS)
        .eq('id', predecessorId)
        .maybeSingle();
      if (!cancelled) setPred((data as any) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [predecessorId, configured, scene.continuityStale]);

  const everRendered = sceneWasEverRendered({
    firstRenderedAt: scene.firstRenderedAt ?? null,
    legacyEffectiveUrl: resolveSceneOutput(scene as any).effectiveUrl,
  });
  const dirty = needsContinuityRerender({
    everRendered,
    configuredSource: configured,
    renderedSource: scene.continuityRenderedSourceClipUrl ?? null,
  });
  const stale = scene.continuityStale === true;

  const predFinal = pred ? isSceneOutputFinal(pred as any) : false;
  const predUrl = pred ? resolveSceneOutput(pred as any).effectiveUrl : null;

  const update = useCallback(async () => {
    if (!predecessorId || !predFinal || !predUrl) return;
    setBusy(true);
    try {
      // Dependency update only — no render, no state-machine transition.
      const { error } = await supabase
        .from('composer_scenes')
        .update({
          continuity_source_clip_url: predUrl,
          continuity_stale: false,
        })
        .eq('id', scene.id);
      if (error) throw error;
      toast({
        title: tx({
          de: 'Kontinuität aktualisiert',
          en: 'Continuity updated',
          es: 'Continuidad actualizada',
        }),
        description: tx({
          de: 'Die Szene ist jetzt an das aktuelle Ergebnis der Vorgängerszene gebunden. Rendere sie neu, damit das Bild übernommen wird.',
          en: "The scene is now bound to the predecessor's current result. Re-render it so the frame is applied.",
          es: 'La escena está vinculada al resultado actual de la escena anterior. Vuelve a renderizarla para aplicar el fotograma.',
        }),
      });
      onRefresh?.();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: tx({ de: 'Fehlgeschlagen', en: 'Failed', es: 'Error' }),
        description: (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }, [predecessorId, predFinal, predUrl, scene.id, onRefresh, toast, language]);

  return {
    configured: Boolean(configured),
    stale,
    dirty,
    predecessorFinal: predFinal,
    predecessorHasOutput: typeof predUrl === 'string' && predUrl.length > 0,
    busy,
    update,
  };
}
