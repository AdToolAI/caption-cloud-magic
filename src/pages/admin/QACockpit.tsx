import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Activity, Bug, Target, Wallet, TrendingUp, Play, Loader2, ShieldCheck, AlertTriangle, Eye, EyeOff, Copy, KeyRound, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const TIER_COLORS: Record<string, string> = {
  smoke: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  regression: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  deep: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40",
  performance: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  exploration: "bg-violet-500/20 text-violet-300 border-violet-500/40",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  info: "bg-slate-500/20 text-slate-300 border-slate-500/40",
};

export default function QACockpit() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("live");
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const runs = useQuery({
    queryKey: ["qa-runs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("qa_test_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  const bugs = useQuery({
    queryKey: ["qa-bugs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("qa_bug_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const missions = useQuery({
    queryKey: ["qa-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("qa_missions")
        .select("*")
        .order("name");
      return data ?? [];
    },
  });

  const budget = useQuery({
    queryKey: ["qa-budget"],
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("qa_budget_ledger")
        .select("*")
        .eq("period", "month")
        .eq("period_start", monthStart.toISOString().slice(0, 10));
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  const rotation = useQuery({
    queryKey: ["qa-rotation"],
    queryFn: async () => {
      const { data } = await supabase
        .from("qa_provider_rotation")
        .select("*")
        .order("category")
        .order("provider");
      return data ?? [];
    },
  });

  const triggerMission = useMutation({
    mutationFn: async (missionId?: string) => {
      const { data, error } = await supabase.functions.invoke("qa-agent-orchestrator", {
        body: { mission_id: missionId, triggered_by: "manual" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.ok) {
        toast.success(`Mission gestartet: ${data.mission}`);
        queryClient.invalidateQueries({ queryKey: ["qa-runs"] });
      } else {
        toast.warning(`Übersprungen: ${data?.reason ?? "unbekannt"}`);
      }
    },
    onError: (e: any) => toast.error(`Fehler: ${e?.message ?? String(e)}`),
  });

  const setupTestUser = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("qa-agent-setup-test-user", {
        body: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Test-User bereit: ${data?.email}`, {
        description: data?.password
          ? `Passwort: ${data.password.slice(0, 8)}… (kopieren & als Secret QA_TEST_USER_PASSWORD speichern)`
          : undefined,
        duration: 30000,
      });
    },
    onError: (e: any) => toast.error(`Setup fehlgeschlagen: ${e?.message ?? String(e)}`),
  });

  const totalBudgetCents = (budget.data ?? []).reduce(
    (acc, row: any) => acc + (row.hard_cap_cents ?? 0),
    0
  );
  const totalSpentCents = (budget.data ?? []).reduce(
    (acc, row: any) => acc + (row.spent_cents ?? 0),
    0
  );
  const budgetPct =
    totalBudgetCents > 0 ? Math.min(100, (totalSpentCents / totalBudgetCents) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#050816] text-foreground p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-serif text-[#F5C76A] tracking-tight flex items-center gap-3">
              <ShieldCheck className="h-8 w-8" /> Bond QA Cockpit
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Autonomer KI-Tester · 300€ Smart-Budget · Live-Preview
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setupTestUser.mutate()}
              disabled={setupTestUser.isPending}
            >
              {setupTestUser.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Test-User einrichten
            </Button>
            <Button
              onClick={() => triggerMission.mutate(undefined)}
              disabled={triggerMission.isPending}
              className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90"
            >
              {triggerMission.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Nächste Mission starten
            </Button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={<Activity className="h-4 w-4" />}
            label="Runs (30T)"
            value={String(runs.data?.length ?? 0)}
            sublabel={`${runs.data?.filter((r: any) => r.status === "succeeded").length ?? 0} grün`}
          />
          <KpiCard
            icon={<Bug className="h-4 w-4" />}
            label="Offene Bugs"
            value={String(bugs.data?.filter((b: any) => b.status === "open").length ?? 0)}
            sublabel={`${bugs.data?.filter((b: any) => b.severity === "critical").length ?? 0} kritisch`}
          />
          <KpiCard
            icon={<Target className="h-4 w-4" />}
            label="Missionen"
            value={String(missions.data?.length ?? 0)}
            sublabel={`${missions.data?.filter((m: any) => m.enabled).length ?? 0} aktiv`}
          />
          <KpiCard
            icon={<Wallet className="h-4 w-4" />}
            label="Budget Monat"
            value={`${(totalSpentCents / 100).toFixed(2)}€ / ${(totalBudgetCents / 100).toFixed(0)}€`}
            sublabel={`${budgetPct.toFixed(1)}% verbraucht`}
            warning={budgetPct > 80}
          />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-[#0A0F1F]/80 border border-[#F5C76A]/20">
            <TabsTrigger value="live">Live Runs</TabsTrigger>
            <TabsTrigger value="bugs">Bug Inbox</TabsTrigger>
            <TabsTrigger value="missions">Missionen</TabsTrigger>
            <TabsTrigger value="budget">Budget</TabsTrigger>
            <TabsTrigger value="rotation">Provider-Rotation</TabsTrigger>
          </TabsList>

          {/* LIVE RUNS */}
          <TabsContent value="live" className="space-y-3 mt-4">
            {(runs.data ?? []).map((r: any) => (
              <Card key={r.id} className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
                <CardContent className="pt-4 flex items-start gap-4">
                  {r.last_screenshot_url ? (
                    <img
                      src={r.last_screenshot_url}
                      alt=""
                      className="w-32 h-20 object-cover rounded border border-[#F5C76A]/20"
                    />
                  ) : (
                    <div className="w-32 h-20 rounded border border-[#F5C76A]/10 bg-black/40 flex items-center justify-center text-xs text-muted-foreground">
                      no preview
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm">{r.mission_name}</span>
                      <Badge className={TIER_COLORS[r.tier] ?? ""}>{r.tier}</Badge>
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-muted-foreground ml-auto">
                        {r.started_at && formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{r.log_summary}</p>
                    <div className="flex gap-3 text-xs mt-2">
                      <span>Steps: {r.steps_completed}/{r.steps_total}</span>
                      <span className={r.bugs_found > 0 ? "text-red-400" : ""}>
                        Bugs: {r.bugs_found}
                      </span>
                      <span>Cost: {((r.cost_actual_cents ?? 0) / 100).toFixed(2)}€</span>
                      {r.duration_ms && <span>{(r.duration_ms / 1000).toFixed(1)}s</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(runs.data ?? []).length === 0 && <EmptyState label="Noch keine Runs" />}
          </TabsContent>

          {/* BUG INBOX */}
          <TabsContent value="bugs" className="space-y-3 mt-4">
            {(bugs.data ?? []).map((b: any) => (
              <Card key={b.id} className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Badge className={SEVERITY_COLORS[b.severity] ?? ""}>{b.severity}</Badge>
                    <Badge variant="outline">{b.category}</Badge>
                    <span className="font-medium flex-1">{b.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {b.description && (
                    <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap font-mono bg-black/30 p-2 rounded max-h-40 overflow-auto">
                      {b.description}
                    </pre>
                  )}
                  <div className="text-xs text-muted-foreground mt-2">
                    Mission: {b.mission_name} {b.route ? `· ${b.route}` : ""}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(bugs.data ?? []).length === 0 && <EmptyState label="Keine Bugs gefunden — alles grün ✓" />}
          </TabsContent>

          {/* MISSIONS */}
          <TabsContent value="missions" className="grid md:grid-cols-2 gap-3 mt-4">
            {(missions.data ?? []).map((m: any) => (
              <Card key={m.id} className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={TIER_COLORS[m.tier] ?? ""}>{m.tier}</Badge>
                    <span className="font-mono text-sm flex-1 truncate">{m.name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => triggerMission.mutate(m.id)}
                      disabled={triggerMission.isPending}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                  <div className="text-xs mt-2 text-muted-foreground">
                    Cap: {(m.cost_cap_cents / 100).toFixed(2)}€ · Real:{" "}
                    {(m.cost_real_providers ?? []).length > 0
                      ? (m.cost_real_providers ?? []).join(", ")
                      : "alle gemockt"}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* BUDGET */}
          <TabsContent value="budget" className="space-y-4 mt-4">
            <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
              <CardHeader>
                <CardTitle className="text-sm">Monatsbudget gesamt</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl font-bold text-[#F5C76A]">
                    {(totalSpentCents / 100).toFixed(2)}€
                  </span>
                  <span className="text-muted-foreground">
                    / {(totalBudgetCents / 100).toFixed(0)}€
                  </span>
                  {budgetPct > 80 && (
                    <Badge className="bg-red-500/20 text-red-300 ml-auto">
                      <AlertTriangle className="h-3 w-3 mr-1" /> Achtung
                    </Badge>
                  )}
                </div>
                <Progress value={budgetPct} />
              </CardContent>
            </Card>
            <div className="grid md:grid-cols-2 gap-3">
              {(budget.data ?? []).map((b: any) => {
                const pct = b.hard_cap_cents > 0 ? (b.spent_cents / b.hard_cap_cents) * 100 : 0;
                return (
                  <Card key={b.id} className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
                    <CardContent className="pt-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-mono">{b.category}</span>
                        <span>
                          {(b.spent_cents / 100).toFixed(2)}€ / {(b.hard_cap_cents / 100).toFixed(0)}€
                        </span>
                      </div>
                      <Progress value={Math.min(100, pct)} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* PROVIDER ROTATION */}
          <TabsContent value="rotation" className="space-y-3 mt-4">
            <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Provider-Rotations-Matrix
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-[#F5C76A]/10">
                      <th className="py-2">Provider</th>
                      <th>Kategorie</th>
                      <th>Letzter Real-Test</th>
                      <th>Tests</th>
                      <th>Failures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rotation.data ?? []).map((p: any) => (
                      <tr key={p.id} className="border-b border-[#F5C76A]/5">
                        <td className="py-2 font-mono">{p.provider}</td>
                        <td className="text-muted-foreground">{p.category}</td>
                        <td className="text-muted-foreground">
                          {p.last_real_test_at
                            ? formatDistanceToNow(new Date(p.last_real_test_at), { addSuffix: true })
                            : "—"}
                        </td>
                        <td>{p.total_tests}</td>
                        <td className={p.total_failures > 0 ? "text-red-400" : ""}>
                          {p.total_failures}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sublabel,
  warning,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  warning?: boolean;
}) {
  return (
    <Card
      className={`bg-[#0A0F1F]/80 border ${
        warning ? "border-red-500/40" : "border-[#F5C76A]/10"
      }`}
    >
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon} {label}
        </div>
        <div className="text-2xl font-bold mt-1 text-[#F5C76A]">{value}</div>
        {sublabel && <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-slate-500/20 text-slate-300",
    running: "bg-cyan-500/20 text-cyan-300 animate-pulse",
    succeeded: "bg-emerald-500/20 text-emerald-300",
    failed: "bg-red-500/20 text-red-300",
    aborted: "bg-orange-500/20 text-orange-300",
    skipped: "bg-slate-500/20 text-slate-300",
  };
  return <Badge className={map[status] ?? ""}>{status}</Badge>;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground border border-dashed border-[#F5C76A]/20 rounded-lg">
      {label}
    </div>
  );
}
