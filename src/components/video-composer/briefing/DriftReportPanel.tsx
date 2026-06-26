/**
 * DriftReportPanel — collapsible card that compares the latest saved
 * ProductionPlan (from `composer_production_plans`) against the current
 * Composer storyboard and surfaces deltas as findings.
 *
 * Read-only by default. Optional Safe-Auto-Fix only writes whitelisted,
 * non-lipsync fields (see driftAutoFix.ts) via the parent-supplied
 * `onUpdateScene` callback. Lip-Sync / Cast / Anchor are NEVER touched.
 */

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronDown, RefreshCw, ShieldCheck, AlertTriangle, Loader2, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  detectPlanDrift,
  severityBadgeClass,
  type DriftReport,
} from '@/lib/video-composer/briefing/driftDetector';
import { buildAutoFixPlan, type AutoFixPlan } from '@/lib/video-composer/briefing/driftAutoFix';
import { ProductionPlan, type TProductionPlan } from '@/lib/video-composer/briefing/productionPlan';
import type { ComposerScene } from '@/types/video-composer';
import { cn } from '@/lib/utils';

interface Props {
  projectId?: string;
  scenes: ComposerScene[];
  onUpdateScene?: (id: string, updates: Partial<ComposerScene>) => void;
}

const SEV_LABEL: Record<DriftReport['severity'], string> = {
  none: 'Plan & Storyboard im Einklang',
  info: 'Kleine Abweichungen',
  warn: 'Abweichungen erkannt',
  error: 'Kritische Abweichungen',
};

