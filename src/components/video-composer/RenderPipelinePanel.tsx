import { tx } from "@/lib/i18nText";
import { useState } from 'react';
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
import RenderPreFlightDialog from './RenderPreFlightDialog';
import { legacyClipReadyEquivalentRow } from '@/lib/composer/sceneState';

interface RenderPipelinePanelProps {
  projectId?: string;
  scenes: ComposerScene[];
  pendingCount: number;
  failedCount: number;
  isAllReady: boolean;
  onGenerateAll: () => Promise<void> | void;
}

const statusLabel: Record<PipelineStatus, string> = {
  idle: tx({ de: 'Bereit', en: 'Ready', es: 'Listo' }),
  queueing: tx({ de: 'Warteschlange wird vorbereitet …', en: 'Queue is being prepared...', es: 'Se está preparando la cola...' }),
  generating: tx({ de: 'Szenen werden generiert …', en: 'Scenes are being generated...', es: 'Se están generando las escenas...' }),
  stitching: tx({ de: 'Wird zusammengeschnitten …', en: 'Stitching...', es: 'Uniendo...' }),
  ready: tx({ de: 'Fertig 🎬', en: 'Finished 🎬', es: 'Terminado 🎬' }),
  partial: tx({ de: 'Teilweise fertig — Entscheidung nötig', en: 'Partially finished — decision needed', es: 'Parcialmente terminado - se requiere decisión' }),
  failed: tx({ de: 'Fehlgeschlagen', en: 'Failed', es: 'Fallido' }),
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
  const [preflightOpen, setPreflightOpen] = useState(false);
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

  const { status, overallProgress, stitchProgress, videoUrl, renderId, error, startPipeline, continueWithPartial, reset } =
    pipeline;

  const isBusy = status === 'queueing' || status === 'generating' || status === 'stitching';
  const completed = scenes.filter(
    (s) => legacyClipReadyEquivalentRow(s) || (s.clipSource === 'upload' && s.uploadUrl)
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
    const params = new URLSearchParams({
      source_video: videoUrl,
      project_id: projectId,
      source: 'composer',
    });
    if (renderId) params.set('render_id', renderId);
    navigate(`/universal-directors-cut?${params.toString()}`);
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
                {tx({ de: "Szenen einzeln rendern · Final stitchen · Direkt in Director's Cut öffnen.", en: "Render scenes individually · Final stitch · Open directly in Director's Cut.", es: "Renderizar escenas individualmente · Unión final · Abrir directamente en Director's Cut." })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === 'idle' && !isAllReady && (
              <div className="text-[11px] text-muted-foreground italic max-w-[280px] text-right">
              </div>
            )}
            {status === 'idle' && isAllReady && (
              <Button
                size="sm"
                onClick={() => setPreflightOpen(true)}
                disabled={!projectId || scenes.length === 0}
                className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
              >
                <Film className="h-3.5 w-3.5 mr-1.5" />
                {tx({ de: 'Final stitchen', en: 'Final stitch', es: 'Unión final' })}
              </Button>
            )}
            {status === 'partial' && !videoUrl && (
              <>
                <Button size="sm" variant="outline" onClick={continueWithPartial}>
                  <Scissors className="h-3.5 w-3.5 mr-1.5" />
                  {tx({ de: 'Mit fertigen Clips stitchen', en: 'Stitch with ready clips', es: 'Unir con clips terminados' })}
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  {tx({ de: 'Abbrechen', en: 'Cancel', es: 'Cancelar' })}
                </Button>
              </>
            )}
            {status === 'failed' && (
              <Button size="sm" variant="outline" onClick={reset}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                {tx({ de: 'Neu starten', en: 'Restart', es: 'Reiniciar' })}
              </Button>
            )}
            {(status === 'ready' || (status === 'partial' && videoUrl)) && (
              <Button size="sm" variant="ghost" onClick={reset}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                {tx({ de: 'Neu', en: 'New', es: 'Nuevo' })}
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
                  {tx({ de: `${completed} / ${scenes.length} Szenen fertig`, en: `${completed} / ${scenes.length} scenes finished`, es: `${completed} / ${scenes.length} escenas terminadas` })}
                  {failedCount > 0 && (
                    <span className="text-destructive ml-1">· {tx({ de: `${failedCount} fehlgeschlagen`, en: `${failedCount} failed`, es: `${failedCount} fallidas` })}</span>
                  )}
                </span>
              </span>
              <span>{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
            {status === 'stitching' && (
              <p className="text-[11px] text-primary/80 flex items-center gap-1.5">
                <Film className="h-3 w-3" />
                {tx({ de: `Stitching ${stitchProgress}% · finales Video wird erzeugt …`, en: `Stitching ${stitchProgress}% · final video is being created...`, es: `Uniendo ${stitchProgress}% · se está creando el video final...` })}
              </p>
            )}
          </div>
        )}

        {/* Result actions */}
        {videoUrl && (status === 'ready' || status === 'partial') && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <p className="text-sm font-medium">{tx({ de: 'Video bereit — wo weiter?', en: 'Video ready — what next?', es: 'Video listo — ¿qué sigue?' })}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={openInDirectorsCut}
                className="bg-gradient-to-r from-primary to-accent"
              >
                <Scissors className="h-3.5 w-3.5 mr-1.5" />
                {tx({ de: 'In Director&apos;s Cut öffnen', en: 'Open in Director&apos;s Cut', es: 'Abrir en Director&apos;s Cut' })}
              </Button>
              <Button size="sm" variant="outline" onClick={downloadVideo}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {tx({ de: 'Herunterladen', en: 'Download', es: 'Descargar' })}
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href="/mediathek" target="_blank" rel="noopener noreferrer">
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                  {tx({ de: 'Mediathek', en: 'Media Library', es: 'Mediateca' })}
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
              {tx({ de: `${failedCount} Szene(n) fehlgeschlagen. Du kannst die fehlenden einzeln neu generieren oder`, en: `${failedCount} scene(s) failed. You can regenerate the missing ones individually or`, es: `${failedCount} escena(s) fallida(s). Puedes regenerar las faltantes individualmente o` })}
              {tx({ de: `jetzt mit den fertigen ${completed} Clips stitchen.`, en: `stitch now with the ${completed} ready clips.`, es: `unir ahora con los ${completed} clips terminados.` })}
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

      <RenderPreFlightDialog
        open={preflightOpen}
        onOpenChange={setPreflightOpen}
        scenes={scenes}
        onConfirm={() => startPipeline('directors_cut')}
      />
    </Card>
  );
}
