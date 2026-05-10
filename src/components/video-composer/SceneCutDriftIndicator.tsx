// Phase 3 — Drift-Ampel an JEDEM Cut
//
// Renders a thin horizontal bar between two consecutive scene cards in the
// storyboard. As soon as both scenes have a clip URL, it auto-runs a
// `detect-scene-drift` check against the boundary frame pair (last frame of
// previous scene ↔ first frame of next scene = its clip URL). The cached
// score is read from `scene.continuityDriftScore` so we don't re-pay each
// time the dashboard mounts.
//
// Buttons:
//   • Re-check: forces a new drift check
//   • Anker übernehmen: copies prev scene's last frame into next scene's
//     referenceImageUrl + sets continuityLocked → next render uses it as
//     i2v first frame to repair the bruch.

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Link2, ArrowDown } from 'lucide-react';
import type { ComposerScene } from '@/types/video-composer';
import { useContinuityDrift, driftSeverity } from '@/hooks/useContinuityDrift';
import { cn } from '@/lib/utils';

interface Props {
  prev: ComposerScene;
  next: ComposerScene;
  projectId?: string;
  onUpdateNext: (updates: Partial<ComposerScene>) => void;
  language?: 'de' | 'en' | 'es';
}

const TXT = {
  de: { check: 'Drift prüfen', recheck: 'Erneut prüfen', repair: 'Anker übernehmen', noUrl: 'Beide Clips müssen gerendert sein', score: 'Score' },
  en: { check: 'Check drift', recheck: 'Re-check', repair: 'Use as anchor', noUrl: 'Both clips must be rendered', score: 'Score' },
  es: { check: 'Verificar drift', recheck: 'Volver a comprobar', repair: 'Usar como ancla', noUrl: 'Ambos clips deben estar renderizados', score: 'Puntuación' },
};

export default function SceneCutDriftIndicator({
  prev,
  next,
  projectId,
  onUpdateNext,
  language = 'de',
}: Props) {
  const t = TXT[language];
  const { checkDrift, checkingPairId } = useContinuityDrift();
  const [score, setScore] = useState<number | null>(
    typeof next.continuityDriftScore === 'number' ? next.continuityDriftScore : null,
  );
  const [label, setLabel] = useState<string | null>(null);
  const autoRanRef = useRef(false);

  const anchorImageUrl = prev.lastFrameUrl ?? prev.clipUrl;
  const candidateImageUrl = next.clipUrl;
  const ready = !!anchorImageUrl && !!candidateImageUrl;
  const isLoading = checkingPairId === next.id;

  // Sync from external scene state (so re-fetches after a render update the pill).
  useEffect(() => {
    if (typeof next.continuityDriftScore === 'number') {
      setScore(next.continuityDriftScore);
    }
  }, [next.continuityDriftScore]);

  const run = async (force = false) => {
    if (!ready) return;
    if (!force && typeof next.continuityDriftScore === 'number') return;
    const result = await checkDrift({
      anchorImageUrl: anchorImageUrl!,
      candidateImageUrl: candidateImageUrl!,
      sceneId: next.id,
      anchorSceneId: prev.id,
      projectId,
      context: {
        sceneType: prev.sceneType,
        nextSceneType: next.sceneType,
        nextPrompt: next.aiPrompt,
      },
    });
    if (result) {
      setScore(result.driftScore);
      setLabel(result.label || null);
      onUpdateNext({ continuityDriftScore: result.driftScore });
    }
  };

  // Auto-run once when both clips are ready and no score cached yet.
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!ready) return;
    if (typeof next.continuityDriftScore === 'number') return;
    autoRanRef.current = true;
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, next.id]);

  const sev = driftSeverity(score);
  const showRepair = score != null && score > 55 && !!anchorImageUrl;

  const repair = () => {
    onUpdateNext({
      referenceImageUrl: anchorImageUrl!,
      continuityLocked: true,
      lockReferenceUrl: anchorImageUrl!,
      continuationSourceSceneId: prev.id,
      // Invalidate clip so user re-renders with anchor as first frame
      clipStatus: 'pending',
      clipUrl: undefined,
    });
  };

  return (
    <div
      className={cn(
        'mx-6 my-1 flex items-center gap-2 rounded-md border px-2 py-1 text-[10px]',
        sev.bg,
      )}
    >
      <ArrowDown className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground shrink-0">
        {`${prev.orderIndex + 1} → ${next.orderIndex + 1}`}
      </span>
      {!ready ? (
        <span className="text-muted-foreground/70 italic">{t.noUrl}</span>
      ) : (
        <>
          <span className={cn('font-semibold', sev.color)}>
            {sev.label}
            {score != null && (
              <span className="ml-1 tabular-nums opacity-80">· {t.score} {score}</span>
            )}
          </span>
          {label && score != null && score > 25 && (
            <span className="text-muted-foreground/70 truncate hidden md:inline">
              · {label}
            </span>
          )}
          <div className="flex-1" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[10px] gap-1"
            onClick={() => run(true)}
            disabled={isLoading}
            title={t.recheck}
          >
            {isLoading ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <RefreshCw className="h-2.5 w-2.5" />
            )}
            {score == null ? t.check : t.recheck}
          </Button>
          {showRepair && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-5 px-1.5 text-[10px] gap-1 border-current"
              onClick={repair}
              title={t.repair}
            >
              <Link2 className="h-2.5 w-2.5" />
              {t.repair}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
