/**
 * v430 Step 4/6.1 — continuity STATUS on the scene tile (display only).
 *
 * Shows two DERIVED states:
 *   • "Kontinuität veraltet" — the predecessor's final output changed since
 *     this scene was bound to it (`continuity_stale`, maintained value-based
 *     by the DB trigger).
 *   • "Neu rendern nötig" — this scene's EXISTING video was rendered with a
 *     different continuity input than the one it is configured with now
 *     (derived, never stored).
 *
 * v430 Schritt 6.1: die Aktion "Kontinuität aktualisieren" lebt ausschliesslich
 * im `SceneActionsMenu`. Hier bleibt nur die Anzeige — kein zweiter Button.
 */

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { pickText } from "@/lib/i18nText";
import { useSceneContinuityAction } from "@/hooks/useSceneContinuityAction";
import type { ComposerScene } from "@/types/video-composer";

interface Props {
  scene: ComposerScene;
  language: string;
  /** Refresh the parent's scene list after a successful re-bind. */
  onRefresh?: () => void;
}

export function SceneContinuityStatus({ scene, language, onRefresh }: Props) {
  const tx = (m: { de: string; en: string; es: string }) => pickText(language, m);
  const continuity = useSceneContinuityAction(scene, language, onRefresh);

  if (!continuity.configured || (!continuity.stale && !continuity.dirty)) return null;

  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {continuity.stale && (
          <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-500">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {tx({
              de: "Kontinuität veraltet",
              en: "Continuity outdated",
              es: "Continuidad desactualizada",
            })}
          </Badge>
        )}
        {continuity.dirty && (
          <Badge variant="outline" className="border-primary/50 text-[10px] text-primary">
            {tx({ de: "Neu rendern nötig", en: "Re-render needed", es: "Requiere volver a renderizar" })}
          </Badge>
        )}
      </div>
      {continuity.stale && (
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          {continuity.predecessorFinal
            ? tx({
                de: "Über „Szenenaktionen → Kontinuität aktualisieren“ neu binden.",
                en: "Re-bind via \u201cScene actions \u2192 Update continuity\u201d.",
                es: "Vuelve a vincular en \u201cAcciones de escena \u2192 Actualizar continuidad\u201d.",
              })
            : tx({
                de: "Vorgängerszene ist noch in Produktion",
                en: "Previous scene is still in production",
                es: "La escena anterior sigue en producción",
              })}
        </div>
      )}
    </div>
  );
}

export default SceneContinuityStatus;
