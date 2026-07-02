import React, { useEffect, useMemo, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Scissors, MapPin, Minus, Plus, RotateCcw, Film, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SceneLike {
  id: string;
  start_time: number;
  end_time: number;
  thumbnail_url?: string;
  description?: string;
  original_start_time?: number;
  original_end_time?: number;
  media_source_start?: number;
  media_source_end?: number;
  additionalMedia?: any;
}

interface SceneTrimInspectorProps {
  scene: SceneLike;
  sceneIndex: number;
  sourceDuration: number;
  currentTime: number;
  onTrim: (sceneId: string, srcIn: number, srcOut: number) => void;
  onSplitAtPlayhead?: () => void;
  onSplitAtTrim?: (sceneId: string) => void;
  onSeek?: (timelineTime: number) => void;
  onDelete?: (sceneId: string) => void;
}

const STEP = 0.1;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

export const SceneTrimInspector: React.FC<SceneTrimInspectorProps> = ({
  scene,
  sceneIndex,
  sourceDuration,
  currentTime,
  onTrim,
  onSplitAtPlayhead,
  onSplitAtTrim,
  onSeek,
  onDelete,
}) => {
  const isAdditional = !!scene.additionalMedia;
  // Use the FULL media source range (media_source_*), not the current trim window,
  // so the user can always widen the trim back out again.
  const mediaClipDur =
    (scene.additionalMedia && typeof scene.additionalMedia.duration === 'number')
      ? scene.additionalMedia.duration
      : undefined;
  const hardMin = isAdditional
    ? (scene.media_source_start ?? 0)
    : 0;
  const hardMax = isAdditional
    ? (scene.media_source_end ?? mediaClipDur ?? (scene.original_end_time ?? scene.end_time))
    : (sourceDuration && sourceDuration > 0 ? sourceDuration : (scene.original_end_time ?? scene.end_time));

  const srcIn = scene.original_start_time ?? scene.start_time;
  const srcOut = scene.original_end_time ?? scene.end_time;
  const length = Math.max(0, srcOut - srcIn);

  // Local draft state for the dual-slider so live drags don't spam commitHistory.
  // We commit only on onValueCommit (mouse-up). Reset when scene / committed values change.
  const [draft, setDraft] = useState<[number, number]>([srcIn, srcOut]);
  useEffect(() => {
    setDraft([srcIn, srcOut]);
  }, [srcIn, srcOut, scene.id]);

  // Local controlled state for numeric inputs so the DOM element never remounts.
  const [inText, setInText] = useState(srcIn.toFixed(2));
  const [outText, setOutText] = useState(srcOut.toFixed(2));
  useEffect(() => { setInText(srcIn.toFixed(2)); }, [srcIn, scene.id]);
  useEffect(() => { setOutText(srcOut.toFixed(2)); }, [srcOut, scene.id]);

  // Playhead-Position relativ zur Quelle (nur nützlich wenn Playhead in der Szene ist)
  const playheadInSource = useMemo(() => {
    if (currentTime < scene.start_time || currentTime > scene.end_time) return null;
    return srcIn + (currentTime - scene.start_time);
  }, [currentTime, scene.start_time, scene.end_time, srcIn]);

  const applyIn = (v: number) => {
    const next = clamp(round2(v), hardMin, srcOut - STEP);
    if (Math.abs(next - srcIn) < 0.001) return;
    onTrim(scene.id, next, srcOut);
  };
  const applyOut = (v: number) => {
    const next = clamp(round2(v), srcIn + STEP, hardMax);
    if (Math.abs(next - srcOut) < 0.001) return;
    onTrim(scene.id, srcIn, next);
  };

  const setInToPlayhead = () => {
    if (playheadInSource === null) return;
    applyIn(playheadInSource);
  };
  const setOutToPlayhead = () => {
    if (playheadInSource === null) return;
    applyOut(playheadInSource);
  };

  const reset = () => {
    onTrim(scene.id, hardMin, hardMax);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-[#F5C76A]/10">
        <Film className="h-4 w-4 text-[#F5C76A]" />
        <span className="text-sm text-white font-medium">Szene {sceneIndex + 1}</span>
        <span className="ml-auto text-[10px] text-white/40">
          Quelle {hardMin.toFixed(1)}s → {hardMax.toFixed(1)}s
        </span>
      </div>

      {/* Filmstrip + Dual-Slider */}
      <div>
        <div
          className="relative h-16 w-full rounded-lg overflow-hidden border border-white/10 bg-[#050816]"
          style={
            scene.thumbnail_url
              ? {
                  backgroundImage: `url(${scene.thumbnail_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        >
          {/* Dim outside area */}
          <div
            className="absolute inset-y-0 bg-black/60"
            style={{
              left: 0,
              width: `${(srcIn / Math.max(hardMax, 0.01)) * 100}%`,
            }}
          />
          <div
            className="absolute inset-y-0 bg-black/60"
            style={{
              right: 0,
              width: `${((hardMax - srcOut) / Math.max(hardMax, 0.01)) * 100}%`,
            }}
          />
          {/* Selection border */}
          <div
            className="absolute inset-y-0 border-x-2 border-[#F5C76A] pointer-events-none"
            style={{
              left: `${(srcIn / Math.max(hardMax, 0.01)) * 100}%`,
              width: `${(length / Math.max(hardMax, 0.01)) * 100}%`,
            }}
          />
          {/* Playhead */}
          {playheadInSource !== null && (
            <div
              className="absolute inset-y-0 w-[2px] bg-cyan-300 pointer-events-none"
              style={{ left: `${(playheadInSource / Math.max(hardMax, 0.01)) * 100}%` }}
            />
          )}
        </div>

        <div className="pt-3 px-1">
          <Slider
            value={[srcIn, srcOut]}
            min={hardMin}
            max={hardMax}
            step={STEP}
            onValueChange={(vals) => {
              const [a, b] = vals as [number, number];
              const ni = clamp(a, hardMin, b - STEP);
              const no = clamp(b, ni + STEP, hardMax);
              onTrim(scene.id, round2(ni), round2(no));
            }}
          />
        </div>
      </div>

      {/* Numeric inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/50 block mb-1.5">Start</label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-8 shrink-0 border-white/10 bg-[#0a0a1a]/60 text-white/70"
              onClick={() => applyIn(srcIn - STEP)}
              title="-0.1s"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="number"
              step={STEP}
              min={hardMin}
              max={hardMax}
              key={`in-${scene.id}-${srcIn}`}
              defaultValue={srcIn.toFixed(2)}
              onBlur={(e) => applyIn(parseFloat(e.target.value) || 0)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="h-9 text-sm text-white bg-[#0a0a1a]/60 border-white/10 text-center"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-8 shrink-0 border-white/10 bg-[#0a0a1a]/60 text-white/70"
              onClick={() => applyIn(srcIn + STEP)}
              title="+0.1s"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={playheadInSource === null}
            onClick={setInToPlayhead}
            className="w-full mt-1.5 h-7 text-[10px] text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-30"
          >
            <MapPin className="h-3 w-3 mr-1" />
            Auf Playhead
          </Button>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/50 block mb-1.5">Ende</label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-8 shrink-0 border-white/10 bg-[#0a0a1a]/60 text-white/70"
              onClick={() => applyOut(srcOut - STEP)}
              title="-0.1s"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="number"
              step={STEP}
              min={hardMin}
              max={hardMax}
              key={`out-${scene.id}-${srcOut}`}
              defaultValue={srcOut.toFixed(2)}
              onBlur={(e) => applyOut(parseFloat(e.target.value) || 0)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="h-9 text-sm text-white bg-[#0a0a1a]/60 border-white/10 text-center"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-8 shrink-0 border-white/10 bg-[#0a0a1a]/60 text-white/70"
              onClick={() => applyOut(srcOut + STEP)}
              title="+0.1s"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={playheadInSource === null}
            onClick={setOutToPlayhead}
            className="w-full mt-1.5 h-7 text-[10px] text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-30"
          >
            <MapPin className="h-3 w-3 mr-1" />
            Auf Playhead
          </Button>
        </div>
      </div>

      {/* Live length */}
      <div className="flex items-center justify-between text-xs bg-[#0a0a1a]/60 border border-white/10 px-3 py-2 rounded-lg">
        <div className="flex items-center gap-1.5 text-white/60">
          <Clock className="h-3.5 w-3.5" />
          <span>Länge</span>
        </div>
        <span className="text-[#F5C76A] font-semibold tabular-nums">{length.toFixed(2)}s</span>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          className="border-white/10 text-white/70 hover:text-white hover:bg-white/5"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Zurücksetzen
        </Button>
        {(() => {
          const EDGE = 0.05;
          const trimHead = srcIn > hardMin + 0.001;
          const trimTail = srcOut < hardMax - 0.001;
          const hasTrim = trimHead || trimTail;
          const playheadInside =
            currentTime > scene.start_time + EDGE &&
            currentTime < scene.end_time - EDGE;
          const playheadAtEdge =
            playheadInSource !== null && !playheadInside;

          // Priority 1: Playhead is inside scene interior → offer clean playhead split.
          if (onSplitAtPlayhead && playheadInside) {
            return (
              <Button
                variant="outline"
                size="sm"
                onClick={onSplitAtPlayhead}
                title={`Am Playhead teilen (${currentTime.toFixed(2)}s)`}
                className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
              >
                <Scissors className="h-3.5 w-3.5 mr-1.5" />
                Am Playhead teilen
              </Button>
            );
          }

          // Priority 2: Trim boundaries set → split at trim (head/middle/tail).
          if (onSplitAtTrim && hasTrim) {
            return (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSplitAtTrim(scene.id)}
                title={`An Trim-Grenzen teilen (${srcIn.toFixed(2)}s / ${srcOut.toFixed(2)}s)`}
                className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
              >
                <Scissors className="h-3.5 w-3.5 mr-1.5" />
                An Trim teilen
              </Button>
            );
          }

          // Priority 3: Playhead exactly at an edge → offer to jump inside.
          if (onSplitAtPlayhead && playheadAtEdge && onSeek) {
            const sceneMid = (scene.start_time + scene.end_time) / 2;
            return (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSeek(sceneMid)}
                title="Playhead an Szenengrenze — springt zur Szenenmitte, dann erneut teilen"
                className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
              >
                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                In Szene springen
              </Button>
            );
          }

          // Fallback: disabled with hint.
          return (
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Bewege den Playhead in die Szene oder setze Start/Ende im Inspector, um zu teilen."
              className="border-white/10 text-white/40 disabled:opacity-40"
            >
              <Scissors className="h-3.5 w-3.5 mr-1.5" />
              Teilen
            </Button>
          );
        })()}
      </div>

      {onDelete && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(scene.id)}
          className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          Szene löschen
        </Button>
      )}
    </div>
  );
};

export default SceneTrimInspector;
