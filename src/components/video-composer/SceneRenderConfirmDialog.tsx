/**
 * SceneRenderConfirmDialog — Schritt 1 (Render-All entfernt + Confirm-Gate).
 *
 * Shows a transparent cost breakdown before any expensive render API call
 * is fired. Used by every render trigger in Motion Studio:
 *   - StoryboardTab → useSceneGenerate (single scene)
 *   - SceneDialogStudio.handleGenerate (multi-turn dialog)
 *   - SceneCard "Clip + Lip-Sync neu rendern" (re-roll)
 *
 * Controlled by SceneRenderConfirmProvider via a Promise-based API.
 */
import { Loader2, Wallet, Sparkles, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { formatCredits, formatEur, type AggregatedCost } from '@/lib/composer/estimateSceneRenderCost';

export interface SceneRenderConfirmPayload {
  title?: string;
  description?: string;
  cost: AggregatedCost;
}

interface Props {
  open: boolean;
  payload: SceneRenderConfirmPayload | null;
  suppressed: boolean;
  onSuppressedChange: (next: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SceneRenderConfirmDialog({
  open,
  payload,
  suppressed,
  onSuppressedChange,
  onConfirm,
  onCancel,
}: Props) {
  if (!payload) return null;
  const { cost, title, description } = payload;
  const multi = cost.scenes.length > 1;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {title || (multi ? 'Mehrere Szenen rendern?' : 'Szene rendern?')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description ||
              'Genaue Aufschlüsselung pro Komponente — sobald du bestätigst, startet die Render-Pipeline und Credits werden verbraucht.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 my-2 max-h-[55vh] overflow-y-auto pr-1">
          {cost.scenes.map((scn) => (
            <div
              key={scn.sceneId}
              className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Szene {scn.sceneIndex}
                </span>
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {formatCredits(scn.totalCredits)} · {formatEur(scn.totalEur)}
                </Badge>
              </div>
              <ul className="space-y-1.5">
                {scn.lines.map((line, i) => (
                  <li key={i} className="text-[11px]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-foreground/90 leading-tight">{line.label}</span>
                      <span className="tabular-nums shrink-0 text-foreground/90 font-medium">
                        {formatCredits(line.credits)} · {formatEur(line.eur)}
                      </span>
                    </div>
                    {line.detail && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                        {line.detail}
                      </div>
                    )}
                  </li>
                ))}
                {scn.lines.length === 0 && (
                  <li className="text-[11px] text-muted-foreground italic">
                    Keine kostenpflichtigen Komponenten (Stock/Upload).
                  </li>
                )}
              </ul>
            </div>
          ))}

          <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 flex items-center justify-between">
            <span className="text-sm flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-primary" />
              Gesamt
            </span>
            <span className="font-semibold tabular-nums">
              {formatCredits(cost.totalCredits)} · {formatEur(cost.totalEur)}
            </span>
          </div>

          {cost.totalCredits === 0 && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Keine kostenpflichtigen API-Calls — du kannst sicher fortfahren.
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="suppress-confirm"
              checked={suppressed}
              onCheckedChange={(v) => onSuppressedChange(v === true)}
            />
            <Label
              htmlFor="suppress-confirm"
              className="text-[11px] text-muted-foreground cursor-pointer"
            >
              30 Minuten lang nicht mehr fragen
            </Label>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-gradient-to-r from-primary to-accent"
          >
            Rendern für {formatCredits(cost.totalCredits)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ConfirmDialogSpinner() {
  return (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
    </div>
  );
}
