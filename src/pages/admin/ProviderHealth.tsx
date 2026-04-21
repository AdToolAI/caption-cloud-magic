import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Activity, AlertTriangle, CheckCircle2, Cpu, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRoles } from '@/hooks/useUserRoles';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ProviderRow {
  provider: string;
  label: string;
  used: number;
  limit: number;
  percent: number;
  avgResponseMs?: number;
  unit: string;
}

const PROVIDER_LIMITS: Record<string, { label: string; limit: number; unit: string }> = {
  replicate:    { label: 'Replicate',         limit: 600,  unit: 'req/min' },
  gemini:       { label: 'Gemini',            limit: 1000, unit: 'req/min' },
  elevenlabs:   { label: 'ElevenLabs',        limit: 60,   unit: 'req/min' },
  openai:       { label: 'OpenAI',            limit: 500,  unit: 'req/min' },
  'lovable-ai': { label: 'Lovable AI',        limit: 1000, unit: 'req/min' },
};

function statusFromPercent(p: number) {
  if (p >= 90) return { color: 'bg-destructive', text: 'text-destructive', label: 'Critical', icon: AlertTriangle };
  if (p >= 80) return { color: 'bg-yellow-500', text: 'text-yellow-600', label: 'Warning', icon: AlertTriangle };
  if (p >= 50) return { color: 'bg-blue-500', text: 'text-blue-600', label: 'Active', icon: Activity };
  return { color: 'bg-green-500', text: 'text-green-600', label: 'Healthy', icon: CheckCircle2 };
}

export const ProviderHealth = () => {
  const { isAdmin } = useUserRoles();
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [lambdaInfo, setLambdaInfo] = useState<{ active: number; max: number; safe: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [killing, setKilling] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const load = async () => {
    try {
      // Fetch quota aggregation
      const { data: quotaStats } = await supabase
        .from('provider_quota_stats_recent' as any)
        .select('*');

      const built: ProviderRow[] = Object.entries(PROVIDER_LIMITS).map(([key, cfg]) => {
        const stat: any = (quotaStats ?? []).find((s: any) => s.provider === key);
        const used = stat?.requests_last_minute ?? 0;
        const percent = Math.min(100, Math.round((used / cfg.limit) * 100));
        return {
          provider: key,
          label: cfg.label,
          used,
          limit: cfg.limit,
          percent,
          avgResponseMs: stat?.avg_response_time_ms ?? undefined,
          unit: cfg.unit,
        };
      });

      // Lambda capacity (read both NORMAL + SAFE so the UI stays in sync with future phase changes)
      const [{ data: cfgRows }, { count: activeRenders }] = await Promise.all([
        supabase.from('system_config').select('key, value').in('key', ['lambda_max_concurrent', 'lambda_max_concurrent_safe']),
        supabase.from('render_queue').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
      ]);
      const cfgMap: Record<string, any> = {};
      (cfgRows ?? []).forEach((r: any) => { cfgMap[r.key] = r.value; });
      const max = Number(cfgMap.lambda_max_concurrent ?? 25);
      const safe = Number(cfgMap.lambda_max_concurrent_safe ?? 15);
      setLambdaInfo({ active: activeRenders ?? 0, max, safe });

      setRows(built);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('ProviderHealth load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleKillSwitch = async () => {
    setKilling(true);
    try {
      const { error } = await supabase
        .from('system_config')
        .update({ value: 10, updated_at: new Date().toISOString() })
        .eq('key', 'lambda_max_concurrent');
      if (error) throw error;
      toast.success('Kill-Switch aktiviert: lambda_max_concurrent = 10');
      await load();
    } catch (e: any) {
      toast.error(`Kill-Switch fehlgeschlagen: ${e?.message ?? 'unbekannt'}`);
    } finally {
      setKilling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Provider Health</h2>
          <p className="text-sm text-muted-foreground">
            Live-Auslastung externer Anbieter • Stand: {lastUpdate.toLocaleTimeString('de-DE')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={killing} className="gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Notfall: Lambda auf 10 zurück
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Kill-Switch aktivieren?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Setzt <code className="font-mono">lambda_max_concurrent</code> sofort auf <strong>10</strong>.
                    Neue Renders werden stark gedrosselt — laufende Jobs nicht abgebrochen.
                    Nutzen nur im Notfall (z. B. AWS-Throttling, Massenfehler).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleKillSwitch}>
                    Ja, drosseln auf 10
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          const status = statusFromPercent(row.percent);
          const StatusIcon = status.icon;
          return (
            <Card key={row.provider}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${status.color}`} />
                    {row.label}
                  </CardTitle>
                  <Badge variant={row.percent >= 80 ? 'destructive' : 'secondary'} className="gap-1">
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {row.used} / {row.limit} {row.unit}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Progress value={row.percent} className="h-2" />
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span className={`font-medium ${status.text}`}>{row.percent}%</span>
                  {row.avgResponseMs !== undefined && (
                    <span>⏱ {row.avgResponseMs}ms</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* AWS Lambda Capacity */}
        {lambdaInfo && (() => {
          const percent = Math.round((lambdaInfo.active / lambdaInfo.max) * 100);
          const status = statusFromPercent(percent);
          const StatusIcon = status.icon;
          return (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${status.color}`} />
                    <Cpu className="w-4 h-4" />
                    AWS Lambda
                  </CardTitle>
                  <Badge variant={percent >= 80 ? 'destructive' : 'secondary'} className="gap-1">
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {lambdaInfo.active} / {lambdaInfo.max} parallele Renders
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Progress value={percent} className="h-2" />
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span className={`font-medium ${status.text}`}>{percent}%</span>
                  <span>Circuit Breaker aktiv</span>
                </div>
              </CardContent>
            </Card>
          );
        })()}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wie funktioniert das?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Jeder API-Call wird in <code className="text-xs bg-muted px-1 py-0.5 rounded">provider_quota_log</code> erfasst.</p>
          <p>• Aggregation läuft jede Minute, Anzeige aktualisiert alle 30 Sekunden.</p>
          <p>• Bei <strong>≥80% Auslastung</strong> wird automatisch eine E-Mail-Warnung an Admins gesendet (Cooldown 60 Min).</p>
          <p>• Lambda-Concurrency wird vom <strong>Circuit Breaker</strong> automatisch zwischen <strong>{lambdaInfo?.safe ?? 15}</strong> (Safe) und <strong>{lambdaInfo?.max ?? 25}</strong> (Normal) angepasst.</p>
          <p>• <strong>Kill-Switch</strong> (oben rechts, nur Admin): drosselt im Notfall sofort auf <strong>10</strong> parallele Renders.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProviderHealth;
