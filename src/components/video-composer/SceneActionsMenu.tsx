/**
 * v430 Schritt 6.1 — „Szenenaktionen".
 *
 * EINZIGER Einstiegspunkt für die drei Szenen-Operationen. Das Menü
 * entscheidet nichts selbst: Verfügbarkeit kommt aus `sceneActionAvailability()`
 * (pure Projektion) über die kanonischen Selektoren `sceneState()`,
 * `sceneSubstate()`, den Lip-Sync-Intent-Vertrag und die Continuity-Helper.
 * Handler, Payloads und Bestätigungen werden unverändert durchgereicht.
 */

import { MoreHorizontal, RefreshCw, Film, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pickText } from '@/lib/i18nText';
import { sceneState, sceneSubstate } from '@/lib/composer/sceneState';
import { isLipSyncIntentional } from '@/lib/composer/continuity/continuityState';
import { sceneActionAvailability } from '@/lib/composer/sceneActionAvailability';
import { useSceneContinuityAction } from '@/hooks/useSceneContinuityAction';
import type { ComposerScene } from '@/types/video-composer';

interface Props {
  scene: ComposerScene;
  language: string;
  /** Lip-Sync neu erstellen — bestehende Plate bleibt erhalten. */
  onRestartLipSync?: () => void | Promise<void>;
  /** Szene komplett neu erstellen — voller Run-Reset inkl. Kosten-Confirm. */
  onFullRegenerate?: () => void | Promise<void>;
  /** Refresh nach erfolgreichem Continuity-Rebind. */
  onRefresh?: () => void;
  className?: string;
}

export function SceneActionsMenu({
  scene,
  language,
  onRestartLipSync,
  onFullRegenerate,
  onRefresh,
  className,
}: Props) {
  const tx = (m: { de: string; en: string; es: string }) => pickText(language, m);
  const continuity = useSceneContinuityAction(scene, language, onRefresh);

  const availability = sceneActionAvailability({
    state: sceneState(scene),
    substate: sceneSubstate(scene),
    lipSyncIntentional: isLipSyncIntentional(scene as any),
    engineOverride: scene.engineOverride ?? null,
    continuityConfigured: continuity.configured,
    continuityStale: continuity.stale,
    predecessorFinal: continuity.predecessorFinal,
    predecessorHasOutput: continuity.predecessorHasOutput,
    busy: continuity.busy,
  });

  if (!availability.anyVisible) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={`h-7 text-[11px] ${className ?? ''}`}>
          <MoreHorizontal className="mr-1 h-3 w-3" />
          {tx({ de: 'Szenenaktionen', en: 'Scene actions', es: 'Acciones de escena' })}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[11px]">
          {tx({ de: 'Szenenaktionen', en: 'Scene actions', es: 'Acciones de escena' })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {availability.lipSyncRestart.visible && (
          <DropdownMenuItem
            disabled={availability.lipSyncRestart.disabled || !onRestartLipSync}
            onSelect={(e) => {
              e.preventDefault();
              void onRestartLipSync?.();
            }}
            className="text-[12px]"
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            <span className="flex flex-col">
              <span>
                {tx({
                  de: 'Lip-Sync neu erstellen',
                  en: 'Recreate lip sync',
                  es: 'Rehacer la sincronización labial',
                })}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {tx({
                  de: 'Das vorhandene Video bleibt erhalten.',
                  en: 'The existing video is kept.',
                  es: 'El video existente se conserva.',
                })}
              </span>
            </span>
          </DropdownMenuItem>
        )}

        {availability.fullRegenerate.visible && (
          <DropdownMenuItem
            disabled={availability.fullRegenerate.disabled || !onFullRegenerate}
            onSelect={(e) => {
              e.preventDefault();
              void onFullRegenerate?.();
            }}
            className="text-[12px]"
          >
            <Film className="mr-2 h-3.5 w-3.5" />
            <span className="flex flex-col">
              <span>
                {tx({
                  de: 'Szene komplett neu erstellen',
                  en: 'Recreate the whole scene',
                  es: 'Rehacer la escena completa',
                })}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {tx({
                  de: 'Video und Lip-Sync werden neu erzeugt. Credits werden erneut verbraucht.',
                  en: 'Video and lip sync are regenerated. Credits are consumed again.',
                  es: 'El video y la sincronización labial se regeneran. Se consumen créditos de nuevo.',
                })}
              </span>
            </span>
          </DropdownMenuItem>
        )}

        {availability.continuityUpdate.visible && (
          <DropdownMenuItem
            disabled={availability.continuityUpdate.disabled}
            onSelect={(e) => {
              e.preventDefault();
              void continuity.update();
            }}
            className="text-[12px]"
          >
            <Link2 className="mr-2 h-3.5 w-3.5" />
            <span className="flex flex-col">
              <span>
                {tx({
                  de: 'Kontinuität aktualisieren',
                  en: 'Update continuity',
                  es: 'Actualizar continuidad',
                })}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {continuity.predecessorFinal
                  ? tx({
                      de: 'Bindet die Szene an das aktuelle Ergebnis der Vorgängerszene. Kein Render.',
                      en: "Binds the scene to the previous scene's current result. No render.",
                      es: 'Vincula la escena al resultado actual de la escena anterior. Sin renderizado.',
                    })
                  : tx({
                      de: 'Vorgängerszene ist noch in Produktion.',
                      en: 'Previous scene is still in production.',
                      es: 'La escena anterior sigue en producción.',
                    })}
              </span>
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default SceneActionsMenu;
