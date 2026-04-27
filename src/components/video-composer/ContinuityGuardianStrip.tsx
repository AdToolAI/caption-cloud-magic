import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  ShieldCheck,
  Sparkles,
  Wand2,
  Zap,
  AlertTriangle,
  Check,
  Lock,
  LockOpen,
  History,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFrameContinuity } from '@/hooks/useFrameContinuity';
import { useContinuityDrift, driftSeverity } from '@/hooks/useContinuityDrift';
import ContinuityHistoryDrawer from './ContinuityHistoryDrawer';
import type { ComposerScene } from '@/types/video-composer';

interface ContinuityGuardianStripProps {
  scenes: ComposerScene[];
  projectId?: string;
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  /**
   * Optional callback to trigger re-generation of a scene with locked
   * reference image (called by "Repair" button).
   */
  onRepairScene?: (scene: ComposerScene) => void | Promise<void>;
}

interface PairState {
  prev: ComposerScene;
  next: ComposerScene;
}

/**
 * Continuity Guardian — Reference-Chaining 2.0 cockpit.
 *
 * Iterates over every consecutive AI-clip pair and shows:
 *   • A drift score (0-100) per cut
 *   • One-click "Repair" that locks the previous last-frame as reference
 *     and queues a re-render of the next scene
 *   • Bulk "Auto-check all" + "Repair all broken cuts" actions
 */
