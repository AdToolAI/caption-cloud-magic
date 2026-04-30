import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Loader2,
  Play,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Layers,
} from "lucide-react";
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
} from "@/components/ui/alert-dialog";

interface DeepRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  cap_eur: number;
  total_cost_eur: number;
  flows_total: number;
  flows_succeeded: number;
  flows_failed: number;
  flows_skipped: number;
}

interface FlowResult {
  id: string;
  run_id: string;
  flow_index: number;
  flow_name: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  status: string;
  estimated_cost_eur: number;
  actual_cost_eur: number;
  output_url: string | null;
  error_message: string | null;
  stage_log: any;
  validation_checks: any;
}

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  timeout: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  running: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  pending: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  budget_skipped: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const STATUS_ICON: Record<string, any> = {
  success: CheckCircle2,
  failed: XCircle,
  timeout: Clock,
  budget_skipped: AlertCircle,
  pending: Loader2,
  running: Loader2,
};

const FLOW_NAMES = [
  "Composer Multi-Scene Stitch",
  "Director's Cut Lambda Render",
  "Auto-Director (Brief → Video)",
  "Talking Head (HeyGen)",
  "Universal Video Creator",
  "Magic Edit (FLUX Fill)",
];

export function DeepSweepTab() {
  const [latestRun, setLatestRun] = useState<DeepRun | null>(null);
  const [history, setHistory] = useState<DeepRun[]>([]);
  const [flows, setFlows] = useState<FlowResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: runs } = await supabase
      .from("qa_deep_sweep_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    const list = (runs as any) ?? [];
    setHistory(list);
    setLatestRun(list[0] ?? null);

    if (list[0]) {
      const { data: f } = await supabase
        .from("qa_deep_sweep_flow_results")
        .select("*")
        .eq("run_id", list[0].id)
        .order("flow_index", { ascending: true });
      setFlows((f as any) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Live polling while a run is active
    const interval = setInterval(() => {
      if (latestRun?.status === "running") load();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestRun?.status]);

  const startSweep = async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("qa-weekly-deep-sweep", {
        body: { cap_eur: 50 },
      });
      if (error) throw error;
      toast.success(`Deep Sweep gestartet (Run ID: ${(data as any)?.run_id?.slice(0, 8)})`);
      setTimeout(load, 1500);
    } catch (e: any) {
      toast.error(`Sweep failed: ${e?.message || String(e)}`);
    } finally {
      setStarting(false);
    }
  };

  const isRunning = latestRun?.status === "running";
  const runAgeMinutes = latestRun?.started_at
    ? (Date.now() - new Date(latestRun.started_at).getTime()) / 60000
    : 0;
  const isStale = isRunning && runAgeMinutes > 8;
  const [finalizing, setFinalizing] = useState(false);

  const finalizeStaleRun = async () => {
    if (!latestRun) return;
    setFinalizing(true);
    try {
      const { error } = await supabase.functions.invoke("qa-deep-sweep-finalize-stale", {
        body: { run_id: latestRun.id },
      });
      if (error) throw error;
      toast.success("Run als gescheitert markiert.");
      await load();
    } catch (e: any) {
      toast.error(`Finalize failed: ${e?.message ?? String(e)}`);
    } finally {
      setFinalizing(false);
    }
  };

  const [bootstrapping, setBootstrapping] = useState(false);
  const runBootstrap = async () => {
    setBootstrapping(true);
    try {
      const { error } = await supabase.functions.invoke("qa-live-sweep-bootstrap", {});
      if (error) throw error;
      toast.success("QA-Test-Assets aktualisiert. Beim nächsten Run sollte Magic Edit grün werden.");
    } catch (e: any) {
      toast.error(`Bootstrap failed: ${e?.message ?? String(e)}`);
    } finally {
      setBootstrapping(false);
    }
  };

  const passRate = latestRun && latestRun.flows_total > 0
    ? Math.round((latestRun.flows_succeeded / latestRun.flows_total) * 100)
    : 0;
  const budgetUsedPct = latestRun
    ? Math.round((Number(latestRun.total_cost_eur) / Number(latestRun.cap_eur)) * 100)
    : 0;

  return (
    <div className="space-y-4 mt-4">
      {/* Header */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/20 p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-5 w-5 text-[#F5C76A]" />
              <h3 className="text-lg font-semibold text-[#F5C76A]">Weekly Deep Sweep</h3>
              <Badge className="bg-[#F5C76A]/15 text-[#F5C76A] border-[#F5C76A]/40">
                Cap 50 €
              </Badge>
            </div>
            <p className="text-sm text-slate-400">
              6 echte End-to-End-Pipelines: Composer-Stitch, Director's Cut Lambda, Auto-Director,
              Talking Head (HeyGen), Universal Video, Magic Edit. ~8–12 € pro Voll-Run.
            </p>
            <p className="text-xs text-amber-400/80 mt-1">
              ⚠️ Vor dem ersten Run einmal in <strong>Live Sweep</strong> auf <em>"Bootstrap Assets"</em> klicken,
              damit Sample-Video, -Bild, -Audio, -Portrait (für HeyGen) und PNG-Mask im qa-test-assets Bucket liegen.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Reload
            </Button>
            {isStale && (
              <Button
                variant="destructive"
                size="sm"
                onClick={finalizeStaleRun}
                disabled={finalizing}
                title={`Run läuft seit ${Math.round(runAgeMinutes)} min — vermutlich hat das Edge-Function-Wall-Clock-Limit zugeschlagen.`}
              >
                {finalizing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-1" />
                )}
                Run abbrechen ({Math.round(runAgeMinutes)} min)
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90"
                  disabled={isRunning || starting}
                >
                  {starting || isRunning ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  {isRunning ? "Läuft..." : "Run Deep Sweep (50 €)"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deep Sweep mit echten Renders starten?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Diese Aktion löst <strong>echte bezahlte API-Calls</strong> aus
                    (Replicate, HeyGen, ElevenLabs, AWS Lambda). Erwarteter Verbrauch:
                    ~12 €. Hard-Cap: 50 €. Dauer: 10-12 Minuten.
                    <br /><br />
                    Hard-Lock: Max 1 Sweep alle 6h.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={startSweep}
                    className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90"
                  >
                    Sweep starten
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Live stats */}
        {latestRun && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <StatCard label="Status" value={latestRun.status} variant={latestRun.status} />
            <StatCard
              label="Pass Rate"
              value={`${latestRun.flows_succeeded}/${latestRun.flows_total} (${passRate}%)`}
            />
            <StatCard
              label="Verbraucht"
              value={`${Number(latestRun.total_cost_eur).toFixed(2)} € / ${Number(latestRun.cap_eur).toFixed(0)} €`}
            />
            <StatCard
              label="Skipped"
              value={`${latestRun.flows_skipped}`}
            />
          </div>
        )}
        {latestRun && (
          <Progress value={budgetUsedPct} className="mt-3 h-1.5" />
        )}
      </Card>

      {/* Live Flow Status */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10 p-4">
        <h4 className="text-sm font-semibold text-slate-300 mb-3">
          Aktueller Run — 7 Flows
        </h4>
        <div className="space-y-2">
          {FLOW_NAMES.map((name, idx) => {
            const flow = flows.find((f) => f.flow_index === idx + 1);
            const status = flow?.status ?? (isRunning ? "pending" : "—");
            const Icon = STATUS_ICON[status] ?? AlertCircle;
            return (
              <div
                key={idx}
                className="flex items-center gap-3 p-2.5 rounded-md bg-slate-900/40 border border-slate-700/30"
              >
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 text-slate-400 text-xs font-mono">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200 truncate">{name}</span>
                    {flow && (
                      <Badge
                        className={STATUS_STYLES[status] ?? STATUS_STYLES.pending}
                        title={
                          status === "timeout"
                            ? "Transientes Infrastruktur-Limit (z.B. AWS Lambda Concurrency) — kein Code-Bug. Wird beim nächsten Sweep i.d.R. automatisch grün."
                            : undefined
                        }
                      >
                        <Icon
                          className={`h-3 w-3 mr-1 ${status === "running" || status === "pending" && isRunning ? "animate-spin" : ""}`}
                        />
                        {status}
                      </Badge>
                    )}
                  </div>
                  {flow?.error_message && (
                    <p
                      className={`text-xs mt-0.5 truncate ${
                        status === "timeout" ? "text-amber-400/80" : "text-red-400/80"
                      }`}
                      title={flow.error_message}
                    >
                      {flow.error_message}
                    </p>
                  )}
                  {flow?.duration_ms && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {(flow.duration_ms / 1000).toFixed(1)}s · {Number(flow.actual_cost_eur).toFixed(2)} €
                    </p>
                  )}
                  {flow?.flow_index === 7 &&
                    flow?.status === "budget_skipped" &&
                    flow?.error_message?.includes("Bootstrap Assets") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1.5 h-7 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                        disabled={bootstrapping}
                        onClick={runBootstrap}
                      >
                        {bootstrapping ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3 mr-1" />
                        )}
                        Bootstrap jetzt ausführen
                      </Button>
                    )}
                </div>
                {flow?.output_url && (
                  <a
                    href={flow.output_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    Output <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* History */}
      {history.length > 1 && (
        <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10 p-4">
          <h4 className="text-sm font-semibold text-slate-300 mb-3">Letzte 10 Runs</h4>
          <div className="space-y-1.5">
            {history.slice(1).map((r) => {
              const pr = r.flows_total > 0
                ? Math.round((r.flows_succeeded / r.flows_total) * 100)
                : 0;
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md bg-slate-900/40 text-sm"
                >
                  <span className="text-slate-400 font-mono text-xs">{r.id.slice(0, 8)}</span>
                  <Badge className={STATUS_STYLES[r.status] ?? STATUS_STYLES.pending}>
                    {r.status}
                  </Badge>
                  <span className="text-slate-300">
                    {r.flows_succeeded}/{r.flows_total} ({pr}%)
                  </span>
                  <span className="text-slate-400 ml-auto">
                    {Number(r.total_cost_eur).toFixed(2)} €
                  </span>
                  <span className="text-slate-500 text-xs">
                    {new Date(r.started_at).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string | number;
  variant?: string;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-700/40 rounded-md p-3">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p
        className={`text-base font-semibold mt-1 ${
          variant === "success" || variant === "completed"
            ? "text-emerald-300"
            : variant === "failed"
            ? "text-red-300"
            : variant === "running"
            ? "text-cyan-300"
            : "text-slate-200"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
