import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Activity, Loader2, Play, AlertTriangle, CheckCircle2, ShieldCheck, ExternalLink, Bell } from "lucide-react";

function ageSec(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 1000;
}

function HealthLamp({ ok, warn, label, sublabel }: { ok: boolean; warn?: boolean; label: string; sublabel?: string }) {
  const color = !ok ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]" : warn ? "bg-amber-400 shadow-[0_0_12px_rgba(245,191,66,0.6)]" : "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]";
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0A0F1F]/60 border border-[#F5C76A]/10">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-mono text-[#F5C76A] truncate">{label}</div>
        {sublabel && <div className="text-[11px] text-muted-foreground truncate">{sublabel}</div>}
      </div>
    </div>
  );
}

export function WatchdogTab() {
  const queryClient = useQueryClient();

  const heartbeats = useQuery({
    queryKey: ["cron-heartbeats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cron_heartbeats")
        .select("*")
        .order("job_name");
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const runs = useQuery({
    queryKey: ["qa-watchdog-runs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("qa_watchdog_runs")
        .select("*")
        .order("ran_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const trigger = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("qa-watchdog", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        `Watchdog: ${data?.anomalies_found ?? 0} Anomalien · ${data?.bugs_created ?? 0} Bugs · ${data?.rows_auto_failed ?? 0} Zeilen auto-failed`
      );
      queryClient.invalidateQueries({ queryKey: ["qa-watchdog-runs"] });
      queryClient.invalidateQueries({ queryKey: ["qa-bugs"] });
      queryClient.invalidateQueries({ queryKey: ["cron-heartbeats"] });
    },
    onError: (e: any) => toast.error(`Watchdog-Fehler: ${e?.message ?? String(e)}`),
  });

  const lastRun = runs.data?.[0];
  const totalAnomalies = (runs.data ?? []).reduce((s: number, r: any) => s + (r.anomalies_found ?? 0), 0);

  return (
    <div className="space-y-6 mt-4">
      {/* Header */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/20">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-[#F5C76A]">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Watchdog · Silent-Death Detection
            </span>
            <Button
              size="sm"
              onClick={() => trigger.mutate()}
              disabled={trigger.isPending}
              className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90"
            >
              {trigger.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Jetzt prüfen
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Läuft alle 2 Minuten via Cron. Erkennt hängende Provider-Tests, eingefrorene Autopilot-Slots, stille Lambda-Renders und Provider-Outages — bevor du es merkst.
          </p>
          {lastRun && (
            <div className="flex gap-4 text-xs text-muted-foreground pt-2">
              <span>Letzter Lauf: {formatDistanceToNow(new Date(lastRun.ran_at), { addSuffix: true })}</span>
              <span>Dauer: {lastRun.duration_ms ?? "?"}ms</span>
              <span>50-Run-Summe: {totalAnomalies} Anomalien</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Heartbeats */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
        <CardHeader>
          <CardTitle className="text-[#F5C76A] text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Cron-Heartbeats
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(heartbeats.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Heartbeats erfasst. Jobs schreiben den ersten Eintrag nach ihrem nächsten Lauf.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {(heartbeats.data ?? []).map((hb: any) => {
                const age = ageSec(hb.last_run_at);
                const tolerance = (hb.expected_interval_seconds ?? 300) * 2;
                const stale = age > tolerance;
                const failing = (hb.consecutive_failures ?? 0) >= 1;
                const sub = stale
                  ? `STALE · zuletzt vor ${Math.round(age)}s (Limit ${tolerance}s)`
                  : `vor ${Math.round(age)}s · alle ${hb.expected_interval_seconds}s${
                      failing ? ` · ${hb.consecutive_failures}× failed` : ""
                    }`;
                return (
                  <HealthLamp
                    key={hb.job_name}
                    ok={!stale && !failing}
                    warn={!stale && failing}
                    label={hb.job_name}
                    sublabel={sub}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent runs */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
        <CardHeader>
          <CardTitle className="text-[#F5C76A] text-base">Letzte 50 Watchdog-Läufe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(runs.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Läufe.</p>
          )}
          {(runs.data ?? []).map((r: any) => {
            const summary = r.summary ?? {};
            const list: any[] = Array.isArray(summary.anomalies) ? summary.anomalies : [];
            const anomalyCount = r.anomalies_found ?? 0;
            return (
              <div
                key={r.id}
                className="p-3 rounded border border-[#F5C76A]/10 bg-black/30 flex items-start gap-3"
              >
                {anomalyCount === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-[#F5C76A] font-mono">
                      {formatDistanceToNow(new Date(r.ran_at), { addSuffix: true })}
                    </span>
                    <Badge variant="outline" className="border-[#F5C76A]/30">
                      {r.duration_ms ?? "?"}ms
                    </Badge>
                    {anomalyCount > 0 && (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">
                        {anomalyCount} Anomalie{anomalyCount === 1 ? "" : "n"}
                      </Badge>
                    )}
                    {r.bugs_created > 0 && (
                      <Badge className="bg-red-500/20 text-red-300 border-red-500/40">
                        {r.bugs_created} Bug{r.bugs_created === 1 ? "" : "s"} erstellt
                      </Badge>
                    )}
                    {r.rows_auto_failed > 0 && (
                      <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/40">
                        {r.rows_auto_failed} Zeile{r.rows_auto_failed === 1 ? "" : "n"} auto-failed
                      </Badge>
                    )}
                  </div>
                  {list.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                      {list.slice(0, 5).map((a: any, i: number) => (
                        <li key={i} className="truncate">
                          • <span className="text-amber-300/80">[{a.kind}]</span> {a.title}
                        </li>
                      ))}
                      {list.length > 5 && <li>… +{list.length - 5} weitere</li>}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
