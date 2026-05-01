import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProbeRun {
  id: string;
  probe_name: string;
  status: "pass" | "fail" | "degraded";
  latency_ms: number;
  threshold_ms: number | null;
  error_message: string | null;
  run_at: string;
}

interface ProbeSummary {
  name: string;
  latest: ProbeRun | null;
  recent: ProbeRun[];
  uptime24h: number; // 0-100
  avgLatency24h: number;
  failures24h: number;
}

const PROBE_LABELS: Record<string, string> = {
  landing_page: "Landing Page (useadtool.ai)",
  auth_endpoint: "Auth Service",
  db_read_latency: "Database Read Latency",
  storage_endpoint: "Storage API",
  "edge_check-subscription": "Edge: check-subscription",
  "edge_generate-caption": "Edge: generate-caption",
};

function statusIcon(status: ProbeRun["status"] | undefined) {
  if (status === "pass") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === "degraded") return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  if (status === "fail") return <XCircle className="w-4 h-4 text-red-400" />;
  return <Activity className="w-4 h-4 text-muted-foreground" />;
}

function statusBadge(status: ProbeRun["status"] | undefined) {
  if (status === "pass") {
    return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">healthy</Badge>;
  }
  if (status === "degraded") {
    return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">degraded</Badge>;
  }
  if (status === "fail") {
    return <Badge className="bg-red-500/20 text-red-300 border-red-500/40">failed</Badge>;
  }
  return <Badge variant="outline">unknown</Badge>;
}

export function ProbesTab() {
  const [summaries, setSummaries] = useState<ProbeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("synthetic_probe_runs")
      .select("*")
      .gte("run_at", since)
      .order("run_at", { ascending: false });

    if (error) {
      console.error("[ProbesTab] load failed:", error);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as ProbeRun[];
    const grouped = new Map<string, ProbeRun[]>();
    for (const r of rows) {
      const arr = grouped.get(r.probe_name) ?? [];
      arr.push(r);
      grouped.set(r.probe_name, arr);
    }

    const allNames = Object.keys(PROBE_LABELS);
    for (const n of grouped.keys()) {
      if (!allNames.includes(n)) allNames.push(n);
    }

    const result: ProbeSummary[] = allNames.map((name) => {
      const recent = grouped.get(name) ?? [];
      const passed = recent.filter((r) => r.status === "pass").length;
      const failed = recent.filter((r) => r.status === "fail").length;
      const total = recent.length || 1;
      const avg = recent.length
        ? Math.round(recent.reduce((a, b) => a + b.latency_ms, 0) / recent.length)
        : 0;
      return {
        name,
        latest: recent[0] ?? null,
        recent: recent.slice(0, 60),
        uptime24h: Math.round((passed / total) * 1000) / 10,
        avgLatency24h: avg,
        failures24h: failed,
      };
    });

    setSummaries(result);
    setLastUpdated(new Date());
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const triggerNow = async () => {
    setTriggering(true);
    try {
      await supabase.functions.invoke("synthetic-probe", { body: {} });
      setTimeout(load, 1500);
    } catch (e) {
      console.error("Trigger failed:", e);
    } finally {
      setTriggering(false);
    }
  };

  const totalFailures = summaries.reduce((a, s) => a + s.failures24h, 0);
  const overallHealthy = summaries.every((s) => s.latest?.status === "pass");

  return (
    <div className="space-y-4 mt-4">
      {/* Header */}
      <Card className="p-4 bg-gradient-to-br from-[#0a0e1a] to-[#050816] border-[#F5C76A]/20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#F5C76A]" />
              <h3 className="text-lg font-semibold text-[#F5C76A]">Synthetic Probes — Layer 3</h3>
              {overallHealthy ? (
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                  All systems operational
                </Badge>
              ) : (
                <Badge className="bg-red-500/20 text-red-300 border-red-500/40">
                  {totalFailures} failure{totalFailures === 1 ? "" : "s"} in 24h
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              External health checks every 5 min. Detects frontend / DNS / DB-latency / cold-start issues
              before users notice.
            </p>
            {lastUpdated && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Last refresh: {formatDistanceToNow(lastUpdated, { addSuffix: true })}
              </p>
            )}
          </div>
          <Button
            onClick={triggerNow}
            disabled={triggering}
            variant="outline"
            size="sm"
            className="border-[#F5C76A]/40"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${triggering ? "animate-spin" : ""}`} />
            Run probes now
          </Button>
        </div>
      </Card>

      {/* Probe rows */}
      {loading && summaries.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Loading probe history…</Card>
      ) : summaries.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No probe runs yet. The first run happens automatically within 5 minutes, or click "Run probes now".
        </Card>
      ) : (
        <div className="grid gap-3">
          {summaries.map((s) => (
            <Card key={s.name} className="p-4 bg-[#0a0e1a]/60 border-white/5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {statusIcon(s.latest?.status)}
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {PROBE_LABELS[s.name] ?? s.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.latest
                        ? `${s.latest.latency_ms}ms · threshold ${s.latest.threshold_ms ?? "?"}ms · ${formatDistanceToNow(new Date(s.latest.run_at), { addSuffix: true })}`
                        : "no data yet"}
                    </div>
                    {s.latest?.error_message && (
                      <div className="text-xs text-red-400 mt-1 truncate max-w-xl">
                        ⚠ {s.latest.error_message}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-right">
                    <div className="text-muted-foreground">Uptime 24h</div>
                    <div
                      className={
                        s.uptime24h >= 99
                          ? "text-emerald-300 font-semibold"
                          : s.uptime24h >= 95
                          ? "text-amber-300 font-semibold"
                          : "text-red-300 font-semibold"
                      }
                    >
                      {s.uptime24h}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground">Avg latency</div>
                    <div className="font-mono">{s.avgLatency24h}ms</div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground">Runs 24h</div>
                    <div className="font-mono">{s.recent.length}</div>
                  </div>
                  {statusBadge(s.latest?.status)}
                </div>
              </div>

              {/* Sparkline of last 60 runs */}
              {s.recent.length > 1 && (
                <div className="mt-3 flex items-end gap-[2px] h-6">
                  {[...s.recent].reverse().map((r) => {
                    const color =
                      r.status === "pass"
                        ? "bg-emerald-500/70"
                        : r.status === "degraded"
                        ? "bg-amber-500/70"
                        : "bg-red-500/70";
                    const heightPct = Math.min(
                      100,
                      Math.max(10, (r.latency_ms / Math.max(1, r.threshold_ms ?? 1000)) * 100),
                    );
                    return (
                      <div
                        key={r.id}
                        className={`flex-1 ${color} rounded-sm`}
                        style={{ height: `${heightPct}%`, minHeight: "2px" }}
                        title={`${r.status} · ${r.latency_ms}ms · ${new Date(r.run_at).toLocaleTimeString()}`}
                      />
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
