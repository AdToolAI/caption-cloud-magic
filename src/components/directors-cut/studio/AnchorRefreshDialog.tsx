import { useEffect, useMemo, useState } from 'react';
import { Anchor, RefreshCw, AlertTriangle, Check, ArrowRight, Loader2 } from 'lucide-react';
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
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type { SceneAnalysis } from '@/types/directors-cut';
import {
  analyzeAnchorDrift,
  snapSceneToAnchor,
  snapAllToAnchor,
  DEFAULT_DRIFT_THRESHOLD,
  type AnchorDrift,
} from '@/lib/directors-cut/anchorRefresh';
import { extractVideoFrame } from '@/lib/directors-cut/videoFrameExtractor';
import { trackUDC } from '@/lib/analytics';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenes: SceneAnalysis[];
  onScenesUpdate: (scenes: SceneAnalysis[]) => void;
  /** Fallback source video URL for scenes without additionalMedia. */
  sourceVideoUrl?: string | null;
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

const sourceUrlFor = (
  scene: SceneAnalysis | undefined,
  fallback?: string | null,
): string | null => {
  if (!scene) return null;
  if (scene.additionalMedia?.type === 'video' && scene.additionalMedia.url) {
    return scene.additionalMedia.url;
  }
  return fallback ?? null;
};

export function AnchorRefreshDialog({
  open,
  onOpenChange,
  scenes,
  onScenesUpdate,
  sourceVideoUrl = null,
}: Props) {
  const [threshold, setThreshold] = useState<number>(DEFAULT_DRIFT_THRESHOLD);
  const [frames, setFrames] = useState<Record<string, { current?: string | null; loading: boolean }>>({});

  const drifts = useMemo(
    () => analyzeAnchorDrift(scenes, { driftThreshold: threshold }),
    [scenes, threshold],
  );
  const driftingCount = drifts.filter((d) => d.severity !== 'ok').length;
  const snappableCount = drifts.filter((d) => d.canSnap && d.severity !== 'ok').length;

  // Lazily extract "current head frame" for each drifting scene when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    drifts.forEach((d) => {
      if (d.severity === 'ok') return;
      if (frames[d.sceneId]) return;
      const scene = scenes.find((s) => s.id === d.sceneId);
      const url = sourceUrlFor(scene, sourceVideoUrl);
      if (!url) {
        setFrames((prev) => ({ ...prev, [d.sceneId]: { current: null, loading: false } }));
        return;
      }
      setFrames((prev) => ({ ...prev, [d.sceneId]: { loading: true } }));
      extractVideoFrame(url, d.currentSourceIn).then((data) => {
        if (cancelled) return;
        setFrames((prev) => ({ ...prev, [d.sceneId]: { current: data, loading: false } }));
      });
    });

    return () => { cancelled = true; };
  }, [open, drifts, scenes, sourceVideoUrl, frames]);

  // Reset frame cache when dialog closes so re-open shows fresh state.
  useEffect(() => {
    if (!open) setFrames({});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    trackUDC('udc_anchor_refresh_opened', {
      total_scenes: scenes.length,
      drift_count: drifts.filter((d) => d.severity !== 'ok').length,
      threshold,
    });
  }, [open, scenes.length, drifts, threshold]);

  const handleSnapOne = (sceneId: string) => {
    const next = scenes.map((s) => (s.id === sceneId ? snapSceneToAnchor(s) : s));
    onScenesUpdate(next);
    trackUDC('udc_anchor_snap_applied', { mode: 'single', scene_id: sceneId });
  };

  const handleSnapAll = () => {
    const affected = drifts.filter((d) => d.severity !== 'ok').length;
    onScenesUpdate(snapAllToAnchor(scenes, true, { driftThreshold: threshold }));
    trackUDC('udc_anchor_snap_applied', { mode: 'all', affected, threshold });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-[#0A0A12] border-[#F5C76A]/20 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#F5C76A]">
            <Anchor className="h-5 w-5" />
            Anchor-Refresh — Character Consistency
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Vergleicht den aktuellen Kopf-Frame jeder Szene mit dem gespeicherten Identity-Anchor.
            „Snap" setzt den Source-In zurück auf den Anchor und stellt den Charakter-Look wieder her.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="border-white/15 text-white/80">
              {scenes.length} Szenen
            </Badge>
            {driftingCount > 0 ? (
              <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/30 border">
                {driftingCount} betroffen
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 border">
                Alle Anchors intakt
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 min-w-[280px]">
            <span className="text-xs text-white/50 whitespace-nowrap">
              Drift-Schwelle
            </span>
            <Slider
              min={0.05}
              max={1}
              step={0.05}
              value={[threshold]}
              onValueChange={(v) => setThreshold(v[0] ?? DEFAULT_DRIFT_THRESHOLD)}
              className="w-40"
            />
            <span className="text-xs font-mono text-[#F5C76A] w-14 text-right">
              {threshold.toFixed(2)}s
            </span>
          </div>

          <Button
            size="sm"
            disabled={snappableCount === 0}
            onClick={handleSnapAll}
            className="gap-2 bg-gradient-to-r from-[#F5C76A] to-[#d4a843] text-black hover:from-[#FFE4A0] hover:to-[#F5C76A] disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Alle{snappableCount > 0 ? ` (${snappableCount})` : ''} refreshen
          </Button>
        </div>

        <ScrollArea className="h-[460px] pr-3">
          <div className="space-y-2">
            {drifts.map((d) => {
              const frame = frames[d.sceneId];
              const showCompare = d.severity !== 'ok';
              return (
                <div
                  key={d.sceneId}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-2.5 transition-colors',
                    d.severity === 'drift'
                      ? 'border-rose-500/30 bg-rose-500/5'
                      : d.severity === 'warn'
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-white/10 bg-white/5',
                  )}
                >
                  {showCompare ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Current head frame */}
                      <div className="relative">
                        <div className="w-24 h-14 rounded overflow-hidden bg-black/60 flex items-center justify-center">
                          {frame?.loading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                          ) : frame?.current ? (
                            <img
                              src={frame.current}
                              alt="Aktueller Frame"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[9px] text-white/30 px-1 text-center">Kein Preview</span>
                          )}
                        </div>
                        <span className="absolute -top-1.5 left-1 text-[9px] font-semibold text-rose-300 bg-[#0A0A12] px-1 rounded">
                          Jetzt
                        </span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-white/40 flex-shrink-0" />
                      {/* Anchor thumbnail */}
                      <div className="relative">
                        <div className="w-24 h-14 rounded overflow-hidden bg-black/60 flex items-center justify-center ring-1 ring-emerald-500/40">
                          {d.thumbnail ? (
                            <img src={d.thumbnail} alt="Anchor" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[9px] text-white/30 px-1 text-center">Kein Anchor</span>
                          )}
                        </div>
                        <span className="absolute -top-1.5 left-1 text-[9px] font-semibold text-emerald-300 bg-[#0A0A12] px-1 rounded">
                          Anchor
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-24 h-14 rounded overflow-hidden bg-black/40 flex-shrink-0">
                      {d.thumbnail ? (
                        <img src={d.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
                          Frame
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
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
                    className="h-8 gap-1.5 border-[#F5C76A]/30 text-[#F5C76A] hover:bg-[#F5C76A]/10 disabled:opacity-30"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Snap
                  </Button>
                </div>
              );
            })}
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
