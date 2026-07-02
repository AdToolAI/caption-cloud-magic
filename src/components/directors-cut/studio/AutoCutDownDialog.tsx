import { useEffect, useMemo, useState } from 'react';
import { trackUDC } from '@/lib/analytics';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Scissors, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeCutDown, type CutDownPreset } from '@/lib/directors-cut/autoCutDown';
import type { SceneAnalysis } from '@/types/directors-cut';

interface AutoCutDownDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scenes: SceneAnalysis[];
  onApply: (nextScenes: SceneAnalysis[], target: number) => void;
  /** When true, master already backed up — dialog shows a reassuring note. */
  hasMasterSnapshot?: boolean;
}

const PRESETS: { value: CutDownPreset; label: string; sub: string }[] = [
  { value: 15, label: '15s Cut-Down', sub: 'Meta / TikTok / YouTube Shorts' },
  { value: 6, label: '6s Bumper', sub: 'YouTube Bumper / Pre-Roll' },
];

export function AutoCutDownDialog({
  open,
  onOpenChange,
  scenes,
  onApply,
  hasMasterSnapshot = false,
}: AutoCutDownDialogProps) {
  const [target, setTarget] = useState<CutDownPreset>(15);

  const plan = useMemo(() => computeCutDown(scenes, target), [scenes, target]);
  const currentTotal = useMemo(
    () => scenes.reduce((acc, s) => acc + Math.max(0, s.end_time - s.start_time), 0),
    [scenes],
  );

  useEffect(() => {
    if (open) trackUDC('udc_autocut_opened', { current_total: currentTotal, target });
  }, [open, currentTotal, target]);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#0A0B14] border-[#F5C76A]/20 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#F5C76A]">
            <Scissors className="h-5 w-5" />
            Auto Cut-Down
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Erzeuge aus deinem {currentTotal.toFixed(1)}s Master automatisch eine
            Ad-Kürze — Hook + Payoff bleiben immer erhalten.
            {hasMasterSnapshot ? (
              <span className="block mt-1 text-emerald-300/90 text-xs">
                Master ist bereits als Snapshot gesichert — Restore-Button in der Toolbar.
              </span>
            ) : (
              <span className="block mt-1 text-white/40 text-xs">
                Beim Anwenden wird dein Master automatisch als Snapshot gesichert.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>


        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setTarget(p.value)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-all',
                  target === p.value
                    ? 'border-[#F5C76A]/60 bg-[#F5C76A]/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20',
                )}
              >
                <div className="flex items-center gap-2 font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-[#F5C76A]" />
                  {p.label}
                </div>
                <div className="text-xs text-white/50 mt-0.5">{p.sub}</div>
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/70">Plan</span>
              <Badge
                variant="outline"
                className={cn(
                  'border-0',
                  plan.feasible
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-amber-500/15 text-amber-300',
                )}
              >
                {plan.feasible ? 'Bereit' : 'Näherung'}
              </Badge>
            </div>
            <div className="text-xs text-white/60">{plan.reason}</div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <Stat label="Behalten" value={`${plan.keptIndexes.length}`} />
              <Stat label="Verworfen" value={`${plan.droppedIndexes.length}`} />
              <Stat
                label="Shrink"
                value={`${Math.round(plan.shrinkRatio * 100)}%`}
              />
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-2 space-y-1">
            {plan.scenes.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center gap-2 text-xs text-white/70"
              >
                <span className="text-[#F5C76A]/80 w-6">#{i + 1}</span>
                <span className="truncate flex-1">
                  {s.description || `Scene ${plan.keptIndexes[i] + 1}`}
                </span>
                <span className="tabular-nums text-white/50">
                  {(s.end_time - s.start_time).toFixed(2)}s
                </span>
              </div>
            ))}
            {plan.scenes.length === 0 && (
              <div className="text-xs text-white/40 text-center py-4">
                Keine Szenen zum Kürzen.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-white/60"
          >
            Abbrechen
          </Button>
          <Button
            disabled={plan.scenes.length === 0}
            onClick={() => {
              trackUDC('udc_autocut_generated', {
                target,
                scene_count: plan.scenes.length,
                estimated_duration: plan.target,
              });
              onApply(plan.scenes, target);
              onOpenChange(false);
            }}
            className="bg-[#F5C76A] hover:bg-[#F5C76A]/90 text-black font-semibold"
          >
            <Scissors className="h-4 w-4 mr-1.5" />
            Auf Timeline anwenden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/40 border border-white/5 py-1.5">
      <div className="text-sm font-semibold text-[#F5C76A]">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
    </div>
  );
}
