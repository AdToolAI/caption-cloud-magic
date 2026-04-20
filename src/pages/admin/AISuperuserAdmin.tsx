import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Play, Loader2, CheckCircle2, XCircle, AlertTriangle, Bot, Sparkles, RefreshCw, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

// Whitelist of currently active scenarios — must mirror SCENARIOS in
// supabase/functions/ai-superuser-test-runner. Anything else is treated as
// orphaned (e.g. removed scenarios with leftover historical runs).
const ACTIVE_SCENARIOS = new Set<string>([
  'Caption Generation (EN)',
  'Bio Generation (DE)',
  'Bio Generation (ES)',
  'Image Generation',
  'Campaign Generation',
  'Performance Analytics',
  'Hashtag Analysis',
  'Posting Times Recommendation',
  'Comments Analysis',
  'Trend Radar Fetch',
]);

// Latency color thresholds (ms) — KI-Calls können legitim 5-10s dauern
const latencyClass = (ms: number | null | undefined): string => {
  if (!ms) return 'text-muted-foreground';
  if (ms < 3000) return 'text-muted-foreground';
  if (ms < 8000) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-destructive';
};

interface Run {
  id: string;
  scenario_name: string;
  status: 'pass' | 'fail' | 'warning' | 'running';
  latency_ms: number | null;
  http_status: number | null;
  error_message: string | null;
  full_request_json: any;
  full_response_json: any;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
}

interface Anomaly {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  pattern_description: string;
  affected_scenarios: string[];
  ai_analysis: string | null;
  detected_at: string;
  resolved_at: string | null;
}

interface ScenarioStatus {
  name: string;
  lastRun: Run | null;
  passRate: number;
  totalRuns: number;
}

