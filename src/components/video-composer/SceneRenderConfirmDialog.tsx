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
import { Loader2, Wallet, Sparkles, AlertTriangle, Clock, Info, ShieldAlert } from 'lucide-react';
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
import { formatEtaRange } from '@/hooks/useProviderEta';
import RefundGuaranteeBadge from './RefundGuaranteeBadge';
import { humanProviderName } from '@/config/lipsyncProviderSafety';

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
  riskAcknowledged: boolean;
  onRiskAcknowledgedChange: (next: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SceneRenderConfirmDialog({
  open,
  payload,
  suppressed,
  onSuppressedChange,
  riskAcknowledged,
  onRiskAcknowledgedChange,
  onConfirm,
  onCancel,
}: Props) {
  if (!payload) return null;
  const { cost, title, description } = payload;
  const multi = cost.scenes.length > 1;
  const riskyScenes = cost.riskyLipsyncScenes ?? [];
  const hasRisk = riskyScenes.length > 0;
  const anyMultiSpeaker = riskyScenes.some((r) => r.info.multiSpeaker);
  // Provider deduplizieren für die Kopie.
  const riskyProviders = Array.from(
    new Set(riskyScenes.map((r) => humanProviderName(r.info.provider))),
  );
  const providerLabel =
    riskyProviders.length === 1
      ? riskyProviders[0]
      : riskyProviders.slice(0, -1).join(', ') + ' & ' + riskyProviders.slice(-1);
  const confirmDisabled = hasRisk && !riskAcknowledged;

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
              {scn.etaSeconds > 0 && (
                <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Renderzeit
                  </span>
                  <span className="tabular-nums">{formatEtaRange(scn.etaSeconds)}</span>
                </div>
              )}
            </div>
          ))}

          <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-primary" />
                Gesamt
              </span>
              <span className="font-semibold tabular-nums">
                {formatCredits(cost.totalCredits)} · {formatEur(cost.totalEur)}
              </span>
            </div>
            {cost.etaSeconds > 0 && (
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Geschätzte Renderzeit
                </span>
                <span className="tabular-nums">{formatEtaRange(cost.etaSeconds)}</span>
              </div>
            )}
          </div>

          {cost.warnings.length > 0 && (
            <div className="space-y-1.5">
              {cost.warnings.map((w, i) => (
                <div
                  key={i}
                  className={`rounded-md border px-3 py-2 text-[11px] flex items-start gap-1.5 ${
                    w.level === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                  }`}
                >
                  {w.level === 'warning' ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-tight">{w.message}</span>
                </div>
              ))}
            </div>
          )}

          {cost.totalCredits > 0 && !hasRisk && <RefundGuaranteeBadge />}

          {cost.totalCredits === 0 && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Keine kostenpflichtigen API-Calls — du kannst sicher fortfahren.
            </div>
          )}

          {hasRisk && (
            <div className="rounded-lg border-2 border-red-500/50 bg-red-500/10 px-3.5 py-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" />
                <span className="text-sm font-semibold text-red-200">
                  Hinweis zu Lip-Sync mit {providerLabel}
                </span>
              </div>
              <p className="text-[11.5px] leading-relaxed text-red-100/90">
                <strong>{providerLabel}</strong> liefert bei Lip-Sync-Szenen
                {anyMultiSpeaker ? ' mit mehreren Sprechern' : ''} keine
                zuverlässigen Ergebnisse. Es kann zu Ghost-Mouthing (Nicht-
                Sprecher bewegen den Mund), verzerrten Gesichtern und
                falschen Mundbewegungen kommen.
              </p>
              <p className="text-[11.5px] leading-relaxed text-red-100/90">
                Für stabile Lip-Sync-Renderings empfehlen wir{' '}
                <strong>Hailuo</strong> oder <strong>HappyHorse</strong>.
              </p>
              <div className="text-[11px] leading-relaxed text-red-100/80 space-y-1 pt-1 border-t border-red-500/30">
                <div className="font-medium text-red-200">
                  Wenn du trotzdem fortfährst:
                </div>
                <ul className="space-y-0.5 pl-3.5 list-disc marker:text-red-400">
                  <li>
                    Die Plattform übernimmt keine Haftung für Lip-Sync-
                    bezogene Bildfehler.
                  </li>
                  <li>
                    Eine Rückerstattung der Credits für Lip-Sync-Artefakte
                    ist in diesem Fall ausgeschlossen.
                  </li>
                  <li>
                    Andere Fehlerarten (Timeouts, Systemausfälle) bleiben
                    weiter refundfähig.
                  </li>
                </ul>
              </div>
              <label
                htmlFor="risk-ack"
                className="flex items-start gap-2 pt-1.5 cursor-pointer group"
              >
                <Checkbox
                  id="risk-ack"
                  checked={riskAcknowledged}
                  onCheckedChange={(v) => onRiskAcknowledgedChange(v === true)}
                  className="mt-0.5 border-red-400/60 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                />
                <span className="text-[11.5px] leading-tight text-red-100 group-hover:text-red-50 select-none">
                  Ich habe die Risiken verstanden und möchte trotzdem
                  fortfahren.
                </span>
              </label>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="suppress-confirm"
              checked={suppressed}
              onCheckedChange={(v) => onSuppressedChange(v === true)}
              disabled={hasRisk}
            />
            <Label
              htmlFor="suppress-confirm"
              className={`text-[11px] cursor-pointer ${hasRisk ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}
            >
              30 Minuten lang nicht mehr fragen
              {hasRisk && ' (nicht verfügbar bei Provider-Risiko)'}
            </Label>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={
              hasRisk
                ? 'bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed'
                : 'bg-gradient-to-r from-primary to-accent'
            }
          >
            {hasRisk
              ? `Trotzdem rendern für ${formatCredits(cost.totalCredits)}`
              : `Rendern für ${formatCredits(cost.totalCredits)}`}
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
