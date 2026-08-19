import { tx } from "@/lib/i18nText";
/**
 * /queue — Global Render Queue.
 *
 * Live-Status aller Motion-Studio-Renderjobs (RLS-scoped). Poll every 5s.
 * Cancel-Aktionen: pro Zeile, pro Status-Gruppe, oder alle aktiven.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, RefreshCw, Clock, CheckCircle2, XCircle, ArrowRight, Activity, Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useRenderQueueLive, type QueueRow } from '@/hooks/useRenderQueueLive';
import { CLIP_SOURCE_LABELS } from '@/types/video-composer';
import { sceneState } from '@/lib/composer/sceneState';

const LIVE_STATUSES = ['pending', 'queued', 'generating', 'composing', 'lipsync'] as const;

/**
 * v430 Schritt 5E — Anzeige-Status kommt aus dem Zustandsautomaten,
 * nicht mehr aus der Alt-Spalte `clip_status`.
 */
function queueStatusOf(row: QueueRow): string {
  switch (sceneState(row)) {
    case 'idle': return 'pending';
    case 'plate_queued': return 'queued';
    case 'plate_rendering': return 'generating';
    case 'audio_prep':
    case 'audio_ready': return 'composing';
    case 'lipsync_dispatched':
    case 'lipsync_running':
    case 'lipsync_muxing': return 'lipsync';
    case 'plate_ready':
    case 'complete': return 'completed';
    case 'failed': return 'failed';
    case 'canceled': return 'canceled';
    default: return 'pending';
  }
}

const STATUS_META: Record<string, { tint: string; label: string }> = {
  pending: { tint: 'bg-slate-500/20 text-slate-300 border-slate-500/30', label: tx({ de: 'Wartet', en: 'Waiting', es: 'Esperando' }) },
  queued: { tint: 'bg-slate-500/20 text-slate-300 border-slate-500/30', label: tx({ de: 'In Queue', en: 'In queue', es: 'En cola' }) },
  generating: { tint: 'bg-sky-500/20 text-sky-300 border-sky-500/30', label: tx({ de: 'Render läuft', en: 'Rendering', es: 'Renderizando' }) },
  composing: { tint: 'bg-sky-500/20 text-sky-300 border-sky-500/30', label: tx({ de: 'Audio + Komposition', en: 'Audio + Composition', es: 'Audio y composición' }) },
  lipsync: { tint: 'bg-violet-500/20 text-violet-300 border-violet-500/30', label: tx({ de: 'Lip-Sync', en: 'Lip-sync', es: 'Sincronización labial' }) },
  completed: { tint: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', label: tx({ de: 'Fertig', en: 'Done', es: 'Hecho' }) },
  failed: { tint: 'bg-rose-500/20 text-rose-300 border-rose-500/30', label: tx({ de: 'Fehlgeschlagen', en: 'Failed', es: 'Fallido' }) },
  canceled: { tint: 'bg-muted/30 text-muted-foreground border-muted', label: tx({ de: 'Abgebrochen', en: 'Canceled', es: 'Cancelado' }) },
};

function statusBadge(status: string) {
  const cfg = STATUS_META[status] ?? { tint: 'bg-muted/30 text-muted-foreground', label: status };
  return <Badge variant="outline" className={`text-[10px] ${cfg.tint}`}>{cfg.label}</Badge>;
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return tx({ de: `vor ${sec}s`, en: `${sec}s ago`, es: `hace ${sec}s` });
  const min = Math.floor(sec / 60);
  if (min < 60) return tx({ de: `vor ${min}m`, en: `${min}m ago`, es: `hace ${min}m` });
  const h = Math.floor(min / 60);
  return tx({ de: `vor ${h}h`, en: `${h}h ago`, es: `hace ${h}h` });
}

async function cancelScenes(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const CHUNK = 200;
  let canceled = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.functions.invoke('composer-cancel-scene', {
      body: { scene_ids: chunk },
    });
    if (error) throw new Error(error.message);
    canceled += Number(data?.canceled ?? 0);
  }
  return canceled;
}

