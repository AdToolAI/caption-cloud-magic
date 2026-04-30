import { useState, forwardRef } from "react";
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
import { Activity, Bug, Target, Wallet, TrendingUp, Play, Loader2, ShieldCheck, AlertTriangle, Eye, EyeOff, Copy, KeyRound, Check, CheckCircle2, VolumeX, Filter, FlaskConical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { E2EResultsTab } from "@/components/admin/qa-cockpit/E2EResultsTab";

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
  const [selectedBug, setSelectedBug] = useState<any | null>(null);

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
        .limit(100);
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const mutedPatterns = useQuery({
    queryKey: ["qa-muted-patterns"],
    queryFn: async () => {
      const { data } = await supabase
        .from("qa_muted_patterns")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const [bugFilter, setBugFilter] = useState<"action" | "warnings" | "resolved" | "muted">("action");

  const resolveBug = useMutation({
    mutationFn: async (bugId: string) => {
      const { error } = await supabase
        .from("qa_bug_reports")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", bugId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Als behoben markiert");
      queryClient.invalidateQueries({ queryKey: ["qa-bugs"] });
      setSelectedBug(null);
    },
    onError: (e: any) => toast.error(`Fehler: ${e?.message ?? String(e)}`),
  });

  const mutePattern = useMutation({
    mutationFn: async ({ pattern, reason }: { pattern: string; reason: string }) => {
      const { error } = await supabase
        .from("qa_muted_patterns")
        .insert({ pattern_regex: pattern, reason, severity_when_matched: "ignore" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pattern stummgeschaltet — zukünftige Runs ignorieren ihn");
      queryClient.invalidateQueries({ queryKey: ["qa-muted-patterns"] });
    },
    onError: (e: any) => toast.error(`Fehler: ${e?.message ?? String(e)}`),
  });

  const unmutePattern = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("qa_muted_patterns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pattern wieder aktiv");
      queryClient.invalidateQueries({ queryKey: ["qa-muted-patterns"] });
    },
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
    mutationFn: async (resetPassword: boolean) => {
      const { data, error } = await supabase.functions.invoke("qa-agent-setup-test-user", {
        body: resetPassword ? { reset_password: true } : {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.password) {
        setCredentials({ email: data.email, password: data.password });
        setShowPassword(false);
        setCopied(false);
        toast.success(`Test-User bereit: ${data.email}`, {
          description: "Vollständige Zugangsdaten im Dialog — sofort als Secret speichern.",
        });
      } else {
        toast.info(`Test-User existiert bereits: ${data?.email}`, {
          description: "Klick auf 'Passwort zurücksetzen' um neue Zugangsdaten zu erzeugen.",
        });
      }
    },
    onError: (e: any) => toast.error(`Setup fehlgeschlagen: ${e?.message ?? String(e)}`),
  });

  const handleCopy = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Kopieren fehlgeschlagen — bitte manuell markieren.");
    }
  };

  const closeCredentials = () => {
    setCredentials(null);
    setShowPassword(false);
    setCopied(false);
  };

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
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setupTestUser.mutate(false)}
              disabled={setupTestUser.isPending}
            >
              {setupTestUser.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Test-User einrichten
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (confirm("Wirklich neues Passwort erzeugen? Das alte wird sofort ungültig.")) {
                  setupTestUser.mutate(true);
                }
              }}
              disabled={setupTestUser.isPending}
            >
              <KeyRound className="h-4 w-4 mr-2" />
              Passwort zurücksetzen
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
            <TabsTrigger value="e2e">
              <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
              E2E Tests
            </TabsTrigger>
            <TabsTrigger value="bugs">Bug Inbox</TabsTrigger>
            <TabsTrigger value="missions">Missionen</TabsTrigger>
            <TabsTrigger value="budget">Budget</TabsTrigger>
            <TabsTrigger value="rotation">Provider-Rotation</TabsTrigger>
          </TabsList>

          {/* E2E PLAYWRIGHT RESULTS */}
          <TabsContent value="e2e" className="mt-4">
            <E2EResultsTab />
          </TabsContent>

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
                    {Array.isArray(r.metadata?.result?.heartbeats) && r.metadata.result.heartbeats.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-2">
                        {r.metadata.result.heartbeats.map((h: any, i: number) => (
                          <span
                            key={i}
                            title={h.error || h.url || ""}
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                              h.label === "aborted"
                                ? "bg-red-500/10 border-red-500/40 text-red-300"
                                : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                            }`}
                          >
                            {h.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.metadata?.result?.targetUrl && (
                      <p className="text-[11px] text-muted-foreground/70 mt-1 font-mono truncate" title={r.metadata.result.targetUrl}>
                        Ziel: {r.metadata.result.targetUrl}
                      </p>
                    )}
                    {r.metadata?.result?.error && (
                      <p className="text-[11px] text-red-400 mt-1 font-mono truncate" title={r.metadata.result.error}>
                        ⚠ {r.metadata.result.error}
                      </p>
                    )}
                    {r.metadata?.result?.error && /preview auth bridge/i.test(r.metadata.result.error) && (
                      <p className="text-[11px] text-amber-300 mt-1">
                        Hinweis: Ziel-URL ist durch Lovable-Preview-Auth geschützt. Setze das Secret <code className="font-mono">QA_TARGET_URL</code> auf eine öffentliche Domain (z. B. <code className="font-mono">https://useadtool.ai</code>).
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(runs.data ?? []).length === 0 && <EmptyState label="Noch keine Runs" />}
          </TabsContent>

          {/* BUG INBOX */}
          <TabsContent value="bugs" className="space-y-3 mt-4">
            {(() => {
              const all = bugs.data ?? [];
              const open = all.filter((b: any) => b.status !== "resolved" && b.status !== "wont_fix");
              const action = open.filter((b: any) => b.severity === "critical" || b.severity === "high");
              const warnings = open.filter((b: any) => b.severity !== "critical" && b.severity !== "high");
              const resolved = all.filter((b: any) => b.status === "resolved" || b.status === "wont_fix");
              const list =
                bugFilter === "action" ? action
                : bugFilter === "warnings" ? warnings
                : bugFilter === "resolved" ? resolved
                : [];

              return (
                <>
                  <div className="flex gap-2 flex-wrap items-center">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <FilterPill active={bugFilter === "action"} onClick={() => setBugFilter("action")}>
                      Action Required <span className="ml-1.5 text-red-300">({action.length})</span>
                    </FilterPill>
                    <FilterPill active={bugFilter === "warnings"} onClick={() => setBugFilter("warnings")}>
                      Warnings <span className="ml-1.5 text-yellow-300">({warnings.length})</span>
                    </FilterPill>
                    <FilterPill active={bugFilter === "resolved"} onClick={() => setBugFilter("resolved")}>
                      Resolved <span className="ml-1.5 text-emerald-300">({resolved.length})</span>
                    </FilterPill>
                    <FilterPill active={bugFilter === "muted"} onClick={() => setBugFilter("muted")}>
                      Muted Patterns <span className="ml-1.5 text-slate-300">({(mutedPatterns.data ?? []).length})</span>
                    </FilterPill>
                  </div>

                  {bugFilter === "muted" ? (
                    <div className="space-y-2">
                      {(mutedPatterns.data ?? []).map((p: any) => (
                        <Card key={p.id} className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
                          <CardContent className="pt-4 flex items-start gap-3">
                            <Badge variant="outline">{p.severity_when_matched}</Badge>
                            <div className="flex-1 min-w-0">
                              <code className="text-xs font-mono text-cyan-300 break-all">{p.pattern_regex}</code>
                              {p.reason && <p className="text-xs text-muted-foreground mt-1">{p.reason}</p>}
                            </div>
                            <Button size="sm" variant="outline" onClick={() => unmutePattern.mutate(p.id)}>
                              Unmute
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                      {(mutedPatterns.data ?? []).length === 0 && (
                        <EmptyState label="Keine Patterns stummgeschaltet" />
                      )}
                    </div>
                  ) : list.length === 0 ? (
                    <EmptyState
                      label={
                        bugFilter === "action"
                          ? "Keine kritischen Bugs offen — alles grün ✓"
                          : bugFilter === "warnings"
                          ? "Keine Warnungen"
                          : "Noch nichts gelöst"
                      }
                    />
                  ) : (
                    list.map((b: any) => (
                      <Card
                        key={b.id}
                        onClick={() => setSelectedBug(b)}
                        className="bg-[#0A0F1F]/80 border-[#F5C76A]/10 cursor-pointer hover:border-[#F5C76A]/40 transition-colors"
                      >
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-3 flex-wrap">
                            <Badge className={SEVERITY_COLORS[b.severity] ?? ""}>{b.severity}</Badge>
                            <Badge variant="outline">{b.category}</Badge>
                            {b.status === "resolved" && (
                              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> resolved
                              </Badge>
                            )}
                            <span className="font-medium flex-1 min-w-0">{b.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          {b.description && (
                            <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap font-mono bg-black/30 p-2 rounded max-h-32 overflow-auto">
                              {b.description.slice(0, 400)}
                            </pre>
                          )}
                          <div className="text-xs text-muted-foreground mt-2 flex items-center gap-3 flex-wrap">
                            <span>Mission: {b.mission_name}{b.route ? ` · ${b.route}` : ""}</span>
                            {b.status !== "resolved" && (
                              <div className="ml-auto flex gap-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => resolveBug.mutate(b.id)}
                                  disabled={resolveBug.isPending}
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Mark fixed
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    const sample = (b.title || "").replace(/^Console:\s*/, "").replace(/^Network \d+:\s*/, "").replace(/\s*\(×\d+\)\s*$/, "").trim();
                                    const pattern = prompt("Regex-Pattern, das gemutet werden soll:", sample.slice(0, 80));
                                    if (!pattern) return;
                                    const reason = prompt("Grund (optional):", "Bekanntes Rauschen") ?? "";
                                    mutePattern.mutate({ pattern, reason });
                                    resolveBug.mutate(b.id);
                                  }}
                                >
                                  <VolumeX className="h-3 w-3 mr-1" /> Mute
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </>
              );
            })()}
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

      {/* Credentials Modal — one-time password reveal */}
      <Dialog open={!!credentials} onOpenChange={(open) => { if (!open) closeCredentials(); }}>
        <DialogContent className="bg-[#0A0F1F] border-[#F5C76A]/30 text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#F5C76A] flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Test-User-Zugangsdaten
            </DialogTitle>
            <DialogDescription className="text-amber-300/90 flex items-start gap-2 mt-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Dieses Passwort wird <strong>nur jetzt einmalig</strong> angezeigt. Speichere es sofort als
                Secret <code className="px-1 py-0.5 bg-black/40 rounded text-[#F5C76A]">QA_TEST_USER_PASSWORD</code>.
              </span>
            </DialogDescription>
          </DialogHeader>

          {credentials && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">E-Mail</Label>
                <Input
                  readOnly
                  value={credentials.email}
                  className="font-mono bg-black/40 border-[#F5C76A]/20 mt-1"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Passwort (vollständig)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    readOnly
                    type={showPassword ? "text" : "password"}
                    value={credentials.password}
                    className="font-mono bg-black/40 border-[#F5C76A]/20 flex-1"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowPassword((v) => !v)}
                    title={showPassword ? "Verbergen" : "Anzeigen"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    title="In Zwischenablage kopieren"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Länge: {credentials.password.length} Zeichen
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeCredentials}>
              Schließen (Passwort verwerfen)
            </Button>
            <Button
              className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90"
              onClick={handleCopy}
            >
              {copied ? <><Check className="h-4 w-4 mr-2" /> Kopiert</> : <><Copy className="h-4 w-4 mr-2" /> Passwort kopieren</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BUG DETAIL MODAL */}
      <Dialog open={!!selectedBug} onOpenChange={(open) => { if (!open) setSelectedBug(null); }}>
        <DialogContent className="bg-[#0A0F1F] border-[#F5C76A]/30 text-foreground sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedBug && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-2 flex-wrap">
                  <Badge className={SEVERITY_COLORS[selectedBug.severity] ?? ""}>{selectedBug.severity}</Badge>
                  <Badge variant="outline">{selectedBug.category}</Badge>
                  <Badge variant="outline">{selectedBug.status}</Badge>
                </div>
                <DialogTitle className="text-[#F5C76A] mt-2">{selectedBug.title}</DialogTitle>
                <DialogDescription className="text-xs">
                  Mission: <span className="font-mono text-foreground">{selectedBug.mission_name}</span>
                  {selectedBug.route && <> · Route: <span className="font-mono text-foreground">{selectedBug.route}</span></>}
                  {" · "}{formatDistanceToNow(new Date(selectedBug.created_at), { addSuffix: true })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {selectedBug.description && (
                  <Section title="Beschreibung">
                    <pre className="text-xs whitespace-pre-wrap font-mono bg-black/40 p-3 rounded border border-[#F5C76A]/10">
                      {selectedBug.description}
                    </pre>
                  </Section>
                )}

                {selectedBug.screenshot_url && (
                  <Section title="Screenshot">
                    <a href={selectedBug.screenshot_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={selectedBug.screenshot_url}
                        alt="Bug screenshot"
                        className="w-full rounded border border-[#F5C76A]/10 hover:border-[#F5C76A]/40"
                      />
                    </a>
                  </Section>
                )}

                {Array.isArray(selectedBug.console_log) && selectedBug.console_log.length > 0 && (
                  <Section title={`Console-Logs (${selectedBug.console_log.length})`}>
                    <div className="space-y-2 max-h-72 overflow-auto bg-black/40 p-3 rounded border border-[#F5C76A]/10">
                      {selectedBug.console_log.map((c: any, i: number) => (
                        <div key={i} className="text-xs font-mono border-b border-white/5 pb-2 last:border-0">
                          <div>
                            <span className={c.type === "error" || c.type === "pageerror" ? "text-red-400" : "text-cyan-300"}>
                              [{c.type}]
                            </span>{" "}
                            <span className="text-muted-foreground">{c.text}</span>
                            {c.occurrences > 1 && <span className="ml-2 text-yellow-300">×{c.occurrences}</span>}
                          </div>
                          {c.url && (
                            <div className="text-[10px] text-cyan-400/70 mt-0.5 truncate" title={`${c.url}:${c.line ?? "?"}`}>
                              @ {c.url}:{c.line ?? "?"}
                            </div>
                          )}
                          {c.stack && (
                            <pre className="text-[10px] text-red-300/70 mt-1 whitespace-pre-wrap max-h-24 overflow-auto">{c.stack}</pre>
                          )}
                          {c.muted_reason && (
                            <div className="text-[10px] text-amber-300/80 mt-0.5">muted: {c.muted_reason}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {selectedBug.network_trace?.login_screenshot_url && (
                  <Section title="Auth-Seite zum Zeitpunkt des Fehlers">
                    <a href={selectedBug.network_trace.login_screenshot_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={selectedBug.network_trace.login_screenshot_url}
                        alt="Auth page at failure"
                        className="w-full rounded border border-amber-500/30 hover:border-amber-500/60"
                      />
                    </a>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Was Browserless auf <code>/auth</code> tatsächlich gesehen hat, bevor der Login fehlschlug.
                    </p>
                  </Section>
                )}

                {Array.isArray(selectedBug.network_trace?.heartbeats) && selectedBug.network_trace.heartbeats.length > 0 && (
                  <Section title="Skript-Heartbeats (wo blieb das Skript stehen?)">
                    <ol className="text-xs space-y-1 bg-black/40 p-3 rounded border border-[#F5C76A]/10 font-mono">
                      {selectedBug.network_trace.heartbeats.map((h: any, i: number) => (
                        <li key={i} className={h.label === "aborted" ? "text-red-300" : "text-cyan-300"}>
                          {i + 1}. {h.label}
                          {h.url && <span className="text-muted-foreground"> · {h.url}</span>}
                          {h.via && <span className="text-muted-foreground"> · via {h.via}</span>}
                          {h.error && <span className="text-red-400"> · {h.error}</span>}
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}

                {selectedBug.network_trace?.raw_response && (
                  <Section title="Roh-Antwort (Browserless)">
                    <pre className="text-xs whitespace-pre-wrap font-mono bg-black/40 p-3 rounded border border-amber-500/20 max-h-48 overflow-auto">
                      {selectedBug.network_trace.raw_response}
                    </pre>
                  </Section>
                )}

                {selectedBug.network_trace && (
                  <Section title="Network / Raw Response">
                    <pre className="text-xs whitespace-pre-wrap font-mono bg-black/40 p-3 rounded border border-[#F5C76A]/10 max-h-60 overflow-auto">
                      {JSON.stringify(selectedBug.network_trace, null, 2)}
                    </pre>
                  </Section>
                )}

                {Array.isArray(selectedBug.reproduce_steps) && selectedBug.reproduce_steps.length > 0 && (
                  <Section title="Reproduce-Steps">
                    <ol className="text-xs list-decimal list-inside space-y-1 bg-black/40 p-3 rounded border border-[#F5C76A]/10">
                      {selectedBug.reproduce_steps.map((s: any, i: number) => (
                        <li key={i} className="font-mono text-muted-foreground">{typeof s === "string" ? s : JSON.stringify(s)}</li>
                      ))}
                    </ol>
                  </Section>
                )}
              </div>

              <DialogFooter className="gap-2 mt-4 flex-wrap">
                {selectedBug.status !== "resolved" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => resolveBug.mutate(selectedBug.id)}
                      disabled={resolveBug.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Mark fixed
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const sample = (selectedBug.title || "").replace(/^Console:\s*/, "").replace(/^Network \d+:\s*/, "").replace(/\s*\(×\d+\)\s*$/, "").trim();
                        const pattern = prompt("Regex-Pattern, das gemutet werden soll:", sample.slice(0, 80));
                        if (!pattern) return;
                        const reason = prompt("Grund (optional):", "Bekanntes Rauschen") ?? "";
                        mutePattern.mutate({ pattern, reason });
                        resolveBug.mutate(selectedBug.id);
                      }}
                    >
                      <VolumeX className="h-4 w-4 mr-2" /> Mute pattern
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    const md = `# Bug: ${selectedBug.title}\n\n**Mission:** ${selectedBug.mission_name}\n**Severity:** ${selectedBug.severity}\n**Category:** ${selectedBug.category}\n${selectedBug.route ? `**Route:** ${selectedBug.route}\n` : ""}\n## Beschreibung\n\`\`\`\n${selectedBug.description ?? ""}\n\`\`\`\n\n${selectedBug.network_trace ? `## Network Trace\n\`\`\`json\n${JSON.stringify(selectedBug.network_trace, null, 2)}\n\`\`\`\n` : ""}${Array.isArray(selectedBug.console_log) && selectedBug.console_log.length ? `\n## Console\n\`\`\`\n${selectedBug.console_log.map((c: any) => `[${c.type}] ${c.text}${c.url ? ` @ ${c.url}:${c.line ?? "?"}` : ""}${c.stack ? `\n${c.stack}` : ""}`).join("\n")}\n\`\`\`\n` : ""}`;
                    navigator.clipboard.writeText(md);
                    toast.success("Bug-Context als Markdown kopiert — direkt im Chat einfügen");
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" /> Als Prompt kopieren
                </Button>
                <Button onClick={() => setSelectedBug(null)}>Schließen</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-[#F5C76A]/80 uppercase tracking-wider mb-1.5">{title}</div>
      {children}
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

const StatusBadge = forwardRef<HTMLDivElement, { status: string }>(({ status }, ref) => {
  const map: Record<string, string> = {
    pending: "bg-slate-500/20 text-slate-300",
    running: "bg-cyan-500/20 text-cyan-300 animate-pulse",
    succeeded: "bg-emerald-500/20 text-emerald-300",
    failed: "bg-red-500/20 text-red-300",
    aborted: "bg-orange-500/20 text-orange-300",
    skipped: "bg-slate-500/20 text-slate-300",
  };
  return <div ref={ref} className="inline-flex"><Badge className={map[status] ?? ""}>{status}</Badge></div>;
});
StatusBadge.displayName = "StatusBadge";

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground border border-dashed border-[#F5C76A]/20 rounded-lg">
      {label}
    </div>
  );
}

const FilterPill = React.forwardRef<
  HTMLButtonElement,
  { active: boolean; onClick: () => void; children: React.ReactNode }
>(({ active, onClick, children }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-[#F5C76A] text-black border-[#F5C76A]"
          : "bg-[#0A0F1F]/80 text-muted-foreground border-[#F5C76A]/20 hover:border-[#F5C76A]/50"
      }`}
    >
      {children}
    </button>
  );
});
FilterPill.displayName = "FilterPill";
