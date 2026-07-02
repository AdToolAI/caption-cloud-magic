import { useMemo } from 'react';
import { Anchor, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SceneAnalysis } from '@/types/directors-cut';
import {
  analyzeAnchorDrift,
  snapSceneToAnchor,
  snapAllToAnchor,
  type AnchorDrift,
} from '@/lib/directors-cut/anchorRefresh';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenes: SceneAnalysis[];
  onScenesUpdate: (scenes: SceneAnalysis[]) => void;
}

const SEVERITY_STYLES: Record<AnchorDrift['severity'], string> = {
  ok: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  warn: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  drift: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

const SEVERITY_LABEL: Record<AnchorDrift['severity'], string> = {
  ok: 'OK',
  warn: 'Warnung',
  drift: 'Drift',
};

export function AnchorRefreshDialog({ open, onOpenChange, scenes, onScenesUpdate }: Props) {
  const drifts = useMemo(() => analyzeAnchorDrift(scenes), [scenes]);
  const driftingCount = drifts.filter((d) => d.severity !== 'ok').length;
  const snappableCount = drifts.filter((d) => d.canSnap && d.severity !== 'ok').length;

  const handleSnapOne = (sceneId: string) => {
    const next = scenes.map((s) => (s.id === sceneId ? snapSceneToAnchor(s) : s));
    onScenesUpdate(next);
  };

  const handleSnapAll = () => {
    onScenesUpdate(snapAllToAnchor(scenes, true));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-[#0A0A12] border-[#F5C76A]/20 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#F5C76A]">
            <Anchor className="h-5 w-5" />
            Anchor-Refresh — Character Consistency
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Prüft für jede Szene, ob der Identity-Anchor (Establishing-Frame) noch intakt ist.
            Head-Trims &gt; 0.35s schneiden den vom AI-Provider fixierten Charakter-Look weg
            und verursachen Drift zwischen den Szenen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="border-white/15 text-white/80">
              {scenes.length} Szenen
            </Badge>
            {driftingCount > 0 ? (
              <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/30 border">
                {driftingCount} mit Drift
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 border">
                Alle Anchors intakt
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            disabled={snappableCount === 0}
            onClick={handleSnapAll}
            className="gap-2 bg-gradient-to-r from-[#F5C76A] to-[#d4a843] text-black hover:from-[#FFE4A0] hover:to-[#F5C76A] disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Alle {snappableCount > 0 ? `(${snappableCount})` : ''} refreshen
          </Button>
        </div>

        <ScrollArea className="h-[420px] pr-3">
          <div className="space-y-2">
            {drifts.map((d) => (
              <div
                key={d.sceneId}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-2 transition-colors',
                  d.severity === 'drift'
                    ? 'border-rose-500/30 bg-rose-500/5'
                    : d.severity === 'warn'
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-white/10 bg-white/5',
                )}
              >
                <div className="w-24 h-14 rounded overflow-hidden bg-black/40 flex-shrink-0">
                  {d.thumbnail ? (
                    <img src={d.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
                      Frame
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">Szene {d.index + 1}</span>
                    <Badge className={cn('border text-[10px]', SEVERITY_STYLES[d.severity])}>
                      {d.severity === 'ok' ? (
                        <Check className="h-2.5 w-2.5 mr-0.5" />
                      ) : (
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      )}
                      {SEVERITY_LABEL[d.severity]}
                    </Badge>
                    <span className="text-[11px] text-white/50">
                      Head-Trim {d.headTrim.toFixed(2)}s
                    </span>
                  </div>
                  <p className="text-xs text-white/60 mt-0.5 truncate">{d.reason}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!d.canSnap}
                  onClick={() => handleSnapOne(d.sceneId)}
                  className="h-7 gap-1.5 border-[#F5C76A]/30 text-[#F5C76A] hover:bg-[#F5C76A]/10 disabled:opacity-30"
                >
                  <RefreshCw className="h-3 w-3" />
                  Snap
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white/70">
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
