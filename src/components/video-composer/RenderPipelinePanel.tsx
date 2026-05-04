import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Rocket,
  CheckCircle2,
  AlertTriangle,
  Film,
  Scissors,
  Download,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import { useMultiSceneRender, type PipelineStatus } from '@/hooks/useMultiSceneRender';
import type { ComposerScene } from '@/types/video-composer';

interface RenderPipelinePanelProps {
  projectId?: string;
  scenes: ComposerScene[];
  pendingCount: number;
  failedCount: number;
  isAllReady: boolean;
  onGenerateAll: () => Promise<void> | void;
}

const statusLabel: Record<PipelineStatus, string> = {
  idle: 'Bereit',
  queueing: 'Warteschlange wird vorbereitet …',
  generating: 'Szenen werden generiert …',
  stitching: 'Wird zusammengeschnitten …',
  ready: 'Fertig 🎬',
  partial: 'Teilweise fertig — Entscheidung nötig',
  failed: 'Fehlgeschlagen',
};

const statusVariant: Record<PipelineStatus, string> = {
  idle: 'bg-muted/40 text-muted-foreground border-border/40',
  queueing: 'bg-amber-500/15 text-amber-300 border-amber-500/40 animate-pulse',
  generating: 'bg-accent/15 text-accent border-accent/40 animate-pulse',
  stitching: 'bg-primary/15 text-primary border-primary/40 animate-pulse',
  ready: 'bg-green-500/15 text-green-400 border-green-500/40',
  partial: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  failed: 'bg-destructive/15 text-destructive border-destructive/40',
};

export default function RenderPipelinePanel({
  projectId,
  scenes,
  pendingCount,
  failedCount,
  isAllReady,
  onGenerateAll,
}: RenderPipelinePanelProps) {
  const navigate = useNavigate();
  const pipeline = useMultiSceneRender({
    projectId,
    scenes,
    pendingCount,
    failedCount,
    isAllReady: () => isAllReady,
    onGenerateAll: async () => {
      await onGenerateAll();
    },
  });

  const { status, overallProgress, stitchProgress, videoUrl, error, startPipeline, continueWithPartial, reset } =
    pipeline;

  const isBusy = status === 'queueing' || status === 'generating' || status === 'stitching';
  const completed = scenes.filter(
    (s) => s.clipStatus === 'ready' || (s.clipSource === 'upload' && s.uploadUrl)
  ).length;

  const openInDirectorsCut = () => {
    if (!videoUrl) return;
    if (!projectId) {
      // Without a persisted project we cannot deterministically import the
      // composer scenes. Refuse navigation rather than letting Director's Cut
      // fall back to AI Auto-Cut on a freshly stitched (and unrelated-looking)
      // video, which is the cause of the "wrong scenes" symptom.
      console.warn('[Composer] openInDirectorsCut: missing projectId — refusing handoff');
      return;
    }
    navigate(
      `/universal-directors-cut?source_video=${encodeURIComponent(videoUrl)}` +
      `&project_id=${encodeURIComponent(projectId)}&source=composer`
    );
  };

  const downloadVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `composer-video-${Date.now()}.mp4`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card/80 to-accent/5 backdrop-blur-sm">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/15 border border-primary/40 p-2.5">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                Render Pipeline
                <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${statusVariant[status]}`}>
                  {statusLabel[status]}
                </Badge>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generieren · Stitchen · Direkt in Director&apos;s Cut öffnen — alles in einem Klick.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === 'idle' && (
              <Button
                size="sm"
                onClick={() => startPipeline('directors_cut')}
                disabled={!projectId || scenes.length === 0}
                className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
              >
                <Rocket className="h-3.5 w-3.5 mr-1.5" />
                Render All & Stitch
              </Button>
            )}
            {status === 'partial' && !videoUrl && (
              <>
                <Button size="sm" variant="outline" onClick={continueWithPartial}>
                  <Scissors className="h-3.5 w-3.5 mr-1.5" />
                  Mit fertigen Clips stitchen
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Abbrechen
                </Button>
              </>
            )}
            {status === 'failed' && (
              <Button size="sm" variant="outline" onClick={reset}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Neu starten
              </Button>
            )}
            {(status === 'ready' || (status === 'partial' && videoUrl)) && (
              <Button size="sm" variant="ghost" onClick={reset}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Neu
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        {(isBusy || status === 'ready' || status === 'partial') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {isBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>
                  {completed} / {scenes.length} Szenen fertig
                  {failedCount > 0 && (
                    <span className="text-destructive ml-1">· {failedCount} fehlgeschlagen</span>
                  )}
                </span>
              </span>
              <span>{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
            {status === 'stitching' && (
              <p className="text-[11px] text-primary/80 flex items-center gap-1.5">
                <Film className="h-3 w-3" />
                Stitching {stitchProgress}% · finales Video wird erzeugt …
              </p>
            )}
          </div>
        )}

        {/* Result actions */}
        {videoUrl && (status === 'ready' || status === 'partial') && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <p className="text-sm font-medium">Video bereit — wo weiter?</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={openInDirectorsCut}
                className="bg-gradient-to-r from-primary to-accent"
              >
                <Scissors className="h-3.5 w-3.5 mr-1.5" />
                In Director&apos;s Cut öffnen
              </Button>
              <Button size="sm" variant="outline" onClick={downloadVideo}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Herunterladen
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href="/mediathek" target="_blank" rel="noopener noreferrer">
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                  Mediathek
                </a>
              </Button>
            </div>
          </div>
        )}

        {/* Partial-failure helper */}
        {status === 'partial' && !videoUrl && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              {failedCount} Szene(n) fehlgeschlagen. Du kannst die fehlenden einzeln neu generieren oder
              jetzt mit den fertigen {completed} Clips stitchen.
            </span>
          </div>
        )}

        {/* Error banner */}
        {status === 'failed' && error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
