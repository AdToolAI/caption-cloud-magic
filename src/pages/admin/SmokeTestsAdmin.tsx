import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Play, RefreshCw, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface SmokeRun {
  id: string;
  test_name: string;
  status: string;
  latency_ms: number | null;
  error_message: string | null;
  run_at: string;
}

interface TestSummary {
  test_name: string;
  last_status: string;
  last_latency: number | null;
  last_run: string;
  pass_rate_24h: number;
  total_runs_24h: number;
  last_error: string | null;
}

export function SmokeTestsAdmin() {
  const [runs, setRuns] = useState<SmokeRun[]>([]);
  const [summary, setSummary] = useState<TestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('smoke_test_runs')
      .select('*')
      .gte('run_at', since)
      .order('run_at', { ascending: false })
      .limit(500);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const allRuns = (data ?? []) as SmokeRun[];
    setRuns(allRuns);

    // Aggregate per test
    const byName = new Map<string, SmokeRun[]>();
    for (const r of allRuns) {
      const list = byName.get(r.test_name) ?? [];
      list.push(r);
      byName.set(r.test_name, list);
    }

    const summaryRows: TestSummary[] = [];
    for (const [name, list] of byName.entries()) {
      const sorted = list.sort(
        (a, b) => new Date(b.run_at).getTime() - new Date(a.run_at).getTime()
      );
      const last = sorted[0];
      const passes = list.filter((r) => r.status === 'pass').length;
      summaryRows.push({
        test_name: name,
        last_status: last.status,
        last_latency: last.latency_ms,
        last_run: last.run_at,
        pass_rate_24h: list.length > 0 ? (passes / list.length) * 100 : 0,
        total_runs_24h: list.length,
        last_error: last.error_message,
      });
    }

    summaryRows.sort((a, b) => a.test_name.localeCompare(b.test_name));
    setSummary(summaryRows);
    setLoading(false);
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('daily-smoke-test');
      if (error) throw error;
      toast.success(
        `Smoke-Test fertig — ${data?.passed ?? 0} ✅ / ${data?.failed ?? 0} ❌`
      );
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const passingCount = summary.filter((s) => s.last_status === 'pass').length;
  const failingCount = summary.filter((s) => s.last_status === 'fail').length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" />
                Daily Smoke Tests
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Automatischer Health-Check täglich um 06:00 — DB, Auth, Storage & kritische Edge Functions
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={load} variant="outline" size="icon">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={runNow} disabled={running}>
                {running ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Jetzt ausführen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">Tests Total</p>
              <p className="text-2xl font-bold">{summary.length}</p>
            </div>
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
              <p className="text-sm text-muted-foreground">Passing</p>
              <p className="text-2xl font-bold text-green-600">{passingCount}</p>
            </div>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-muted-foreground">Failing</p>
              <p className="text-2xl font-bold text-destructive">{failingCount}</p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Lade...</div>
          ) : summary.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Noch keine Smoke-Test-Daten</p>
              <p className="text-sm mt-1">Klicke „Jetzt ausführen" um den ersten Test zu starten.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {summary.map((s) => (
                <div
                  key={s.test_name}
                  className="flex items-center justify-between gap-3 border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {s.last_status === 'pass' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm font-medium truncate">{s.test_name}</p>
                      {s.last_error && (
                        <p className="text-xs text-destructive truncate mt-0.5">
                          {s.last_error}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    {s.last_latency !== null && (
                      <Badge variant="outline">{s.last_latency}ms</Badge>
                    )}
                    <Badge variant="outline">
                      {s.pass_rate_24h.toFixed(0)}% / {s.total_runs_24h} runs
                    </Badge>
                    <span className="text-muted-foreground hidden md:inline">
                      {formatDistanceToNow(new Date(s.last_run), {
                        addSuffix: true,
                        locale: de,
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
