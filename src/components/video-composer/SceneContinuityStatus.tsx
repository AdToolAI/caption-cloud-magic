/**
 * v430 Step 4 — continuity status on the scene tile.
 *
 * Shows two DERIVED states and one action:
 *   • "Kontinuität veraltet" — the predecessor's final output changed since
 *     this scene was bound to it (`continuity_stale`, maintained value-based
 *     by the DB trigger).
 *   • "Neu rendern nötig" — this scene's EXISTING video was rendered with a
 *     different continuity input than the one it is configured with now
 *     (derived, never stored).
 *   • "Kontinuität aktualisieren" — re-binds the scene to the predecessor's
 *     CURRENT final output. It updates the dependency only and NEVER triggers
 *     a render. Disabled while the predecessor's output is not final
 *     (lip-sync plate delivered, mux still running).
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { tl } from "@/lib/i18nText";
import { resolveSceneOutput } from "@/lib/composer/output/resolveSceneOutput";
import {
  isSceneOutputFinal,
  needsContinuityRerender,
  sceneWasEverRendered,
} from "@/lib/composer/continuity/continuityState";
import type { ComposerScene } from "@/types/video-composer";

interface Props {
  scene: ComposerScene;
  language: string;
  /** Refresh the parent's scene list after a successful re-bind. */
  onRefresh?: () => void;
}

const PRED_COLUMNS =
  "id, clip_url, processed_video_url, base_video_url, lip_sync_source_clip_url, upload_url, lip_sync_status, lip_sync_with_voiceover, dialog_mode, engine_override";

export function SceneContinuityStatus({ scene, language, onRefresh }: Props) {
  const tx = (m: { de: string; en: string; es: string }) => tl(m, language);
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
        .from("composer_scenes")
        .select(PRED_COLUMNS)
        .eq("id", predecessorId)
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

  const handleUpdate = useCallback(async () => {
    if (!predecessorId || !predFinal || !predUrl) return;
    setBusy(true);
    try {
      // Dependency update only — no render, no state-machine transition.
      const { error } = await supabase
        .from("composer_scenes")
        .update({
          continuity_source_clip_url: predUrl,
          continuity_stale: false,
        })
        .eq("id", scene.id);
      if (error) throw error;
      toast({
        title: tx({
          de: "Kontinuität aktualisiert",
          en: "Continuity updated",
          es: "Continuidad actualizada",
        }),
        description: tx({
          de: "Die Szene ist jetzt an das aktuelle Ergebnis der Vorgängerszene gebunden. Rendere sie neu, damit das Bild übernommen wird.",
          en: "The scene is now bound to the predecessor's current result. Re-render it so the frame is applied.",
          es: "La escena está vinculada al resultado actual de la escena anterior. Vuelve a renderizarla para aplicar el fotograma.",
        }),
      });
      onRefresh?.();
    } catch (e) {
      toast({
        variant: "destructive",
        title: tx({ de: "Fehlgeschlagen", en: "Failed", es: "Error" }),
        description: (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }, [predecessorId, predFinal, predUrl, scene.id, onRefresh, toast, language]);

  if (!configured || (!stale && !dirty)) return null;

  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {stale && (
          <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-500">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {tx({
              de: "Kontinuität veraltet",
              en: "Continuity outdated",
              es: "Continuidad desactualizada",
            })}
          </Badge>
        )}
        {dirty && (
          <Badge variant="outline" className="border-primary/50 text-[10px] text-primary">
            {tx({ de: "Neu rendern nötig", en: "Re-render needed", es: "Requiere volver a renderizar" })}
          </Badge>
        )}
      </div>
      {stale && (
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={busy || !predFinal || !predUrl}
            onClick={handleUpdate}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${busy ? "animate-spin" : ""}`} />
            {tx({
              de: "Kontinuität aktualisieren",
              en: "Update continuity",
              es: "Actualizar continuidad",
            })}
          </Button>
          {!predFinal && (
            <span className="text-[10px] text-muted-foreground">
              {tx({
                de: "Vorgängerszene ist noch in Produktion",
                en: "Previous scene is still in production",
                es: "La escena anterior sigue en producción",
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default SceneContinuityStatus;
