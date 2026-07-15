import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Activity, Crown, Loader2, RefreshCw, Timer, Zap } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { de } from 'date-fns/locale';

const SLOT_BUDGET_DEFAULT = 60;
const LAMBDA_TOTAL = 100;
const FOUNDER_RESERVE_HIGH_WATER = 50;

type QueueRow = {
  id: string;
  status: string;
  priority: number;
  is_founder: boolean | null;
  estimated_workers: number | null;
  estimated_duration_sec: number | null;
  engine: string | null;
  created_at: string;
  started_at: string | null;
  user_id: string;
};

async function fetchLoad() {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const [activeRes, recentRes, cfgRes] = await Promise.all([
    supabase
      .from('render_queue')
      .select('id,status,priority,is_founder,estimated_workers,estimated_duration_sec,engine,created_at,started_at,user_id')
      .in('status', ['queued', 'processing', 'rendering'])
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(200),
    supabase
      .from('render_queue')
      .select('id,status,is_founder,completed_at,started_at')
      .in('status', ['completed', 'failed'])
      .gte('completed_at', since)
      .limit(500),
    supabase
      .from('system_config')
      .select('key,value')
      .in('key', ['render_queue_enabled', 'render_queue_slot_budget']),
  ]);

  if (activeRes.error) throw activeRes.error;
  const rows = (activeRes.data ?? []) as QueueRow[];
  const cfg = new Map((cfgRes.data ?? []).map((r: any) => [r.key, r.value]));
  const slotBudget = Number(cfg.get('render_queue_slot_budget') ?? SLOT_BUDGET_DEFAULT) || SLOT_BUDGET_DEFAULT;
  const enabled = cfg.get('render_queue_enabled') !== false;

  const running = rows.filter((r) => r.status !== 'queued');
  const queued = rows.filter((r) => r.status === 'queued');
  const slotsUsed = running.reduce((sum, r) => sum + Math.max(1, r.estimated_workers ?? 5), 0);
  const founderRunning = running.filter((r) => r.is_founder).length;
  const founderQueued = queued.filter((r) => r.is_founder).length;

  const recent = recentRes.data ?? [];
  const completed24m = recent.filter((r: any) => r.status === 'completed').length;
  const failed24m = recent.filter((r: any) => r.status === 'failed').length;

  return {
    enabled,
    slotBudget,
    slotsUsed,
    lambdaTotal: LAMBDA_TOTAL,
    highWater: FOUNDER_RESERVE_HIGH_WATER,
    running,
    queued,
    founderRunning,
    founderQueued,
    completed30m: completed24m,
    failed30m: failed24m,
  };
}

export function RenderLoadWidget() {
  const [nowTick, setNowTick] = useState(0);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['admin-render-load'],
    queryFn: fetchLoad,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const invokeManager = async () => {
    await supabase.functions.invoke('render-queue-manager', { body: { trigger: 'admin' } });
    refetch();
  };

  const oldestQueuedAge = useMemo(() => {
    if (!data?.queued?.length) return null;
    const oldest = data.queued.reduce((min, r) => (r.created_at < min ? r.created_at : min), data.queued[0].created_at);
    return oldest;
  }, [data, nowTick]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Lade Render-Load…
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-destructive">Fehler beim Laden: {String(error ?? 'unbekannt')}</div>;
  }

  const slotPct = Math.min(100, Math.round((data.slotsUsed / data.slotBudget) * 100));
  const inReserveBand = data.slotsUsed >= data.highWater;
  const budgetSaturated = data.slotsUsed >= data.slotBudget;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Render Load & Queue
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Live-Auslastung des globalen Lambda-Budgets. Auto-Refresh alle 5s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={invokeManager}>
            <Zap className="w-4 h-4 mr-2" /> Manager-Tick
          </Button>
        </div>
      </div>

      {!data.enabled && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-sm">
            <strong>render_queue ist deaktiviert</strong> (feature-flag „render_queue_enabled" = false). Jobs stapeln
            sich, bis das Flag wieder aktiv ist.
          </CardContent>
        </Card>
      )}

      {/* Slot budget */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lambda-Slot-Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-4xl font-bold tabular-nums">{data.slotsUsed}</span>
              <span className="text-lg text-muted-foreground"> / {data.slotBudget} Render-Slots</span>
            </div>
            <div className="flex items-center gap-2">
              {budgetSaturated && <Badge variant="destructive">Saturiert</Badge>}
              {!budgetSaturated && inReserveBand && (
                <Badge className="bg-amber-500 hover:bg-amber-500">Founder-Reserve aktiv</Badge>
              )}
              {!inReserveBand && <Badge variant="secondary">Normal</Badge>}
            </div>
          </div>
          <Progress value={slotPct} className="h-3" />
          <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
            <div>
              <div className="text-foreground font-medium">{slotPct}%</div>
              <div>ausgelastet</div>
            </div>
            <div>
              <div className="text-foreground font-medium">{data.highWater}</div>
              <div>Founder-Reserve ab</div>
            </div>
            <div>
              <div className="text-foreground font-medium">{data.lambdaTotal}</div>
              <div>AWS-Quota total</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid: running / queued / recent */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Aktive Renders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{data.running.length}</div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Crown className="w-3 h-3 text-amber-500" />
              <span>{data.founderRunning} Founder aktiv</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">In Warteschlange</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{data.queued.length}</div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Timer className="w-3 h-3" />
              {oldestQueuedAge ? (
                <span>
                  Ältester: {formatDistanceToNowStrict(new Date(oldestQueuedAge), { locale: de, addSuffix: false })}
                </span>
              ) : (
                <span>Keine wartenden Jobs</span>
              )}
            </div>
            {data.founderQueued > 0 && (
              <div className="mt-1 text-xs flex items-center gap-1 text-amber-600">
                <Crown className="w-3 h-3" /> {data.founderQueued} Founder wartet
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Letzte 30 Min.</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{data.completed30m}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              erfolgreich · <span className="text-destructive">{data.failed30m} fehlgeschlagen</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active jobs table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Live-Jobs (Top 20 nach Priorität)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Prio</th>
                  <th className="px-4 py-2 font-medium">Engine</th>
                  <th className="px-4 py-2 font-medium">Workers</th>
                  <th className="px-4 py-2 font-medium">Dauer</th>
                  <th className="px-4 py-2 font-medium">Alter</th>
                  <th className="px-4 py-2 font-medium">User</th>
                </tr>
              </thead>
              <tbody>
                {[...data.running, ...data.queued].slice(0, 20).map((r) => {
                  const anchor = r.started_at ?? r.created_at;
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2">
                        {r.status === 'queued' ? (
                          <Badge variant="outline">Queued</Badge>
                        ) : (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">Running</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          {r.is_founder && <Crown className="w-3 h-3 text-amber-500" />}
                          {r.priority}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{r.engine ?? '—'}</td>
                      <td className="px-4 py-2 tabular-nums">{r.estimated_workers ?? '—'}</td>
                      <td className="px-4 py-2 tabular-nums text-xs">
                        {r.estimated_duration_sec ? `${r.estimated_duration_sec}s` : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(anchor), { locale: de, addSuffix: false })}
                      </td>
                      <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">
                        {r.user_id.slice(0, 8)}…
                      </td>
                    </tr>
                  );
                })}
                {data.running.length + data.queued.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      Keine aktiven Jobs
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default RenderLoadWidget;
