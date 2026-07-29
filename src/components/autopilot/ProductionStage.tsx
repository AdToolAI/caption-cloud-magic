/**
 * Production stage — what the customer watches while the film is being made.
 *
 * Shows the two-step reality of the pipeline per scene (frame approved →
 * animated) without exposing prompts, engines or scores as jargon.
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Loader2, XCircle, Image as ImageIcon, Film } from 'lucide-react';
import type {
  DirectorLogRow,
  ProductionRow,
  ProductionSceneRow,
} from '@/hooks/useAutopilotProduction';
import { cn } from '@/lib/utils';

const STAGE_LABEL: Record<string, string> = {
  treatment: 'Konzept',
  anchors: 'Bildfreigabe',
  motion: 'Animation',
  scenes_ready: 'Szenen fertig',
  failed: 'Abgebrochen',
};

const SCENE_LABEL: Record<string, string> = {
  pending: 'Wartet',
  anchor: 'Bild wird geprüft',
  motion: 'Wird animiert',
  completed: 'Fertig',
  failed: 'Fehlgeschlagen',
};

function SceneIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === 'anchor') return <ImageIcon className="h-4 w-4 animate-pulse text-muted-foreground" />;
  if (status === 'motion') return <Film className="h-4 w-4 animate-pulse text-muted-foreground" />;
  return <Loader2 className="h-4 w-4 text-muted-foreground" />;
}

interface Props {
  production: ProductionRow;
  scenes: ProductionSceneRow[];
  log: DirectorLogRow[];
}

export function ProductionStage({ production, scenes, log }: Props) {
  const done = scenes.filter((scene) => scene.status === 'completed').length;

  return (
    <Card className="border-primary/20 bg-card/60 p-6 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{STAGE_LABEL[production.stage] ?? production.stage}</Badge>
        <Badge variant="outline">
          {done}/{scenes.length} Szenen
        </Badge>
        {production.status === 'failed' && <Badge variant="destructive">Abgebrochen</Badge>}
      </div>

      <Progress value={production.progress} className="mt-4" />

      {production.error_message && (
        <p className="mt-3 text-sm text-destructive">{production.error_message}</p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {scenes.map((scene) => (
          <div
            key={scene.id}
            className={cn(
              'flex gap-3 rounded-xl border border-border/50 bg-background/40 p-3',
              scene.status === 'failed' && 'border-destructive/40',
            )}
          >
            <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted/40">
              {scene.anchor_url && (
                <img
                  src={scene.anchor_url}
                  alt={`Szene ${scene.scene_index + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{String(scene.scene_index + 1).padStart(2, '0')}</span>
                <SceneIcon status={scene.status} />
                <span className="truncate">{SCENE_LABEL[scene.status] ?? scene.status}</span>
                <span className="ml-auto">{Number(scene.duration_seconds).toFixed(1)}s</span>
              </div>
              {scene.video_url ? (
                <video
                  src={scene.video_url}
                  controls
                  playsInline
                  className="mt-2 w-full rounded-md"
                />
              ) : (
                scene.error_message && (
                  <p className="mt-1 text-xs text-destructive">{scene.error_message}</p>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {log.length > 0 && (
        <div className="mt-6 max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-border/50 bg-muted/10 p-3">
          {log.map((entry) => (
            <p
              key={entry.id}
              className={cn(
                'text-xs',
                entry.severity === 'error' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {entry.message}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
