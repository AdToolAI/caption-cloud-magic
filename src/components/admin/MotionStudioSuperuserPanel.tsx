import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Film,
  Sparkles,
  Wand2,
  Palette,
  Crop,
  Server,
  Download,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

const MODULE = "motion-studio";

interface Run {
  id: string;
  scenario_name: string;
  status: "pass" | "fail" | "warning" | "running";
  latency_ms: number | null;
  error_message: string | null;
  render_url: string | null;
  http_status: number | null;
  started_at: string;
  completed_at: string | null;
}

const PIPELINE_STAGES = [
  { key: "Project", icon: Sparkles, scenarios: ["MS-1", "MS-2"] },
  { key: "Director", icon: Wand2, scenarios: ["MS-3"] },
  { key: "Assets", icon: Film, scenarios: ["MS-4", "MS-5", "MS-6", "MS-7", "MS-8"] },
  { key: "Brand", icon: Palette, scenarios: ["MS-9", "MS-10"] },
  { key: "Reframe", icon: Crop, scenarios: ["MS-11", "MS-12"] },
  { key: "Render", icon: Server, scenarios: ["MS-13", "MS-14"] },
  { key: "Export", icon: Download, scenarios: ["MS-15", "MS-16", "MS-17"] },
  { key: "Integrity", icon: ShieldCheck, scenarios: ["MS-18"] },
];

const ALL_SCENARIOS = [
  "MS-1: Project Create",
  "MS-2: Briefing Schema Validation",
  "MS-3: Auto-Director Compose",
  "MS-4: Scene Image Generation",
  "MS-5: Stock Media Bucket Health",
  "MS-6: Music Library Bucket Health",
  "MS-7: Talking Head (Hedra) Reachability",
  "MS-8: Trending Templates Available",
  "MS-9: Brand Consistency Analysis",
  "MS-10: Brand Voice Analysis",
  "MS-11: Smart Reframe (analyze-scene-subject)",
  "MS-12: Reframe Fallback Hardening",
  "MS-13: Render Lambda Bundle Verification",
  "MS-14: Render Composer (small E2E)",
  "MS-15: Multi-Format Export Pipeline",
  "MS-16: NLE Export FCPXML",
  "MS-17: NLE Export EDL",
  "MS-18: Orphan Scene Drift Check",
];

