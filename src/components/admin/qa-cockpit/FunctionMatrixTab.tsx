// Function Smoke Matrix — Cockpit Tab
//
// 1-click "Run Sweep" über alle in SMOKE_REGISTRY hinterlegten Edge-Functions.
// Jede Function wird via `x-qa-mock: true` aufgerufen, damit KEINE externen
// Kosten entstehen. Ergebnisse werden in `qa_smoke_runs` + `qa_smoke_sweeps`
// persistiert und live als Ampel-Grid angezeigt.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Play, CheckCircle2, XCircle, MinusCircle, Clock, RotateCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type SmokeStatus = "pass" | "fail" | "skip" | "timeout";

interface SmokeRun {
  id: string;
  sweep_id: string;
  function_name: string;
  category: string;
  status: SmokeStatus;
  status_code: number | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

interface SmokeSweep {
  id: string;
  started_at: string;
  finished_at: string | null;
  source: string;
  category_filter: string | null;
  total: number;
  pass_count: number;
  fail_count: number;
  skip_count: number;
  timeout_count: number;
  duration_ms: number | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  "ai-video-providers": "AI Video Providers",
  "lipsync-dialog": "Lipsync & Dialog",
  "briefing-composer": "Briefing & Composer",
  "picture-image": "Picture / Image",
  "audio-music-sfx": "Audio / Music / SFX",
  "social-publishing": "Social Publishing",
  "billing-credits": "Billing / Credits",
  "admin-cron": "Admin / Cron / Health",
  "analytics-reports": "Analytics / Reports",
  "misc": "Misc",
};

const STATUS_STYLES: Record<SmokeStatus, { bg: string; icon: typeof CheckCircle2; label: string }> = {
  pass: { bg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40", icon: CheckCircle2, label: "Pass" },
  fail: { bg: "bg-red-500/15 text-red-300 border-red-500/40", icon: XCircle, label: "Fail" },
  skip: { bg: "bg-slate-500/15 text-slate-300 border-slate-500/40", icon: MinusCircle, label: "Skip" },
  timeout: { bg: "bg-amber-500/15 text-amber-300 border-amber-500/40", icon: Clock, label: "Timeout" },
};

export function FunctionMatrixTab() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedSweepId, setSelectedSweepId] = useState<string | null>(null);

  const sweeps = useQuery({
    queryKey: ["qa-smoke-sweeps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qa_smoke_sweeps")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as SmokeSweep[];
    },
    refetchInterval: 4000,
  });

  const activeSweepId = selectedSweepId ?? sweeps.data?.[0]?.id ?? null;

  const runs = useQuery({
    queryKey: ["qa-smoke-runs", activeSweepId],
    enabled: !!activeSweepId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qa_smoke_runs")
        .select("*")
        .eq("sweep_id", activeSweepId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SmokeRun[];
    },
    refetchInterval: running ? 2000 : 8000,
  });

  const runSweep = useMutation({
    mutationFn: async () => {
      setRunning(true);
      const { data, error } = await supabase.functions.invoke("smoke-matrix-run", {
        body: {
          source: "cockpit",
          category: categoryFilter === "all" ? undefined : categoryFilter,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Sweep fertig: ${data?.pass ?? 0} ✅ / ${data?.fail ?? 0} ❌ / ${data?.timeout ?? 0} ⏱`);
      setSelectedSweepId(data?.sweep_id ?? null);
      qc.invalidateQueries({ queryKey: ["qa-smoke-sweeps"] });
      qc.invalidateQueries({ queryKey: ["qa-smoke-runs"] });
    },
    onError: (err: any) => toast.error(`Sweep fehlgeschlagen: ${err?.message ?? err}`),
    onSettled: () => setRunning(false),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, SmokeRun[]>();
    (runs.data ?? []).forEach((r) => {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [runs.data]);

  const totals = useMemo(() => {
    const list = runs.data ?? [];
    return {
      total: list.length,
      pass: list.filter((r) => r.status === "pass").length,
      fail: list.filter((r) => r.status === "fail").length,
      skip: list.filter((r) => r.status === "skip").length,
      timeout: list.filter((r) => r.status === "timeout").length,
    };
  }, [runs.data]);

  const categories = useMemo(
    () => Array.from(new Set(Object.keys(CATEGORY_LABELS))),
    [],
  );

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">Function Smoke Matrix</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Ruft alle registrierten Edge-Functions im Mock-Modus auf (kostenlos). Block 1 deckt aktuell{" "}
                <span className="font-semibold text-foreground">eine kuratierte Auswahl</span> ab — wird wellenweise erweitert.
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <Select value={categoryFilter} onValueChange={setCategoryFilter} disabled={running}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Kategorien</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => runSweep.mutate()} disabled={running} size="sm">
                {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                Sweep starten
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  qc.invalidateQueries({ queryKey: ["qa-smoke-sweeps"] });
                  qc.invalidateQueries({ queryKey: ["qa-smoke-runs"] });
                }}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Totals strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Stat label="Total" value={totals.total} color="text-foreground" />
            <Stat label="Pass" value={totals.pass} color="text-emerald-400" />
            <Stat label="Fail" value={totals.fail} color="text-red-400" />
            <Stat label="Timeout" value={totals.timeout} color="text-amber-400" />
            <Stat label="Skip" value={totals.skip} color="text-slate-400" />
          </div>

          {/* Sweep history selector */}
          {(sweeps.data ?? []).length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {(sweeps.data ?? []).slice(0, 8).map((s) => {
                const isActive = s.id === activeSweepId;
                const done = !!s.finished_at;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSweepId(s.id)}
                    className={`text-xs px-2 py-1 rounded border transition ${
                      isActive
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-accent text-muted-foreground"
                    }`}
                  >
                    {done ? "✓" : <Loader2 className="h-3 w-3 inline animate-spin" />}{" "}
                    {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })} · {s.pass_count}/{s.total}
                  </button>
                );
              })}
            </div>
          )}

          {/* Matrix */}
          {!activeSweepId && (
            <div className="text-sm text-muted-foreground py-12 text-center border border-dashed rounded">
              Noch kein Sweep gelaufen. Klick auf <span className="font-semibold">„Sweep starten"</span>.
            </div>
          )}

          {grouped.map(([category, list]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-sm font-semibold">{CATEGORY_LABELS[category] ?? category}</h4>
                <Badge variant="outline" className="text-xs">{list.length}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {list.map((r) => {
                  const meta = STATUS_STYLES[r.status];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={r.id}
                      className={`border rounded px-2 py-2 flex flex-col gap-1 ${meta.bg}`}
                      title={r.error ?? ""}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono truncate">{r.function_name}</span>
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                      </div>
                      <div className="flex items-center justify-between text-[10px] opacity-80">
                        <span>{meta.label}{r.status_code ? ` · ${r.status_code}` : ""}</span>
                        <span>{r.duration_ms ?? 0}ms</span>
                      </div>
                      {r.error && (
                        <div className="text-[10px] opacity-70 truncate">{r.error}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border rounded p-2 bg-card">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