function QueueRowCard({
  row,
  onOpen,
  onCancel,
  canceling,
}: {
  row: QueueRow;
  onOpen: (id: string) => void;
  onCancel?: (row: QueueRow) => void;
  canceling?: boolean;
}) {
  const providerEntry = row.clip_source
    ? CLIP_SOURCE_LABELS[row.clip_source as keyof typeof CLIP_SOURCE_LABELS]
    : undefined;
  const provider = providerEntry?.de ?? row.clip_source ?? '—';
  const status = queueStatusOf(row);
  const isLive = (LIVE_STATUSES as readonly string[]).includes(status);

  return (
    <Card className="p-3 flex items-center justify-between gap-3 hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {status === 'failed' || status === 'canceled' ? (
          <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
        ) : status === 'completed' ? (
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
            <span className="truncate">{tx({ de: "Projekt", en: "Project", es: "Proyecto" })} {row.project_id.slice(0, 8)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {statusBadge(status)}
        {isLive && onCancel && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
            onClick={() => onCancel(row)}
            disabled={canceling}
            title={tx({ de: "Diesen Job abbrechen", en: "Cancel this job", es: "Cancelar este trabajo" })}
          >
            {canceling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onOpen(row.project_id)}>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

export default function RenderQueue() {
  const navigate = useNavigate();
  const { rows, recent, zombieCount, loading, refresh } = useRenderQueueLive();
  const [busy, setBusy] = useState<string | null>(null); // "row:<id>" | "status:<s>" | "all"
  const [confirm, setConfirm] = useState<null | { kind: 'row' | 'status' | 'all'; ids: string[]; label: string }>(null);

  const openProject = (id: string) => navigate(`/video-composer?project=${id}`);

  // Group active rows by status
  const grouped = useMemo(() => {
    const g: Record<string, QueueRow[]> = {};
    for (const r of rows) {
      (g[queueStatusOf(r)] ??= []).push(r);
    }
    return g;
  }, [rows]);

  async function runCancel(ids: string[], busyKey: string, label: string) {
    setBusy(busyKey);
    try {
      const n = await cancelScenes(ids);
      toast.success(tx({ de: `${n} Job${n === 1 ? '' : 's'} abgebrochen · ${label}`, en: `${n} job${n === 1 ? '' : 's'} canceled · ${label}`, es: `${n} trabajo${n === 1 ? '' : 's'} cancelado(s) · ${label}` }));
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? tx({ de: 'Abbruch fehlgeschlagen', en: 'Abort failed', es: 'Abortar falló' }));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  const allActiveIds = rows.map((r) => r.id);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            {tx({ de: "Render-Queue", en: "Render queue", es: "Cola de renderizado" })}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tx({ de: "Live-Status aller Motion-Studio-Renderjobs. Aktualisiert sich automatisch alle 5 Sekunden.", en: "Live status of all Motion Studio render jobs. Updates automatically every 5 seconds.", es: "Estado en vivo de todos los trabajos de renderizado de Motion Studio. Se actualiza automáticamente cada 5 segundos." })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            {tx({ de: "Aktualisieren", en: "Refresh", es: "Actualizar" })}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={allActiveIds.length === 0 || busy !== null}
            onClick={() =>
              setConfirm({
                kind: 'all',
                ids: allActiveIds,
                label: tx({ de: `Alle aktiven (${allActiveIds.length})`, en: `All active (${allActiveIds.length})`, es: `Todo activo (${allActiveIds.length})` }),
              })
            }
          >
            {busy === 'all' ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Ban className="h-3.5 w-3.5 mr-1.5" />
            )}
            {tx({ de: "Alle abbrechen", en: "Cancel all", es: "Cancelar todo" })}
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            {tx({ de: "Aktiv", en: "Active", es: "Activo" })} {rows.length > 0 && <span className="tabular-nums">({rows.length})</span>}
          </h2>
        </div>

        {zombieCount > 0 && (
          <Card className="p-3 flex items-center gap-3 border-amber-500/30 bg-amber-500/5">
            <Loader2 className="h-4 w-4 text-amber-400 animate-spin shrink-0" />
            <div className="text-xs text-amber-200/90">
              <span className="font-medium">{zombieCount}</span> {tx({ de: "ältere Jobs (> 24 h) werden vom System automatisch bereinigt. Du musst nichts tun — der Watchdog bricht sie ab und erstattet verbrauchte Credits zurück.", en: "older jobs (> 24 h) are automatically cleaned up by the system. You don\u2019t need to do anything — the watchdog cancels them and refunds spent credits.", es: "trabajos más antiguos (> 24 h) se limpian automáticamente. No tienes que hacer nada; el watchdog los cancela y reembolsa los créditos gastados." })}
            </div>
          </Card>
        )}


        {loading && rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
            {tx({ de: "Lade Queue …", en: "Loading queue …", es: "Cargando cola …" })}
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {tx({ de: "Keine aktiven Render-Jobs.", en: "No active render jobs.", es: "Sin trabajos de renderizado activos." })}
          </Card>
        ) : (
          <div className="space-y-4">
            {LIVE_STATUSES.filter((s) => grouped[s]?.length).map((s) => {
              const groupRows = grouped[s]!;
              const groupIds = groupRows.map((r) => r.id);
              const busyKey = `status:${s}`;
              return (
                <div key={s} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      {statusBadge(s)}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {groupRows.length} Job{groupRows.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      disabled={busy !== null}
                      onClick={() =>
                        setConfirm({
                          kind: 'status',
                          ids: groupIds,
                          label: STATUS_META[s]?.label ?? s,
                        })
                      }
                    >
                      {busy === busyKey ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Ban className="h-3 w-3 mr-1" />
                      )}
                      {tx({ de: "Alle", en: "Cancel all", es: "Cancelar todo" })} "{STATUS_META[s]?.label ?? s}"{tx({ de: " abbrechen", en: "", es: "" })}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {groupRows.map((r) => (
                      <QueueRowCard
                        key={r.id}
                        row={r}
                        onOpen={openProject}
                        onCancel={(row) =>
                          setConfirm({
                            kind: 'row',
                            ids: [row.id],
                            label: `${row.scene_type} · ${row.project_id.slice(0, 8)}`,
                          })
                        }
                        canceling={busy === `row:${r.id}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{tx({ de: "Zuletzt abgeschlossen", en: "Recently completed", es: "Completado recientemente" })}</h2>
        {recent.length === 0 ? (
          <Card className="p-6 text-center text-xs text-muted-foreground">
            {tx({ de: "Noch keine kürzlich abgeschlossenen Jobs.", en: "No recently completed jobs yet.", es: "Aún no hay trabajos completados recientemente." })}
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <QueueRowCard key={r.id} row={r} onOpen={openProject} />
            ))}
          </div>
        )}
      </section>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx({ de: "Jobs wirklich abbrechen?", en: "Really cancel jobs?", es: "¿Cancelar trabajos realmente?" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (
                <>
                  <span className="font-medium text-foreground">{confirm.ids.length}</span> {tx({ de: `Job${confirm.ids.length === 1 ? '' : 'stx({ de: "} werden gestoppt (${confirm.label}). Laufende Provider-Anfragen (Replicate, Sync.so) werden best-effort abgebrochen. Diese Aktion kann nicht rückgängig gemacht werden.`, en: `job${confirm.ids.length === 1 ? ", en: "} will be stopped (${confirm.label}). Ongoing provider requests (Replicate, Sync.so) will be cancelled best-effort. This action cannot be undone.", es: "} se detendrán (${confirm.label}). Las solicitudes de proveedor en curso (Replicate, Sync.so) se cancelarán en la medida de lo posible. Esta acción no se puede deshacer." })' : 's'} will be stopped (${confirm.label}). Ongoing provider requests (Replicate, Sync.so) will be canceled on a best-effort basis. This action cannot be undone.`, es: `trabajo${confirm.ids.length === 1 ? '' : 's'} se detendrán (${confirm.label}). Las solicitudes en curso a proveedores (Replicate, Sync.so) se cancelarán de forma best-effort. Esta acción no se puede deshacer.` })}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>{tx({ de: "Zurück", en: "Back", es: "Atrás" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                const key =
                  confirm.kind === 'all'
                    ? 'all'
                    : confirm.kind === 'status'
                    ? `status:${confirm.label}`
                    : `row:${confirm.ids[0]}`;
                void runCancel(confirm.ids, key, confirm.label);
              }}
              className="bg-rose-500 hover:bg-rose-600"
            >
              {tx({ de: "Abbrechen bestätigen", en: "Confirm Cancel", es: "Confirmar cancelación" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