export default function DriftReportPanel({ projectId, scenes, onUpdateScene }: Props) {
  const [plan, setPlan] = useState<TProductionPlan | null>(null);
  const [planVersion, setPlanVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const loadPlan = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('composer_production_plans')
        .select('plan, version')
        .eq('project_id', projectId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('[DriftReportPanel] load plan failed', error);
        return;
      }
      if (!data) return;
      const parsed = ProductionPlan.safeParse(data.plan);
      if (parsed.success) {
        setPlan(parsed.data);
        setPlanVersion(data.version ?? null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const report = useMemo<DriftReport | null>(() => {
    if (!plan) return null;
    return detectPlanDrift(plan, scenes);
  }, [plan, scenes]);

  const autoFix = useMemo<AutoFixPlan | null>(() => {
    if (!plan || !report) return null;
    return buildAutoFixPlan(plan, scenes, report.findings);
  }, [plan, report, scenes]);

  const persist = async (extra?: { autoFixApplied?: boolean; fixedFields?: string[] }) => {
    if (!projectId || !report) return;
    try {
      await (supabase as any)
        .from('composer_plan_drift_reports')
        .insert({
          project_id: projectId,
          plan_version: planVersion,
          severity: report.severity,
          findings: report.findings,
          snapshot: {
            sceneCount: scenes.length,
            generatedAt: report.generatedAt,
            autoFixApplied: extra?.autoFixApplied ?? false,
            fixedFields: extra?.fixedFields ?? [],
          },
        });
    } catch (e) {
      console.warn('[DriftReportPanel] persist failed', e);
    }
  };

  const applyAutoFix = async () => {
    if (!autoFix || !onUpdateScene || autoFix.patches.length === 0) return;
    setApplying(true);
    try {
      const allFixed: string[] = [];
      for (const p of autoFix.patches) {
        onUpdateScene(p.sceneId, p.patch);
        allFixed.push(...p.fieldsFixed.map((f) => `S${p.sceneIndex}.${f}`));
      }
      await persist({ autoFixApplied: true, fixedFields: allFixed });
      toast.success('Storyboard angeglichen', {
        description: `${autoFix.fixableCount} Feld(er) in ${autoFix.patches.length} Szene(n) aktualisiert.`,
      });
      setPreviewOpen(false);
      // Re-load plan after a beat so the next drift-check sees fresh state.
      setTimeout(() => void loadPlan(), 300);
    } catch (e) {
      console.error('[DriftReportPanel] auto-fix failed', e);
      toast.error('Auto-Fix fehlgeschlagen', { description: (e as Error)?.message ?? 'unknown' });
    } finally {
      setApplying(false);
    }
  };

  if (!projectId) return null;
  if (!plan && !loading) return null;

  const sev = report?.severity ?? 'none';
  const count = report?.findings.length ?? 0;
  const canAutoFix = !!onUpdateScene && (autoFix?.fixableCount ?? 0) > 0;

  return (
    <>
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex items-center gap-2 p-3">
            {sev === 'none' ? (
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className={cn('h-4 w-4 shrink-0', sev === 'error' ? 'text-red-400' : sev === 'warn' ? 'text-amber-400' : 'text-sky-400')} />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">Plan ↔ Storyboard Drift-Check</span>
                <Badge variant="outline" className={cn('text-[10px]', severityBadgeClass(sev))}>
                  {SEV_LABEL[sev]}
                </Badge>
                {count > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {count} Befund{count === 1 ? '' : 'e'}
                  </span>
                )}
                {planVersion != null && (
                  <span className="text-[10px] text-muted-foreground/70">Plan v{planVersion}</span>
                )}
              </div>
            </div>
            {canAutoFix && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 gap-1 text-[11px] border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                onClick={(e) => { e.stopPropagation(); setPreviewOpen(true); }}
                disabled={applying || loading}
              >
                <Wand2 className="h-3 w-3" />
                Safe Auto-Fix ({autoFix!.fixableCount})
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 gap-1 text-[11px]"
              onClick={(e) => { e.stopPropagation(); void loadPlan().then(() => persist()); }}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Erneut prüfen
            </Button>
            <CollapsibleTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0">
                <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            <div className="px-3 pb-3 space-y-1.5">
              {!report || report.findings.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Alle vom Plan vorgesehenen Felder wurden 1:1 ins Storyboard übernommen.
                </p>
              ) : (
                report.findings.map((f, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded border px-2 py-1.5 text-[11px]',
                      severityBadgeClass(f.severity as DriftReport['severity']),
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-[10px] opacity-70 shrink-0 mt-0.5">
                        {f.sceneIndex != null ? `S${String(f.sceneIndex).padStart(2, '0')}` : 'PLAN'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{f.message}</div>
                        {(f.expected || f.actual) && (
                          <div className="mt-0.5 text-[10px] opacity-80 truncate">
                            {f.expected && <>Plan: <span className="font-mono">{f.expected}</span></>}
                            {f.expected && f.actual && <span className="mx-1">·</span>}
                            {f.actual && <>Szene: <span className="font-mono">{f.actual}</span></>}
                          </div>
                        )}
                      </div>
                      <span className="font-mono text-[10px] opacity-60 shrink-0">{f.field}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Dialog open={previewOpen} onOpenChange={(o) => !applying && setPreviewOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-emerald-400" />
              Safe Auto-Fix Vorschau
            </DialogTitle>
            <DialogDescription>
              Nur sichere Felder werden überschrieben. Cast, Lip-Sync, Voiceover & Anchor bleiben unangetastet.
            </DialogDescription>
          </DialogHeader>

          {autoFix && (
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {autoFix.patches.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Keine sicheren Auto-Fixes verfügbar.</p>
              ) : (
                autoFix.patches.map((p) => (
                  <div key={p.sceneId} className="rounded border border-border/50 bg-background/40 p-2.5">
                    <div className="text-xs font-mono text-muted-foreground mb-1.5">
                      Szene {String(p.sceneIndex).padStart(2, '0')}
                    </div>
                    <div className="space-y-1">
                      {p.diff.map((d, i) => (
                        <div key={i} className="text-[11px] grid grid-cols-[80px_1fr] gap-2">
                          <span className="text-muted-foreground">{d.field}</span>
                          <span>
                            <span className="text-red-300/80 line-through mr-1.5">{d.before}</span>
                            <span className="text-emerald-300">→ {d.after}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}

              {autoFix.skipped.length > 0 && (
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">
                    {autoFix.skipped.length} Befund(e) übersprungen (manuell prüfen)
                  </summary>
                  <ul className="mt-2 space-y-1 pl-3 list-disc list-inside">
                    {autoFix.skipped.slice(0, 8).map((s, i) => (
                      <li key={i}>
                        {s.sceneIndex != null ? `S${s.sceneIndex} · ` : ''}{s.field} — {s.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPreviewOpen(false)} disabled={applying}>
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={() => void applyAutoFix()}
              disabled={applying || !autoFix || autoFix.patches.length === 0}
              className="gap-1.5"
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Auf Storyboard anwenden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
