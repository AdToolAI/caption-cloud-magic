import { tx } from "@/lib/i18nText";
import { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { PreflightFinding } from '@/lib/directors-cut/ciPreflight';
import { trackUDC } from '@/lib/analytics';

interface CIPreflightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findings: PreflightFinding[];
  onIgnoreAndRender: () => void;
  onFixIssues: () => void;
}

const SEVERITY_META = {
  fail: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/30', label: 'Blocker' },
  warn: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/30', label: tx({ de: 'Warnung', en: 'Warning', es: 'Advertencia' }) },
  info: { icon: Info, color: 'text-cyan-500', bg: 'bg-cyan-500/10 border-cyan-500/30', label: tx({ de: 'Hinweis', en: 'Notice', es: 'Aviso' }) },
} as const;

export function CIPreflightDialog({
  open,
  onOpenChange,
  findings,
  onIgnoreAndRender,
  onFixIssues,
}: CIPreflightDialogProps) {
  const hasBlockers = findings.some((f) => f.severity === 'fail');
  const allClean = findings.length === 0;

  useEffect(() => {
    if (!open) return;
    trackUDC('udc_preflight_opened', {
      total: findings.length,
      fail: findings.filter((f) => f.severity === 'fail').length,
      warn: findings.filter((f) => f.severity === 'warn').length,
      info: findings.filter((f) => f.severity === 'info').length,
    });
    if (hasBlockers) {
      trackUDC('udc_preflight_blocked_export', {
        fail_ids: findings.filter((f) => f.severity === 'fail').map((f) => f.id),
      });
    }
  }, [open, findings, hasBlockers]);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            CI-Preflight
          </DialogTitle>
          <DialogDescription>
            {allClean
              ? tx({ de: tx({ de: "Alle Consistency-Checks bestanden — bereit für den Render.", en: "All consistency checks passed — ready to render.", es: "Todas las comprobaciones de consistencia superadas — listo para renderizar." }), en: 'All consistency checks passed — ready for render.', es: 'Todas las comprobaciones de consistencia pasaron — listo para renderizar.' })
              : hasBlockers
              ? tx({ de: tx({ de: "Blocker gefunden — bitte behebe die kritischen Punkte vor dem Render.", en: "Blockers found — please fix the critical items before rendering.", es: "Se encontraron bloqueos — corrige los puntos críticos antes de renderizar." }), en: 'Blockers found — please fix the critical points before rendering.', es: 'Se encontraron bloqueadores: solucione los puntos críticos antes de renderizar.' })
              : tx({ de: 'Nicht-blockierende Hinweise — du kannst trotzdem rendern.', en: 'Non-blocking hints — you can still render.', es: 'Sugerencias sin bloqueo: aún puedes renderizar.' })}
          </DialogDescription>
        </DialogHeader>

        {allClean ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm text-muted-foreground">{tx({ de: "Keine Auffälligkeiten. Alles sauber verdrahtet.", en: "No issues found. Everything is wired cleanly.", es: "Sin incidencias. Todo está bien conectado." })}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh] pr-2">
            <ul className="space-y-2">
              {findings.map((f) => {
                const meta = SEVERITY_META[f.severity];
                const Icon = meta.icon;
                return (
                  <li key={f.id} className={`rounded-md border p-3 ${meta.bg}`}>
                    <div className="flex items-start gap-2">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{f.title}</span>
                          <Badge variant="outline" className={`text-[9px] h-4 px-1 ${meta.color}`}>
                            {meta.label}
                          </Badge>
                        </div>
                        {f.detail && <p className="text-xs text-muted-foreground mt-1">{f.detail}</p>}
                        {f.hint && <p className="text-xs text-muted-foreground/80 mt-1 italic">→ {f.hint}</p>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {allClean ? (
            <Button onClick={onIgnoreAndRender} className="w-full">
              {tx({ de: "Render starten", en: "Start Render", es: "Iniciar Renderizado" })}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onFixIssues}>
                {tx({ de: 'Zuerst beheben', en: 'Fix first', es: 'Corregir primero' })}
              </Button>
              <Button
                onClick={() => {
                  if (!hasBlockers && findings.length > 0) {
                    trackUDC('udc_preflight_bypassed', {
                      warn: findings.filter((f) => f.severity === 'warn').length,
                      info: findings.filter((f) => f.severity === 'info').length,
                    });
                  }
                  onIgnoreAndRender();
                }}
                disabled={hasBlockers}
                variant={hasBlockers ? 'secondary' : 'default'}
              >
                {hasBlockers ? 'Blocker beheben' : 'Trotzdem rendern'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
