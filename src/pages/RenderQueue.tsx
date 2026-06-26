/**
 * /queue — Global Render Queue.
 *
 * Single place to monitor every in-flight render across all Motion-Studio
 * projects. Reads from `composer_scenes` (RLS-scoped). Polls every 5s.
 *
 * Linked from sidebar "erstellen" hub and the Pre-Flight Confirm Dialog.
 */
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Clock, CheckCircle2, XCircle, ArrowRight, Activity } from 'lucide-react';
import { useRenderQueueLive, type QueueRow } from '@/hooks/useRenderQueueLive';
import { CLIP_SOURCE_LABELS } from '@/types/video-composer';

function statusBadge(status: string) {
  const map: Record<string, { tint: string; label: string }> = {
    pending: { tint: 'bg-slate-500/20 text-slate-300 border-slate-500/30', label: 'Wartet' },
    queued: { tint: 'bg-slate-500/20 text-slate-300 border-slate-500/30', label: 'In Queue' },
    generating: { tint: 'bg-sky-500/20 text-sky-300 border-sky-500/30', label: 'Render läuft' },
    composing: { tint: 'bg-sky-500/20 text-sky-300 border-sky-500/30', label: 'Audio + Komposition' },
    lipsync: { tint: 'bg-violet-500/20 text-violet-300 border-violet-500/30', label: 'Lip-Sync' },
    completed: { tint: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', label: 'Fertig' },
    failed: { tint: 'bg-rose-500/20 text-rose-300 border-rose-500/30', label: 'Fehlgeschlagen' },
  };
  const cfg = map[status] ?? { tint: 'bg-muted/30 text-muted-foreground', label: status };
  return (
    <Badge variant="outline" className={`text-[10px] ${cfg.tint}`}>
      {cfg.label}
    </Badge>
  );
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `vor ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `vor ${min}m`;
  const h = Math.floor(min / 60);
  return `vor ${h}h`;
}

function QueueRowCard({ row, onOpen }: { row: QueueRow; onOpen: (id: string) => void }) {
  const providerEntry = row.clip_source
    ? CLIP_SOURCE_LABELS[row.clip_source as keyof typeof CLIP_SOURCE_LABELS]
    : undefined;
  const provider = providerEntry?.de ?? row.clip_source ?? '—';
  return (
    <Card className="p-3 flex items-center justify-between gap-3 hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {row.clip_status === 'failed' ? (
          <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
        ) : row.clip_status === 'completed' ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        ) : (
          <Loader2 className="h-4 w-4 text-sky-400 shrink-0 animate-spin" />
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {row.scene_type} · {provider}
            {row.duration_seconds ? ` · ${row.duration_seconds}s` : ''}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {timeAgo(row.updated_at)}
            <span>·</span>
            <span className="truncate">Projekt {row.project_id.slice(0, 8)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {statusBadge(row.clip_status)}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => onOpen(row.project_id)}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

export default function RenderQueue() {
  const navigate = useNavigate();
  const { rows, recent, loading, refresh } = useRenderQueueLive();

  const openProject = (id: string) => {
    navigate(`/video-composer?project=${id}`);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Render-Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live-Status aller Motion-Studio-Renderjobs. Aktualisiert sich automatisch alle 5 Sekunden.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Aktualisieren
        </Button>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Aktiv {rows.length > 0 && <span className="tabular-nums">({rows.length})</span>}
          </h2>
        </div>
        {loading && rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
            Lade Queue …
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Keine aktiven Render-Jobs.
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <QueueRowCard key={r.id} row={r} onOpen={openProject} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Zuletzt abgeschlossen</h2>
        {recent.length === 0 ? (
          <Card className="p-6 text-center text-xs text-muted-foreground">
            Noch keine kürzlich abgeschlossenen Jobs.
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <QueueRowCard key={r.id} row={r} onOpen={openProject} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