export default function ContinuityGuardianStrip({
  scenes,
  projectId,
  onUpdateScenes,
  onRepairScene,
}: ContinuityGuardianStripProps) {
  const { extractLastFrame } = useFrameContinuity();
  const { checkDrift, checkDriftBatch, setSceneLock, checkingPairId } = useContinuityDrift();
  const [bulkRunning, setBulkRunning] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Only compute pairs where BOTH sides are AI-generated and READY
  const pairs: PairState[] = useMemo(() => {
    const out: PairState[] = [];
    for (let i = 0; i < scenes.length - 1; i++) {
      const prev = scenes[i];
      const next = scenes[i + 1];
      const prevReady =
        prev.clipStatus === 'ready' &&
        (prev.clipUrl || prev.uploadUrl) &&
        prev.clipSource.startsWith('ai-');
      const nextReady =
        next.clipStatus === 'ready' &&
        (next.clipUrl || next.uploadUrl) &&
        next.clipSource.startsWith('ai-');
      if (prevReady && nextReady) out.push({ prev, next });
    }
    return out;
  }, [scenes]);

  const checkPair = async (pair: PairState) => {
    let anchorUrl = pair.prev.lastFrameUrl;
    // Lazy-extract last frame if missing
    if (!anchorUrl && pair.prev.clipUrl) {
      const r = await extractLastFrame({
        videoUrl: pair.prev.clipUrl,
        sceneId: pair.prev.id,
        projectId,
        durationSeconds: pair.prev.durationSeconds,
      });
      if (!r) return null;
      anchorUrl = r.lastFrameUrl;
      onUpdateScenes(
        scenes.map((s) =>
          s.id === pair.prev.id ? { ...s, lastFrameUrl: anchorUrl! } : s
        )
      );
    }

    // Candidate = next-scene reference image (if locked) OR the next clip's
    // first frame proxy (we use clipUrl + 0s timestamp by reusing last-frame
    // extractor with duration=0.1 → returns frame near the very start).
    let candidateUrl = pair.next.referenceImageUrl ?? pair.next.firstFrameUrl;
    if (!candidateUrl && pair.next.clipUrl) {
      const r = await extractLastFrame({
        videoUrl: pair.next.clipUrl,
        sceneId: pair.next.id,
        projectId,
        durationSeconds: 0.15, // → ffmpeg picks frame at ~0.1s = first frame
      });
      if (!r) return null;
      candidateUrl = r.lastFrameUrl;
    }

    if (!anchorUrl || !candidateUrl) return null;

    const result = await checkDrift({
      anchorImageUrl: anchorUrl,
      candidateImageUrl: candidateUrl,
      sceneId: pair.next.id,
      anchorSceneId: pair.prev.id,
      projectId,
    });
    if (!result) return null;

    // Update local state on the "next" scene
    onUpdateScenes(
      scenes.map((s) =>
        s.id === pair.next.id
          ? {
              ...s,
              continuityDriftScore: result.driftScore,
              continuityDriftLabel: result.label,
            }
          : s
      )
    );
    return result;
  };

  const checkAll = async () => {
    if (pairs.length === 0) {
      toast.info('Keine geeigneten Szenen-Paare zum Prüfen');
      return;
    }
    setBulkRunning(true);
    try {
      // Run sequentially to avoid hammering the gateway
      let okCount = 0;
      let warnCount = 0;
      let brokenCount = 0;
      for (const p of pairs) {
        const r = await checkPair(p);
        if (!r) continue;
        if (r.driftScore <= 35) okCount++;
        else if (r.driftScore <= 65) warnCount++;
        else brokenCount++;
      }
      toast.success(
        `Continuity geprüft: ${okCount} ok · ${warnCount} drift · ${brokenCount} bruch`
      );
    } finally {
      setBulkRunning(false);
    }
  };

  const repairPair = async (pair: PairState) => {
    if (!onRepairScene) {
      toast.info('Repair-Handler nicht verfügbar');
      return;
    }
    // Lock previous last-frame as reference image of the next scene
    let anchorUrl = pair.prev.lastFrameUrl;
    if (!anchorUrl && pair.prev.clipUrl) {
      const r = await extractLastFrame({
        videoUrl: pair.prev.clipUrl,
        sceneId: pair.prev.id,
        projectId,
        durationSeconds: pair.prev.durationSeconds,
      });
      if (!r) return;
      anchorUrl = r.lastFrameUrl;
    }
    if (!anchorUrl) {
      toast.error('Kein Anker-Frame verfügbar');
      return;
    }
    const lockedNext: ComposerScene = {
      ...pair.next,
      referenceImageUrl: anchorUrl,
      // Reset score so user sees fresh state after repair
      continuityDriftScore: undefined,
      continuityDriftLabel: undefined,
    };
    onUpdateScenes(
      scenes.map((s) => (s.id === pair.next.id ? lockedNext : s))
    );
    toast.success('Anker-Frame verriegelt — starte Repair-Render…');
    await onRepairScene(lockedNext);
  };

  const repairAllBroken = async () => {
    const broken = pairs.filter(
      (p) =>
        typeof p.next.continuityDriftScore === 'number' &&
        p.next.continuityDriftScore! >= 36
    );
    if (broken.length === 0) {
      toast.info('Keine kaputten Cuts zu reparieren');
      return;
    }
    for (const p of broken) {
      await repairPair(p);
    }
  };

  if (pairs.length === 0) return null;

  const summary = pairs.reduce(
    (acc, p) => {
      const s = p.next.continuityDriftScore;
      if (s == null) acc.unknown++;
      else if (s <= 35) acc.ok++;
      else if (s <= 65) acc.warn++;
      else acc.broken++;
      return acc;
    },
    { ok: 0, warn: 0, broken: 0, unknown: 0 }
  );

  return (
    <Card className="p-4 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl border-primary/30 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-sm">Continuity Guardian</div>
            <div className="text-[11px] text-muted-foreground">
              Reference-Chaining 2.0 · {pairs.length} Cut
              {pairs.length === 1 ? '' : 's'} überwacht
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {summary.ok > 0 && (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
              <Check className="h-3 w-3" /> {summary.ok}
            </Badge>
          )}
          {summary.warn > 0 && (
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
              <AlertTriangle className="h-3 w-3" /> {summary.warn}
            </Badge>
          )}
          {summary.broken > 0 && (
            <Badge className="bg-red-500/15 text-red-400 border-red-500/30 gap-1">
              <AlertTriangle className="h-3 w-3" /> {summary.broken}
            </Badge>
          )}
          {summary.unknown > 0 && (
            <Badge variant="outline" className="text-muted-foreground">
              {summary.unknown} ungeprüft
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={checkAll}
            disabled={bulkRunning}
            className="gap-1.5"
          >
            {bulkRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Alles prüfen
          </Button>
          {summary.warn + summary.broken > 0 && (
            <Button
              size="sm"
              onClick={repairAllBroken}
              disabled={bulkRunning}
              className="gap-1.5 bg-gradient-to-r from-primary to-accent"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Alle reparieren
            </Button>
          )}
        </div>
      </div>

      {/* Cut chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {pairs.map((p, i) => (
          <CutChip
            key={`${p.prev.id}-${p.next.id}`}
            index={i + 1}
            pair={p}
            checking={checkingPairId === p.next.id}
            onCheck={() => checkPair(p)}
            onRepair={() => repairPair(p)}
          />
        ))}
      </div>
    </Card>
  );
}

function CutChip({
  index,
  pair,
  checking,
  onCheck,
  onRepair,
}: {
  index: number;
  pair: PairState;
  checking: boolean;
  onCheck: () => void;
  onRepair: () => void;
}) {
  const score = pair.next.continuityDriftScore ?? null;
  const label = pair.next.continuityDriftLabel ?? '';
  const sev = driftSeverity(score);

  return (
    <div
      className={cn(
        'shrink-0 min-w-[160px] rounded-lg border p-2.5 transition',
        sev.bg
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold tracking-wider uppercase opacity-70">
          Cut #{index}
        </span>
        {score != null && (
          <span className={cn('text-sm font-bold tabular-nums', sev.color)}>
            {score}
          </span>
        )}
      </div>
      <div className={cn('text-[11px] font-semibold mb-1', sev.color)}>
        {sev.label}
      </div>
      {label && (
        <div className="text-[10px] text-muted-foreground line-clamp-2 leading-tight mb-2">
          {label}
        </div>
      )}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onCheck}
          disabled={checking}
          className="h-6 px-2 text-[10px] flex-1"
        >
          {checking ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : score == null ? (
            'Prüfen'
          ) : (
            'Re-check'
          )}
        </Button>
        {(sev.level === 'warn' || sev.level === 'broken') && (
          <Button
            size="sm"
            onClick={onRepair}
            className="h-6 px-2 text-[10px] gap-1 bg-primary"
          >
            <Zap className="h-3 w-3" /> Fix
          </Button>
        )}
      </div>
    </div>
  );
}