export function MotionStudioSuperuserPanel() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<"fast" | "full" | null>(null);

  const loadRuns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_superuser_runs")
      .select(
        "id, scenario_name, status, latency_ms, error_message, render_url, http_status, started_at, completed_at",
      )
      .eq("module", MODULE)
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Konnte Runs nicht laden: " + error.message);
    } else {
      setRuns((data as Run[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const triggerRun = async (mode: "fast" | "full") => {
    setRunning(mode);
    try {
      const { data, error } = await supabase.functions.invoke("motion-studio-superuser", {
        body: { mode, triggeredBy: "manual" },
      });
      if (error) throw error;
      toast.success(
        `Lauf abgeschlossen: ${data?.summary?.passed ?? 0}/${data?.summary?.total ?? 0} bestanden`,
      );
      await loadRuns();
    } catch (e) {
      toast.error("Lauf fehlgeschlagen: " + (e as Error).message);
    } finally {
      setRunning(null);
    }
  };

  // Build latest-status map per scenario
  const latestByScenario = new Map<string, Run>();
  for (const r of runs) {
    if (!latestByScenario.has(r.scenario_name)) latestByScenario.set(r.scenario_name, r);
  }

  const stagesWithStatus = PIPELINE_STAGES.map((stage) => {
    const stageRuns = stage.scenarios
      .map((prefix) => {
        const found = ALL_SCENARIOS.find((n) => n.startsWith(prefix + ":"));
        return found ? latestByScenario.get(found) : undefined;
      })
      .filter((r): r is Run => Boolean(r));
    let status: "pass" | "fail" | "warning" | "unknown" = "unknown";
    if (stageRuns.length > 0) {
      if (stageRuns.some((r) => r.status === "fail")) status = "fail";
      else if (stageRuns.some((r) => r.status === "warning")) status = "warning";
      else status = "pass";
    }
    return { ...stage, status, runCount: stageRuns.length, totalCount: stage.scenarios.length };
  });

  const summary = {
    total: latestByScenario.size,
    passed: [...latestByScenario.values()].filter((r) => r.status === "pass").length,
    failed: [...latestByScenario.values()].filter((r) => r.status === "fail").length,
    warnings: [...latestByScenario.values()].filter((r) => r.status === "warning").length,
  };

  const passRate =
    summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;

  const lastRender = runs.find((r) => r.render_url);

  return (
    <div className="space-y-6">
      {/* Header / Hero */}
      <Card className="border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Film className="h-6 w-6 text-primary" />
                Motion Studio Superuser
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
                Fokussierter Test-Bot, der ausschließlich die Composer-Pipeline (Briefing → Auto-Director → Scenes
                → Brand → Reframe → Render → Export) end-to-end verifiziert.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums text-primary">{passRate}%</span>
                <span className="text-sm text-muted-foreground">
                  {summary.passed}/{summary.total} bestanden
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadRuns}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  Neu laden
                </Button>
                <Button
                  size="sm"
                  onClick={() => triggerRun("fast")}
                  disabled={running !== null}
                >
                  {running === "fast" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Fast Run (≈90s)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => triggerRun("full")}
                  disabled={running !== null}
                >
                  {running === "full" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Full E2E (≈8min)
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Pipeline visualisation */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {stagesWithStatus.map((s, idx) => {
              const Icon = s.icon;
              const colorClass =
                s.status === "pass"
                  ? "border-green-500/50 bg-green-500/10 text-green-500"
                  : s.status === "fail"
                    ? "border-red-500/50 bg-red-500/10 text-red-500"
                    : s.status === "warning"
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-500"
                      : "border-muted bg-muted/30 text-muted-foreground";
              return (
                <div key={s.key} className="flex items-center gap-2 shrink-0">
                  <div
                    className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border ${colorClass}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{s.key}</span>
                    <span className="text-[10px] opacity-70">
                      {s.runCount}/{s.totalCount}
                    </span>
                  </div>
                  {idx < stagesWithStatus.length - 1 && (
                    <div className="w-4 h-px bg-border" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Summary chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryChip label="Bestanden" value={summary.passed} variant="success" />
        <SummaryChip label="Fehlgeschlagen" value={summary.failed} variant="danger" />
        <SummaryChip label="Warnungen" value={summary.warnings} variant="warning" />
        <SummaryChip label="Szenarien gesamt" value={ALL_SCENARIOS.length} variant="neutral" />
      </div>

      {/* Last render preview */}
      {lastRender?.render_url && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" />
              Letzter Test-Render
            </CardTitle>
          </CardHeader>
          <CardContent>
            <video
              src={lastRender.render_url}
              controls
              className="w-full max-w-md rounded-lg border"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {lastRender.scenario_name} ·{" "}
              {formatDistanceToNow(new Date(lastRender.started_at), {
                addSuffix: true,
                locale: de,
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Scenario list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Szenarien — letzter Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px] pr-4">
            <div className="space-y-2">
              {ALL_SCENARIOS.map((name) => {
                const r = latestByScenario.get(name);
                return <ScenarioRow key={name} name={name} run={r} />;
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "success" | "danger" | "warning" | "neutral";
}) {
  const colorClass =
    variant === "success"
      ? "text-green-500"
      : variant === "danger"
        ? "text-red-500"
        : variant === "warning"
          ? "text-amber-500"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className={`text-3xl font-bold tabular-nums ${colorClass}`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

function ScenarioRow({ name, run }: { name: string; run: Run | undefined }) {
  if (!run) {
    return (
      <div className="flex items-center justify-between rounded-md border border-dashed border-muted px-3 py-2">
        <span className="text-sm text-muted-foreground">{name}</span>
        <Badge variant="outline" className="text-xs">
          Noch nicht ausgeführt
        </Badge>
      </div>
    );
  }
  const Icon =
    run.status === "pass"
      ? CheckCircle2
      : run.status === "fail"
        ? XCircle
        : run.status === "warning"
          ? AlertTriangle
          : Loader2;
  const color =
    run.status === "pass"
      ? "text-green-500"
      : run.status === "fail"
        ? "text-red-500"
        : run.status === "warning"
          ? "text-amber-500"
          : "text-muted-foreground";
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-4 w-4 shrink-0 ${color}`} />
          <span className="text-sm font-medium truncate">{name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {run.latency_ms !== null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {run.latency_ms}ms
            </span>
          )}
          {run.http_status && (
            <Badge variant="outline" className="text-[10px]">
              HTTP {run.http_status}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(run.started_at), {
              addSuffix: true,
              locale: de,
            })}
          </span>
        </div>
      </div>
      {run.error_message && (
        <p className="text-xs text-red-500/80 mt-1 truncate" title={run.error_message}>
          {run.error_message}
        </p>
      )}
    </div>
  );
}