export function AISuperuserAdmin() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [creatingBugReport, setCreatingBugReport] = useState(false);

  const createBugReportFromRun = async (run: Run) => {
    setCreatingBugReport(true);
    try {
      const { error } = await supabase.from('bug_reports').insert({
        title: `[KI Superuser] ${run.scenario_name} fehlgeschlagen`,
        description: `Test-Szenario "${run.scenario_name}" ist fehlgeschlagen.\n\nHTTP: ${run.http_status}\nLatenz: ${run.latency_ms}ms\n\nError: ${run.error_message || 'unknown'}\n\nRequest:\n${JSON.stringify(run.full_request_json, null, 2)}\n\nResponse:\n${JSON.stringify(run.full_response_json, null, 2)}`,
        severity: run.status === 'fail' ? 'high' : 'medium',
        status: 'open',
        route: '/admin (KI Superuser)',
        metadata: { source: 'ai_superuser', run_id: run.id, scenario: run.scenario_name },
      });
      if (error) throw error;
      toast.success('Bug-Report erstellt');
    } catch (err) {
      toast.error(`Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`);
    } finally {
      setCreatingBugReport(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const [runsRes, anomaliesRes] = await Promise.all([
      supabase
        .from('ai_superuser_runs')
        .select('*')
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(200),
      supabase
        .from('ai_superuser_anomalies')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(50),
    ]);

    if (runsRes.data) setRuns(runsRes.data as Run[]);
    if (anomaliesRes.data) setAnomalies(anomaliesRes.data as Anomaly[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const triggerRun = async (mode: 'fast' | 'full') => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-superuser-test-runner', {
        body: { mode, triggeredBy: 'manual' },
      });
      if (error) throw error;
      toast.success(`Tests abgeschlossen: ${data.summary?.passed || 0} bestanden, ${data.summary?.failed || 0} fehlgeschlagen`);
      await fetchData();
    } catch (err) {
      toast.error(`Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`);
    } finally {
      setRunning(false);
    }
  };

  const triggerAnalysis = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-superuser-anomalies', {});
      if (error) throw error;
      toast.success(`Analyse: ${data.anomaliesDetected} Anomalien erkannt, ${data.bugReportsCreated} Bug-Reports erstellt`);
      await fetchData();
    } catch (err) {
      toast.error(`Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // Filter out orphaned scenarios (removed from suite but still in DB)
  const activeRuns = runs.filter((r) => ACTIVE_SCENARIOS.has(r.scenario_name));

  // Group by scenario - latest status, pass-rate over last 5 runs (sliding window)
  const scenarios: ScenarioStatus[] = Object.values(
    activeRuns.reduce((acc, run) => {
      if (!acc[run.scenario_name]) {
        acc[run.scenario_name] = {
          name: run.scenario_name,
          lastRun: run, // runs are sorted desc → first is latest
          passRate: 0,
          totalRuns: 0,
        };
      }
      acc[run.scenario_name].totalRuns++;
      return acc;
    }, {} as Record<string, ScenarioStatus>)
  ).map((s) => {
    // Sliding window: only the most recent 5 runs count toward pass rate
    const recentRuns = activeRuns.filter((r) => r.scenario_name === s.name).slice(0, 5);
    const passes = recentRuns.filter((r) => r.status === 'pass').length;
    return { ...s, passRate: recentRuns.length > 0 ? (passes / recentRuns.length) * 100 : 0 };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // "All systems operational" — every active scenario's most recent run is a pass
  const allGreen = scenarios.length > 0 && scenarios.every((s) => s.lastRun?.status === 'pass');
  const latestRunAt = scenarios.reduce<string | null>((latest, s) => {
    if (!s.lastRun) return latest;
    if (!latest || new Date(s.lastRun.started_at) > new Date(latest)) return s.lastRun.started_at;
    return latest;
  }, null);

  const deleteOldRuns = async () => {
    if (!confirm('Test-Runs älter als 7 Tage löschen?')) return;
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('ai_superuser_runs').delete().lt('started_at', cutoff);
    if (error) {
      toast.error(`Fehler: ${error.message}`);
    } else {
      toast.success('Alte Test-Runs gelöscht');
      await fetchData();
    }
  };

  const resetPassRateHistory = async () => {
    if (!confirm('Pass-Rate-Historie zurücksetzen? Alle Runs älter als 1 Stunde werden unwiderruflich gelöscht.')) return;
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('ai_superuser_runs').delete().lt('started_at', cutoff);
    if (error) {
      toast.error(`Fehler: ${error.message}`);
    } else {
      toast.success('Pass-Rate-Historie zurückgesetzt');
      await fetchData();
    }
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'pass') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    if (status === 'fail') return <XCircle className="h-5 w-5 text-destructive" />;
    if (status === 'warning') return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    return <Loader2 className="h-5 w-5 animate-spin" />;
  };

  const severityColor = (sev: string) => {
    if (sev === 'critical') return 'destructive';
    if (sev === 'high') return 'destructive';
    if (sev === 'medium') return 'default';
    return 'secondary';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" /> KI Superuser
          </h2>
          <p className="text-muted-foreground">Proaktive Tests aller kritischen User-Flows</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={triggerAnalysis} variant="outline" disabled={analyzing}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            KI-Analyse
          </Button>
          <Button onClick={() => triggerRun('fast')} disabled={running} variant="outline">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Schnell-Test
          </Button>
          <Button onClick={() => triggerRun('full')} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Komplett-Test
          </Button>
          <Button onClick={deleteOldRuns} variant="ghost" size="sm" title="Runs > 7 Tage löschen">
            Alte Runs löschen
          </Button>
          <Button onClick={resetPassRateHistory} variant="ghost" size="sm" title="Alle Runs > 1 Stunde löschen — saubere Baseline">
            Pass-Rate zurücksetzen
          </Button>
        </div>
      </div>

      {allGreen && (
        <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-4 flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-green-500 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-green-700 dark:text-green-400">
              Alle {scenarios.length} Szenarien laufen stabil
            </div>
            {latestRunAt && (
              <div className="text-xs text-muted-foreground">
                Letzter Komplett-Test {formatDistanceToNow(new Date(latestRunAt), { addSuffix: true, locale: de })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground" title="Summe der Latenzen aller Szenarien im letzten Komplett-Test">Letzter Run (gesamt)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${latencyClass(scenarios.reduce((sum, s) => sum + (s.lastRun?.latency_ms || 0), 0) / Math.max(scenarios.length, 1) * scenarios.length / 3)}`}>
              {(scenarios.reduce((sum, s) => sum + (s.lastRun?.latency_ms || 0), 0) / 1000).toFixed(1)}s
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Szenarien</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{scenarios.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Test-Runs (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{runs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pass-Rate (letzte 5)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">
              {scenarios.length > 0
                ? Math.round(scenarios.reduce((sum, s) => sum + s.passRate, 0) / scenarios.length)
                : 0}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Offene Anomalien</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              {anomalies.filter((a) => !a.resolved_at).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {anomalies.filter((a) => !a.resolved_at).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Aktive Anomalien
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {anomalies.filter((a) => !a.resolved_at).slice(0, 5).map((a) => (
                <div key={a.id} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={severityColor(a.severity) as any}>{a.severity}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(a.detected_at), { addSuffix: true, locale: de })}
                        </span>
                      </div>
                      <p className="text-sm">{a.pattern_description}</p>
                      {a.ai_analysis && (
                        <p className="text-xs text-muted-foreground mt-2 italic">💡 {a.ai_analysis}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Szenarien-Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Szenario</TableHead>
                <TableHead>Letzter Run</TableHead>
                <TableHead>Pass-Rate</TableHead>
                <TableHead title="Echte Edge-Function-Latenz inkl. KI-Modell-Antwortzeit. 5–10 s sind bei Bild-/Multi-Step-Generierung normal.">Latenz</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarios.map((s) => (
                <TableRow key={s.name}>
                  <TableCell><StatusIcon status={s.lastRun?.status || 'unknown'} /></TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.lastRun ? formatDistanceToNow(new Date(s.lastRun.started_at), { addSuffix: true, locale: de }) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.passRate >= 80 ? 'default' : s.passRate >= 50 ? 'secondary' : 'destructive'}>
                      {Math.round(s.passRate)}%
                    </Badge>
                  </TableCell>
                  <TableCell className={latencyClass(s.lastRun?.latency_ms)}>{s.lastRun?.latency_ms ? `${s.lastRun.latency_ms}ms` : '-'}</TableCell>
                  <TableCell>{s.totalRuns}</TableCell>
                  <TableCell>
                    {s.lastRun && (
                      <Button size="sm" variant="ghost" onClick={() => setSelectedRun(s.lastRun!)}>
                        Details
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {scenarios.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Noch keine Test-Runs. Klicke auf „Schnell-Test" um zu starten.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedRun} onOpenChange={() => setSelectedRun(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRun && <StatusIcon status={selectedRun.status} />}
              {selectedRun?.scenario_name}
            </DialogTitle>
          </DialogHeader>
          {selectedRun && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div><strong>Status:</strong> <Badge>{selectedRun.status}</Badge></div>
                  <div><strong>HTTP:</strong> {selectedRun.http_status || '-'}</div>
                  <div><strong>Latenz:</strong> {selectedRun.latency_ms}ms</div>
                  <div><strong>Trigger:</strong> {selectedRun.triggered_by}</div>
                </div>
                {selectedRun.error_message && (
                  <div>
                    <strong className="text-destructive">Error:</strong>
                    <pre className="bg-muted p-2 rounded text-xs whitespace-pre-wrap mt-1">{selectedRun.error_message}</pre>
                  </div>
                )}
                <div>
                  <strong>Request:</strong>
                  <pre className="bg-muted p-2 rounded text-xs overflow-auto mt-1">{JSON.stringify(selectedRun.full_request_json, null, 2)}</pre>
                </div>
                <div>
                  <strong>Response:</strong>
                  <pre className="bg-muted p-2 rounded text-xs overflow-auto mt-1">{JSON.stringify(selectedRun.full_response_json, null, 2)}</pre>
                </div>
                {(selectedRun.status === 'fail' || selectedRun.status === 'warning') && (
                  <div className="pt-2 border-t">
                    <Button
                      onClick={() => createBugReportFromRun(selectedRun)}
                      disabled={creatingBugReport}
                      variant="destructive"
                      size="sm"
                    >
                      {creatingBugReport ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
                      Als Bug-Report melden
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
