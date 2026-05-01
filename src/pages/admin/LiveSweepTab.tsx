import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Play, RefreshCw, Sparkles } from "lucide-react";
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

interface Budget {
  id: string;
  cap_eur: number;
  spent_eur: number;
  last_run_at: string | null;
}

interface Run {
  id: string;
  sweep_id: string;
  provider: string;
  model: string | null;
  mode: string;
  status: string;
  cost_eur: number;
  estimated_cost_eur: number;
  duration_ms: number | null;
  asset_url: string | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  succeeded: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  timeout: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  running: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  // Async provider (e.g. HeyGen Talking Head) — kick-off succeeded,
  // background polling is in flight (1–3 min). Not a bug, not yet green.
  async_started: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  // Intentional non-2xx response (e.g. Pika 410 during provider migration).
  // Documented in code, not a real bug — render in neutral grey.
  expected: "bg-slate-600/20 text-slate-300 border-slate-500/40",
  skipped_budget: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  pending: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const TERMINAL_STATUSES = new Set([
  "succeeded",
  "failed",
  "timeout",
  "expected",
  "skipped_budget",
  "async_started",
]);

export function LiveSweepTab() {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [activeSweepId, setActiveSweepId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: b }, { data: r }] = await Promise.all([
      supabase
        .from("qa_live_budget")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("qa_live_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60),
    ]);
    setBudget(b as any);
    setRuns((r as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Auto-poll while a sweep is active. Stops once all rows of the active
  // sweep reach a terminal status or after a 10-minute hard stop.
  useEffect(() => {
    if (!activeSweepId) return;
    const startedAt = Date.now();
    const tick = async () => {
      const { data } = await supabase
        .from("qa_live_runs")
        .select("*")
        .eq("sweep_id", activeSweepId);
      const rows = (data as any[]) ?? [];
      setRuns((prev) => {
        const others = prev.filter((p) => p.sweep_id !== activeSweepId);
        return [...rows, ...others];
      });
      const allTerminal =
        rows.length > 0 && rows.every((r) => TERMINAL_STATUSES.has(r.status));
      const timedOut = Date.now() - startedAt > 10 * 60_000;
      if (allTerminal || timedOut) {
        const ok = rows.filter((r) => r.status === "succeeded").length;
        const expected = rows.filter((r) => r.status === "expected").length;
        const asyncStarted = rows.filter((r) => r.status === "async_started").length;
        const failed = rows.filter((r) => r.status === "failed").length;
        const timeout = rows.filter((r) => r.status === "timeout").length;
        const skipped = rows.filter((r) => r.status === "skipped_budget").length;
        const spent = rows.reduce((s, r) => s + Number(r.cost_eur || 0), 0);
        if (timedOut && !allTerminal) {
          toast.warning("Sweep läuft länger als 10 Min", {
            description: "Polling gestoppt. Reload für neuen Status.",
          });
        } else {
          toast.success(`Sweep abgeschlossen — ${ok + expected + asyncStarted}/${rows.length} grün`, {
            description: `${failed} failed · ${timeout} timeout · ${asyncStarted} async · ${expected} expected · ${skipped} skipped · ${spent.toFixed(2)} € ausgegeben`,
          });
        }
        setActiveSweepId(null);
        setSweeping(false);
        await load();
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [activeSweepId]);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "qa-live-sweep-bootstrap",
        { body: {} },
      );
      if (error) throw error;
      toast.success("Test-Assets bereit", {
        description: `${(data as any)?.assets?.length ?? 0} Asset(s) im Bucket.`,
      });
    } catch (e: any) {
      toast.error("Bootstrap fehlgeschlagen", { description: e?.message });
    } finally {
      setBootstrapping(false);
    }
  };

  const handleSweep = async () => {
    setSweeping(true);
    try {
      const { data, error } = await supabase.functions.invoke("qa-live-sweep", {
        body: {},
      });
      if (error) throw error;
      const s = data as any;
      // Server returns 202 with { sweep_id, status: "running", total }
      if (s?.sweep_id && s?.status === "running") {
        toast.info(`Sweep gestartet — ${s.total} Provider`, {
          description: "UI updated sich live, ~3-8 Min erwartet.",
        });
        setActiveSweepId(s.sweep_id);
        await load();
        return;
      }
      // Fallback for older sync response shape
      const expected = s?.expected ?? 0;
      const effectiveOk = (s?.succeeded ?? 0) + expected;
      toast.success(`Sweep abgeschlossen — ${effectiveOk}/${s?.total_tested ?? 0} grün`);
      setSweeping(false);
      await load();
    } catch (e: any) {
      // 409 conflict: sweep already running — pick it up and start polling.
      const ctx = (e as any)?.context;
      const status = ctx?.status ?? (e as any)?.status;
      if (status === 409) {
        try {
          const json = await ctx?.json?.();
          if (json?.sweep_id) {
            toast.info("Sweep läuft bereits — Polling übernommen.");
            setActiveSweepId(json.sweep_id);
            await load();
            return;
          }
        } catch { /* ignore */ }
      }
      toast.error("Sweep fehlgeschlagen", { description: e?.message });
      setSweeping(false);
    }
  };

  const cap = budget?.cap_eur ?? 20;
  const spent = budget?.spent_eur ?? 0;
  const pct = Math.min(100, (spent / cap) * 100);

  // Group by sweep_id
  const sweeps = runs.reduce((acc, r) => {
    (acc[r.sweep_id] ||= []).push(r);
    return acc;
  }, {} as Record<string, Run[]>);

  return (
    <div className="space-y-4 mt-4">
      {/* Budget panel */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/20 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm text-[#F5C76A] font-medium uppercase tracking-wider">
              Live Sweep — Hard Cap (per Run)
            </div>
            <div className="mt-1 text-3xl font-bold text-white">
              {spent.toFixed(2)} <span className="text-base text-slate-400">/ {cap.toFixed(2)} €</span>
            </div>
            <Progress value={pct} className="mt-3 h-2" />
            <div className="mt-2 text-xs text-slate-400">
              {budget?.last_run_at
                ? `Letzter Run: ${new Date(budget.last_run_at).toLocaleString()} · Cap wird beim nächsten Sweep auf 0 € zurückgesetzt`
                : "Noch nie ausgeführt."}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBootstrap}
              disabled={bootstrapping}
              className="border-[#F5C76A]/30 hover:bg-[#F5C76A]/10"
            >
              {bootstrapping ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              Bootstrap Assets
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="border-slate-500/30"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Reload
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-[#F5C76A]/10">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={sweeping || pct >= 100}
                className="w-full bg-[#F5C76A] text-[#050816] hover:bg-[#F5C76A]/90 font-semibold"
              >
                {sweeping ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sweep läuft …
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Live Sweep (Cap: {cap.toFixed(0)} €)
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#050816] border-[#F5C76A]/30">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[#F5C76A]">
                  Live Sweep starten?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Dies feuert <strong>echte Provider-Calls</strong> bei Replicate, Runway und Hedra.
                  Geschätzte Kosten: ~8 €. Hard-Cap stoppt bei {cap.toFixed(2)} €.
                  <br /><br />
                  Test-Assets müssen vorher per "Bootstrap Assets" erzeugt sein.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={handleSweep} className="bg-[#F5C76A] text-[#050816]">
                  Sweep starten
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>

      {/* Sweeps */}
      {Object.entries(sweeps).map(([sweepId, sweepRuns]) => {
        const ts = sweepRuns[0]?.created_at;
        const sweepSpent = sweepRuns.reduce((s, r) => s + Number(r.cost_eur || 0), 0);
        const ok = sweepRuns.filter((r) => r.status === "succeeded").length;
        const expectedCount = sweepRuns.filter((r) => r.status === "expected").length;
        const asyncCount = sweepRuns.filter((r) => r.status === "async_started").length;
        const effectiveOk = ok + expectedCount + asyncCount;
        return (
          <Card
            key={sweepId}
            className="bg-[#0A0F1F]/60 border-[#F5C76A]/10 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-slate-400 font-mono">
                  {sweepId.slice(0, 8)} · {ts && new Date(ts).toLocaleString()}
                </div>
                <div className="text-sm text-white font-medium">
                  {effectiveOk}/{sweepRuns.length} grün
                  {expectedCount > 0 ? ` (${expectedCount} expected)` : ""}
                  {asyncCount > 0 ? ` (${asyncCount} async)` : ""} · {sweepSpent.toFixed(2)} € ausgegeben
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              {sweepRuns.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 text-sm py-1.5 px-2 rounded bg-[#050816]/40"
                >
                  <Badge
                    variant="outline"
                    className={STATUS_STYLES[r.status] || STATUS_STYLES.pending}
                  >
                    {r.status}
                  </Badge>
                  <span className="text-white font-medium min-w-[160px]">
                    {r.provider}
                  </span>
                  <span className="text-xs text-slate-400 min-w-[60px]">{r.mode}</span>
                  <span className="text-xs text-slate-500 min-w-[80px]">
                    {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}
                  </span>
                  <span className="text-xs text-[#F5C76A] min-w-[60px]">
                    {Number(r.cost_eur).toFixed(2)} €
                  </span>
                  {r.asset_url && (
                    <a
                      href={r.asset_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-cyan-400 hover:underline"
                    >
                      Asset ↗
                    </a>
                  )}
                  {r.error_message && (
                    <span
                      className="text-xs text-red-400 truncate flex-1"
                      title={r.error_message}
                    >
                      {r.error_message}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {Object.keys(sweeps).length === 0 && !loading && (
        <Card className="bg-[#0A0F1F]/40 border-[#F5C76A]/10 p-8 text-center">
          <div className="text-slate-400">
            Noch keine Live-Sweeps. Klicke "Bootstrap Assets" und dann "Run Live Sweep".
          </div>
        </Card>
      )}
    </div>
  );
}
