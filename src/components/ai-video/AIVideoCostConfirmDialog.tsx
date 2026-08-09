import { tx } from "@/lib/i18nText";
/**
 * AIVideoCostConfirmDialog — Kosten-Übersicht vor der Generierung.
 *
 * Wird sowohl vom AI Video Studio (Toolkit-Videomodelle) als auch vom
 * Picture Studio (Premium-Tiers) genutzt. Design & Ton bewusst analog zum
 * SceneRenderConfirmDialog des Motion Studios, damit die Nutzer studioübergreifend
 * dieselbe Erwartungshaltung haben.
 */
import { Wallet, Sparkles, AlertTriangle, Clock, Coins } from 'lucide-react';
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

export interface CostLine {
  label: string;
  detail?: string;
  value: string;
}

export interface AIVideoCostConfirmPayload {
  title: string;
  description?: string;
  modelName: string;
  modelBadge?: string;
  lines: CostLine[];
  totalLabel: string;
  totalValue: string;
  currencySymbol: string;
  totalCost: number;
  walletBalance?: number | null;
  isUnlimited?: boolean;
  etaSeconds?: number;
}

interface Props {
  open: boolean;
  payload: AIVideoCostConfirmPayload | null;
  suppressed: boolean;
  onSuppressedChange: (next: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onTopUp?: () => void;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  const m = Math.round(seconds / 60);
  return `~${m} Min`;
}

export default function AIVideoCostConfirmDialog({
  open,
  payload,
  suppressed,
  onSuppressedChange,
  onConfirm,
  onCancel,
  onTopUp,
}: Props) {
  if (!payload) return null;
  const {
    title, description, modelName, modelBadge, lines, totalLabel, totalValue,
    currencySymbol, totalCost, walletBalance, isUnlimited, etaSeconds,
  } = payload;

  const walletAvailable = walletBalance ?? null;
  const insufficient = !isUnlimited && walletAvailable != null && walletAvailable < totalCost;
  const remaining =
    !isUnlimited && walletAvailable != null ? Math.max(0, walletAvailable - totalCost) : null;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description ??
              tx({ de: 'Übersicht deiner Kosten — sobald du bestätigst, startet die Generierung und dein Guthaben wird belastet.', en: 'Overview of your costs — once you confirm, generation will start and your credit will be charged.', es: 'Resumen de tus costos — una vez que confirmes, la generación comenzará y se cargará a tu crédito.' })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 my-2 max-h-[55vh] overflow-y-auto pr-1">
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">{tx({ de: "Modell", en: "Model", es: "Modelo" })}</span>
              <Badge variant="outline" className="text-[10px]">
                {modelBadge ?? modelName}
              </Badge>
            </div>
            <div className="text-sm font-medium">{modelName}</div>
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
            <ul className="space-y-1.5">
              {lines.map((line, i) => (
                <li key={i} className="text-[11.5px]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-foreground/90 leading-tight">{line.label}</span>
                    <span className="tabular-nums shrink-0 text-foreground/90 font-medium">
                      {line.value}
                    </span>
                  </div>
                  {line.detail && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      {line.detail}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-primary" />
                {totalLabel}
              </span>
              <span className="font-semibold tabular-nums text-base">{totalValue}</span>
            </div>
            {etaSeconds && etaSeconds > 0 && (
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {tx({ de: "Geschätzte Dauer", en: "Estimated duration", es: "Duración estimada" })}
                </span>
                <span className="tabular-nums">{formatEta(etaSeconds)}</span>
              </div>
            )}
          </div>

          {!isUnlimited && walletAvailable != null && (
            <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[11px] space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5" />
                  {tx({ de: "Aktuelles AI-Guthaben", en: "Current AI balance", es: "Saldo de IA actual" })}
                </span>
                <span className="tabular-nums">
                  {currencySymbol}
                  {walletAvailable.toFixed(2)}
                </span>
              </div>
              {remaining !== null && !insufficient && (
                <div className="flex items-center justify-between text-muted-foreground/80">
                  <span>{tx({ de: "Restsaldo nach Generierung", en: "Remaining balance after generation", es: "Saldo restante después de la generación" })}</span>
                  <span className="tabular-nums">
                    {currencySymbol}
                    {remaining.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {isUnlimited && (
            <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-[11px] text-emerald-300 flex items-start gap-1.5">
              <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {tx({ de: "Unlimited-Plan aktiv — keine Guthaben-Belastung.", en: "Unlimited plan active — no credit charged.", es: "Plan ilimitado activo — sin cargo de saldo." })}
            </div>
          )}

          {insufficient && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/40 px-3 py-2 text-[11.5px] text-amber-200 space-y-2">
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="leading-tight">
                  {tx({ de: "Dein Guthaben reicht nicht aus. Bitte lade AI-Credits nach, um fortzufahren.", en: "Your balance is not sufficient. Please top up AI credits to continue.", es: "Tu saldo no es suficiente. Recarga créditos de IA para continuar." })}
                </span>
              </div>
              {onTopUp && (
                <button
                  onClick={onTopUp}
                  className="w-full rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-2.5 py-1.5 text-[11px] font-medium text-amber-100 transition"
                >
                  {tx({ de: "AI-Credits nachkaufen", en: "Buy more AI credits", es: "Comprar más créditos de IA" })}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="ai-video-suppress-confirm"
              checked={suppressed}
              onCheckedChange={(v) => onSuppressedChange(v === true)}
            />
            <Label
              htmlFor="ai-video-suppress-confirm"
              className="text-[11px] cursor-pointer text-muted-foreground"
            >
              {tx({ de: "24 Stunden lang nicht mehr fragen", en: "Don't ask again for 24 hours", es: "No preguntar de nuevo durante 24 horas" })}
            </Label>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={insufficient}
            className="bg-gradient-to-r from-primary to-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {tx({ de: `Für ${totalValue} generieren`, en: `Generate for ${totalValue}`, es: `Generar por ${totalValue}` })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
