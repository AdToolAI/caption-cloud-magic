import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, Mail, CheckCircle, XCircle, ListTodo, Shield, Crown,
  Sparkles, Activity, Clock, TrendingUp, Circle, MoreHorizontal, Radar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RoleManager } from "@/components/team/RoleManager";
import { EnterpriseUpgradePrompt } from "@/components/team/EnterpriseUpgradePrompt";
import { EnterpriseSeatManager } from "@/components/team/EnterpriseSeatManager";
import { cn } from "@/lib/utils";

/* ---------- Helpers ---------- */

const relTime = (iso?: string | null) => {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d < 1) return "heute";
  if (d < 7) return `vor ${d}d`;
  if (d < 30) return `vor ${Math.floor(d / 7)}w`;
  return new Date(iso).toLocaleDateString();
};

const initials = (s: string) =>
  s.replace(/[^a-zA-Z0-9]/g, "").substring(0, 2).toUpperCase() || "??";

/* ---------- Bond-Gold building blocks ---------- */

const GlassCard = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => (
  <div
    className={cn(
      "relative rounded-2xl border border-primary/15 bg-card/40 backdrop-blur-xl shadow-[0_0_60px_-30px_hsl(var(--primary)/0.4)]",
      "before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none",
      "before:bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_60%)]",
      className,
    )}
  >
    {children}
  </div>
);

const KpiChip = ({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string | number;
  accent?: boolean;
}) => (
  <div
    className={cn(
      "relative flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur",
      accent
        ? "border-primary/40 bg-primary/10"
        : "border-primary/10 bg-background/40",
    )}
  >
    <div className="grid h-9 w-9 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="font-serif text-lg leading-tight text-foreground">{value}</p>
    </div>
  </div>
);

const SectionTitle = ({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) => (
  <div className="flex items-end justify-between gap-4 border-b border-primary/10 pb-4">
    <div>
      {eyebrow && (
        <p className="text-[10px] uppercase tracking-[0.28em] text-primary/80">
          {eyebrow}
        </p>
      )}
      <h2 className="font-serif text-2xl text-foreground">{title}</h2>
    </div>
    {action}
  </div>
);

/* ---------- Permission Matrix ---------- */

const PERMISSIONS: Array<{ id: string; keyName: string }> = [
  { id: "read", keyName: "team.capRead" },
  { id: "write", keyName: "team.capWrite" },
  { id: "invite", keyName: "team.capInvite" },
  { id: "approve", keyName: "team.capApprove" },
  { id: "billing", keyName: "team.capBilling" },
];

const ROLE_MATRIX: Record<string, Record<string, boolean>> = {
  viewer: { read: true, write: false, invite: false, approve: false, billing: false },
  editor: { read: true, write: true, invite: false, approve: false, billing: false },
  admin: { read: true, write: true, invite: true, approve: true, billing: false },
  owner: { read: true, write: true, invite: true, approve: true, billing: true },
};

const PermissionMatrix = ({ t }: { t: (k: string) => any }) => (
  <GlassCard className="p-6">
    <SectionTitle
      eyebrow="Roles"
      title={t("team.permissionMatrix")}
    />
    <p className="mt-3 text-sm text-muted-foreground">{t("team.permissionsHint")}</p>
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <th className="pb-3 font-normal">{t("team.role")}</th>
            {PERMISSIONS.map((p) => (
              <th key={p.id} className="pb-3 pl-4 font-normal">
                {t(p.keyName)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["viewer", "editor", "admin", "owner"] as const).map((role) => (
            <tr key={role} className="border-t border-primary/10">
              <td className="py-3">
                <span className="inline-flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      role === "owner"
                        ? "bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
                        : "bg-primary/40",
                    )}
                  />
                  {t(`team.${role}`)}
                </span>
              </td>
              {PERMISSIONS.map((p) => (
                <td key={p.id} className="py-3 pl-4">
                  {ROLE_MATRIX[role][p.id] ? (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </GlassCard>
);

/* ---------- Component ---------- */

export default function TeamWorkspace() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInviteMember, setShowInviteMember] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);

  const [workspaceForm, setWorkspaceForm] = useState({ name: "", description: "" });
  const [inviteForm, setInviteForm] = useState({ email: "", role: "viewer" as any });
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    assigned_to: "",
    priority: "medium" as any,
    due_date: "",
  });

  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => { if (user) loadWorkspaces(); }, [user]);
  useEffect(() => { if (selectedWorkspace) loadWorkspaceData(); }, [selectedWorkspace]);

  const loadWorkspaces = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces (*)")
      .eq("user_id", user.id);
    if (data) {
      setWorkspaces(data.map((d: any) => ({ ...d.workspaces, userRole: d.role })));
      if (data.length > 0 && !selectedWorkspace) setSelectedWorkspace(data[0].workspace_id);
    }
  };

  const loadWorkspaceData = async () => {
    if (!selectedWorkspace) return;
    const [{ data: m }, { data: ts }, { data: ap }] = await Promise.all([
      supabase.from("workspace_members").select("*").eq("workspace_id", selectedWorkspace),
      supabase.from("content_tasks").select("*").eq("workspace_id", selectedWorkspace)
        .order("created_at", { ascending: false }),
      supabase.from("content_approvals").select("*").eq("workspace_id", selectedWorkspace)
        .order("created_at", { ascending: false }),
    ]);
    let hydrated = m || [];
    if (hydrated.length > 0) {
      const ids = Array.from(new Set(hydrated.map((x: any) => x.user_id)));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, email, avatar_url")
        .in("id", ids);
      const byId = new Map((profs || []).map((p: any) => [p.id, p]));
      hydrated = hydrated.map((x: any) => ({ ...x, profile: byId.get(x.user_id) || null }));
    }
    setMembers(hydrated);
    setTasks(ts || []);
    setApprovals(ap || []);
  };

  const currentWorkspace = workspaces.find((w) => w.id === selectedWorkspace);
  const canManage = currentWorkspace?.userRole === "owner" || currentWorkspace?.userRole === "admin";
  const isEnterprise = currentWorkspace?.is_enterprise || false;
  const memberCurrency = (currentWorkspace?.member_currency as "EUR" | "USD") || "EUR";
  const seatPrice = currentWorkspace?.member_seat_price || 49.99;

  /* ---------- Mutations ---------- */

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const { data: workspace, error: wsError } = await supabase
        .from("workspaces")
        .insert({
          name: workspaceForm.name,
          description: workspaceForm.description,
          owner_id: user.id,
        })
        .select().single();
      if (wsError) throw wsError;
      const { error: memberError } = await supabase
        .from("workspace_members")
        .insert({ workspace_id: workspace.id, user_id: user.id, role: "owner" });
      if (memberError) throw memberError;
      toast({ title: t("success"), description: t("team.workspaceCreated") });
      setShowCreateWorkspace(false);
      setWorkspaceForm({ name: "", description: "" });
      loadWorkspaces();
    } catch (error: any) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  };

  const inviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace) return;
    try {
      const { data, error } = await supabase.functions.invoke("send-workspace-invitation", {
        body: {
          workspaceId: selectedWorkspace,
          email: inviteForm.email,
          role: inviteForm.role,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: t("success"), description: t("team.inviteSent") });
      setShowInviteMember(false);
      setInviteForm({ email: "", role: "viewer" });
      if (isEnterprise) await updateWorkspaceSeats();
    } catch (error: any) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  };

  const updateTaskStatus = async (taskId: string, status: "todo" | "in_progress" | "review" | "done") => {
    const prev = tasks;
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status } : t)));
    const { error } = await supabase.from("content_tasks").update({ status }).eq("id", taskId);
    if (error) {
      setTasks(prev);
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  };

  const deleteTask = async (taskId: string) => {
    const prev = tasks;
    setTasks(tasks.filter((t) => t.id !== taskId));
    const { error } = await supabase.from("content_tasks").delete().eq("id", taskId);
    if (error) {
      setTasks(prev);
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  };

  const decideApproval = async (approvalId: string, decision: "approved" | "rejected") => {
    if (!user) return;
    const prev = approvals;
    setApprovals(approvals.map((a) => (a.id === approvalId ? { ...a, status: decision } : a)));
    const { error } = await supabase
      .from("content_approvals")
      .update({ status: decision, approver_id: user.id, approved_at: new Date().toISOString() })
      .eq("id", approvalId);
    if (error) {
      setApprovals(prev);
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace || !user) return;
    try {
      const { error } = await supabase.from("content_tasks").insert({
        workspace_id: selectedWorkspace,
        title: taskForm.title,
        description: taskForm.description,
        assigned_to: taskForm.assigned_to || null,
        assigned_by: user.id,
        priority: taskForm.priority,
        due_date: taskForm.due_date || null,
      });
      if (error) throw error;
      toast({ title: t("success"), description: t("team.taskCreated") });
      setTaskForm({ title: "", description: "", assigned_to: "", priority: "medium", due_date: "" });
      setShowCreateTask(false);
      loadWorkspaceData();
    } catch (error: any) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  };

  const handleEnterpriseUpgrade = async () => {
    if (!selectedWorkspace || !user) return;
    setUpgrading(true);
    try {
      const userLanguage = localStorage.getItem("language") || "en";
      const currency = userLanguage === "de" ? "EUR" : "USD";
      const { trackEvent, ANALYTICS_EVENTS } = await import("@/lib/analytics");
      trackEvent(ANALYTICS_EVENTS.ENTERPRISE_CHECKOUT_STARTED, {
        workspace_id: selectedWorkspace, currency,
      });
      const { data, error } = await supabase.functions.invoke("create-enterprise-checkout", {
        body: { workspaceId: selectedWorkspace, currency },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start upgrade",
        variant: "destructive",
      });
    } finally {
      setUpgrading(false);
    }
  };

  const updateWorkspaceSeats = async () => {
    if (!selectedWorkspace || !currentWorkspace?.is_enterprise) return;
    try {
      await supabase.functions.invoke("update-workspace-seats", {
        body: { workspaceId: selectedWorkspace },
      });
      await loadWorkspaces();
    } catch (e) {
      console.error("Failed to update seats:", e);
    }
  };

  /* ---------- Derived cockpit metrics ---------- */

  const metrics = useMemo(() => {
    const activeSeats = members.filter((m) => m.status === "accepted" || !m.status).length;
    const openApprovals = approvals.filter((a) => a.status === "pending").length;
    const weekAgo = Date.now() - 7 * 86_400_000;
    const tasksThisWeek = tasks.filter(
      (x) => new Date(x.created_at).getTime() > weekAgo,
    ).length;

    // Avg approval time = updated - created for approved rows in ms → hours
    const decided = approvals.filter(
      (a) => a.status === "approved" || a.status === "rejected",
    );
    const avgMs =
      decided.length === 0
        ? 0
        : decided.reduce(
            (acc, a) =>
              acc +
              (new Date(a.updated_at || a.created_at).getTime() -
                new Date(a.created_at).getTime()),
            0,
          ) / decided.length;
    const avgHrs = Math.round(avgMs / 3_600_000);

    return {
      activeSeats,
      openApprovals,
      tasksThisWeek,
      avgResponse: decided.length === 0 ? "—" : `${avgHrs}h`,
    };
  }, [members, approvals, tasks]);

  /* ---------- Task lanes ---------- */

  const lanes = [
    { id: "backlog", label: t("team.backlog"), match: (s: string) => !s || s === "todo" || s === "backlog" },
    { id: "inProgress", label: t("team.inProgress"), match: (s: string) => s === "in_progress" || s === "doing" },
    { id: "review", label: t("team.review"), match: (s: string) => s === "review" },
    { id: "done", label: t("team.done"), match: (s: string) => s === "done" || s === "completed" },
  ];

  /* ---------- Activity feed ---------- */

  const activityEvents = useMemo(() => {
    const evs: Array<{ id: string; ts: string; label: string; kind: string }> = [];
    members.forEach((m) =>
      evs.push({
        id: `m-${m.id}`,
        ts: m.joined_at || m.created_at,
        label: `${t("team.joined")} · ${m.role}`,
        kind: "member",
      }),
    );
    tasks.forEach((tk) =>
      evs.push({
        id: `t-${tk.id}`,
        ts: tk.created_at,
        label: `${t("team.newTask")} · ${tk.title}`,
        kind: "task",
      }),
    );
    approvals.forEach((a) =>
      evs.push({
        id: `a-${a.id}`,
        ts: a.created_at,
        label: `${t("team.approvals")} · ${a.content_type} (${a.status})`,
        kind: "approval",
      }),
    );
    return evs
      .filter((e) => e.ts)
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 25);
  }, [members, tasks, approvals, t]);

  /* ---------- Render ---------- */

  return (
    <div className="relative min-h-screen bg-background">
      {/* Ambient gold glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
        <div className="absolute left-1/2 top-[-220px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute left-[20%] top-[80px] h-[200px] w-[200px] rounded-full bg-primary/10 blur-[100px]" />
      </div>

      <div className="container relative z-10 space-y-10 py-10">
        {/* ============== HERO ============== */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-primary">
                <Sparkles className="h-3 w-3" />
                {t("team.commandDeck")}
              </div>
              <h1 className="font-serif text-4xl leading-tight text-foreground md:text-5xl">
                {t("team.title")}
              </h1>
              <p className="text-base text-muted-foreground">{t("team.subtitle")}</p>
            </div>

            <Button
              onClick={() => setShowCreateWorkspace(true)}
              size="lg"
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("team.createWorkspace")}
            </Button>
          </div>

          {/* KPI cockpit */}
          {selectedWorkspace && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiChip icon={Users} label={t("team.activeSeats")} value={metrics.activeSeats} accent />
              <KpiChip icon={CheckCircle} label={t("team.openApprovals")} value={metrics.openApprovals} />
              <KpiChip icon={ListTodo} label={t("team.tasksThisWeek")} value={metrics.tasksThisWeek} />
              <KpiChip icon={Clock} label={t("team.avgResponse")} value={metrics.avgResponse} />
            </div>
          )}
        </section>

        {/* ============== WORKSPACE SWITCHER ============== */}
        {workspaces.length > 0 && (
          <GlassCard className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-primary/80">
                  {t("team.liveWorkspace")}
                </p>
                <p className="font-serif text-xl text-foreground">
                  {currentWorkspace?.name ?? "—"}
                </p>
                {currentWorkspace?.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {currentWorkspace.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isEnterprise && (
                  <Badge className="border-primary/40 bg-primary/10 text-primary">
                    <Crown className="mr-1 h-3 w-3" /> Enterprise
                  </Badge>
                )}
                <Badge variant="outline" className="border-primary/30 text-foreground">
                  {t(`team.${currentWorkspace?.userRole ?? "viewer"}`)}
                </Badge>
                <div className="min-w-[220px]">
                  <Select value={selectedWorkspace || ""} onValueChange={setSelectedWorkspace}>
                    <SelectTrigger className="border-primary/20 bg-background/60">
                      <SelectValue placeholder={t("team.selectWorkspace")} />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.map((ws) => (
                        <SelectItem key={ws.id} value={ws.id}>
                          <span className="mr-2">{ws.name}</span>
                          <Badge variant="outline" className="ml-2">
                            {ws.userRole}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        {/* ============== TABS ============== */}
        {selectedWorkspace && (
          <Tabs defaultValue="members" className="space-y-6">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-primary/15 bg-card/40 p-2 backdrop-blur-xl">
              {[
                { v: "members", i: Users, l: t("team.members"), c: metrics.activeSeats },
                { v: "roles", i: Shield, l: t("team.roles") },
                { v: "tasks", i: ListTodo, l: t("team.tasks"), c: tasks.length },
                { v: "approvals", i: CheckCircle, l: t("team.approvals"), c: metrics.openApprovals },
                { v: "activity", i: Activity, l: t("team.activity") },
                { v: "billing", i: Crown, l: t("team.billing") },
              ].map(({ v, i: Icon, l, c }) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className={cn(
                    "group relative rounded-xl px-4 py-2 text-sm text-muted-foreground",
                    "data-[state=active]:bg-primary/10 data-[state=active]:text-primary",
                    "data-[state=active]:shadow-[inset_0_-2px_0_0_hsl(var(--primary))]",
                  )}
                >
                  <Icon className="mr-2 inline h-4 w-4" />
                  {l}
                  {typeof c === "number" && c > 0 && (
                    <span className="ml-2 rounded-full border border-primary/30 bg-primary/10 px-1.5 text-[10px] text-primary">
                      {c}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ---------- MEMBERS ---------- */}
            <TabsContent value="members" className="space-y-6">
              {isEnterprise && canManage ? (
                <EnterpriseSeatManager
                  memberCount={metrics.activeSeats}
                  maxMembers={currentWorkspace?.max_members || 1}
                  currency={memberCurrency}
                  seatPrice={seatPrice}
                />
              ) : !isEnterprise && currentWorkspace?.userRole === "owner" ? (
                <EnterpriseUpgradePrompt
                  onUpgrade={handleEnterpriseUpgrade}
                  currency={memberCurrency}
                />
              ) : null}

              <GlassCard className="p-6">
                <SectionTitle
                  eyebrow="Roster"
                  title={t("team.teamMembers")}
                  action={
                    canManage && isEnterprise ? (
                      <Button
                        onClick={() => setShowInviteMember(true)}
                        className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        {t("team.inviteMember")}
                      </Button>
                    ) : canManage ? (
                      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Crown className="h-3 w-3 text-primary" />
                        Enterprise required to invite
                      </span>
                    ) : null
                  }
                />

                {members.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {t("team.noMembers")}
                  </p>
                ) : (
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-xl border border-primary/10 bg-background/40 p-4 transition hover:border-primary/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="h-11 w-11 border border-primary/30">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {initials(member.user_id)}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background",
                                member.status === "accepted" || !member.status
                                  ? "bg-primary shadow-[0_0_6px_hsl(var(--primary))]"
                                  : "bg-muted-foreground/50",
                              )}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {member.user_id.slice(0, 8)}…{member.user_id.slice(-4)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("team.joined")} · {relTime(member.joined_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={cn(
                              "border capitalize",
                              member.role === "owner"
                                ? "border-primary/50 bg-primary/15 text-primary"
                                : "border-primary/20 bg-background/60 text-foreground",
                            )}
                          >
                            {t(`team.${member.role}`) || member.role}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </TabsContent>

            {/* ---------- ROLES ---------- */}
            <TabsContent value="roles" className="space-y-6">
              <PermissionMatrix t={t} />
              <GlassCard className="p-6">
                <SectionTitle eyebrow="Access" title={t("team.roles")} />
                <div className="mt-4">
                  {selectedWorkspace && <RoleManager workspaceId={selectedWorkspace} />}
                </div>
              </GlassCard>
            </TabsContent>

            {/* ---------- TASKS ---------- */}
            <TabsContent value="tasks" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-primary/80">
                    Kanban
                  </p>
                  <h2 className="font-serif text-2xl text-foreground">
                    {t("team.tasks")}
                  </h2>
                </div>
                <Button
                  onClick={() => setShowCreateTask(true)}
                  className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("team.newTask")}
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                {lanes.map((lane) => {
                  const laneTasks = tasks.filter((tk) => lane.match(tk.status || "todo"));
                  return (
                    <GlassCard key={lane.id} className="flex min-h-[320px] flex-col p-4">
                      <div className="flex items-center justify-between border-b border-primary/10 pb-3">
                        <div className="flex items-center gap-2">
                          <Circle className="h-2 w-2 fill-primary text-primary" />
                          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                            {lane.label}
                          </span>
                        </div>
                        <span className="text-xs text-primary">{laneTasks.length}</span>
                      </div>
                      <div className="mt-3 space-y-3">
                        {laneTasks.length === 0 && (
                          <p className="rounded-lg border border-dashed border-primary/10 p-4 text-center text-xs text-muted-foreground">
                            {t("team.noTasks")}
                          </p>
                        )}
                        {laneTasks.map((tk) => (
                          <div
                            key={tk.id}
                            className="group rounded-xl border border-primary/10 bg-background/60 p-3 transition hover:border-primary/30"
                          >
                            <div className="flex items-start justify-between">
                              <p className="text-sm font-medium leading-snug text-foreground">
                                {tk.title}
                              </p>
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                            </div>
                            {tk.description && (
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {tk.description}
                              </p>
                            )}
                            <div className="mt-3 flex items-center justify-between">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "border-primary/20 text-[10px] uppercase tracking-wider",
                                  tk.priority === "urgent" && "border-destructive/40 text-destructive",
                                  tk.priority === "high" && "border-primary/40 text-primary",
                                )}
                              >
                                {t(`team.${tk.priority}`) || tk.priority}
                              </Badge>
                              {tk.due_date && (
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(tk.due_date).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </TabsContent>

            {/* ---------- APPROVALS ---------- */}
            <TabsContent value="approvals" className="space-y-4">
              <GlassCard className="p-6">
                <SectionTitle eyebrow="Queue" title={t("team.approvals")} />
                {approvals.length === 0 ? (
                  <div className="py-12 text-center">
                    <CheckCircle className="mx-auto mb-4 h-10 w-10 text-primary/60" />
                    <p className="text-sm text-muted-foreground">{t("team.noApprovals")}</p>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-3">
                    {approvals.map((approval) => (
                      <div
                        key={approval.id}
                        className="flex items-center justify-between rounded-xl border border-primary/10 bg-background/40 p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                            <Radar className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium capitalize text-foreground">
                              {approval.content_type}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(approval.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <Badge
                          className={cn(
                            "border",
                            approval.status === "approved" && "border-primary/50 bg-primary/15 text-primary",
                            approval.status === "rejected" && "border-destructive/50 bg-destructive/10 text-destructive",
                            (approval.status === "pending" || !approval.status) &&
                              "border-primary/20 bg-background/60 text-foreground",
                          )}
                        >
                          {approval.status === "pending" ? t("team.pending") : approval.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </TabsContent>

            {/* ---------- ACTIVITY ---------- */}
            <TabsContent value="activity" className="space-y-4">
              <GlassCard className="p-6">
                <SectionTitle eyebrow="Signal Log" title={t("team.activity")} />
                {activityEvents.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Noch keine Signale in diesem Workspace.
                  </p>
                ) : (
                  <ol className="mt-5 relative space-y-4 border-l border-primary/20 pl-6">
                    {activityEvents.map((ev) => (
                      <li key={ev.id} className="relative">
                        <span className="absolute -left-[29px] top-1.5 grid h-4 w-4 place-items-center rounded-full border border-primary/40 bg-background">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary))]" />
                        </span>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-foreground">{ev.label}</p>
                          <span className="text-[11px] text-muted-foreground">
                            {relTime(ev.ts)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </GlassCard>
            </TabsContent>

            {/* ---------- BILLING ---------- */}
            <TabsContent value="billing" className="space-y-4">
              {isEnterprise ? (
                <EnterpriseSeatManager
                  memberCount={metrics.activeSeats}
                  maxMembers={currentWorkspace?.max_members || 1}
                  currency={memberCurrency}
                  seatPrice={seatPrice}
                />
              ) : (
                <EnterpriseUpgradePrompt
                  onUpgrade={handleEnterpriseUpgrade}
                  currency={memberCurrency}
                />
              )}
              <GlassCard className="p-6">
                <SectionTitle eyebrow="Plan" title={t("team.billing")} />
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <KpiChip
                    icon={Users}
                    label={t("team.activeSeats")}
                    value={`${metrics.activeSeats}/${currentWorkspace?.max_members || 1}`}
                    accent
                  />
                  <KpiChip
                    icon={TrendingUp}
                    label="Seat price"
                    value={`${memberCurrency === "EUR" ? "€" : "$"}${seatPrice}`}
                  />
                  <KpiChip
                    icon={Crown}
                    label="Plan"
                    value={isEnterprise ? "Enterprise" : "Solo"}
                  />
                </div>
              </GlassCard>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* ============== DIALOGS ============== */}

      {/* Create workspace */}
      <Dialog open={showCreateWorkspace} onOpenChange={setShowCreateWorkspace}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {t("team.newWorkspace")}
            </DialogTitle>
            <DialogDescription>{t("team.workspaceDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={createWorkspace} className="space-y-4">
            <div>
              <Label>{t("team.workspaceName")}</Label>
              <Input
                value={workspaceForm.name}
                onChange={(e) => setWorkspaceForm({ ...workspaceForm, name: e.target.value })}
                required
                className="border-primary/20 bg-background/60"
              />
            </div>
            <div>
              <Label>{t("team.description")}</Label>
              <Textarea
                value={workspaceForm.description}
                onChange={(e) => setWorkspaceForm({ ...workspaceForm, description: e.target.value })}
                className="border-primary/20 bg-background/60"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateWorkspace(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                {t("team.create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invite member */}
      <Dialog open={showInviteMember} onOpenChange={setShowInviteMember}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {t("team.inviteNewMember")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={inviteMember} className="space-y-4">
            <div>
              <Label>{t("email")}</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                required
                className="border-primary/20 bg-background/60"
              />
            </div>
            <div>
              <Label>{t("team.role")}</Label>
              <Select
                value={inviteForm.role}
                onValueChange={(value: any) => setInviteForm({ ...inviteForm, role: value })}
              >
                <SelectTrigger className="border-primary/20 bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">{t("team.viewer")}</SelectItem>
                  <SelectItem value="editor">{t("team.editor")}</SelectItem>
                  <SelectItem value="admin">{t("team.admin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowInviteMember(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                {t("team.sendInvite")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create task */}
      <Dialog open={showCreateTask} onOpenChange={setShowCreateTask}>
        <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {t("team.createTask")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={createTask} className="space-y-4">
            <div>
              <Label>{t("team.taskTitle")}</Label>
              <Input
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                required
                className="border-primary/20 bg-background/60"
              />
            </div>
            <div>
              <Label>{t("team.description")}</Label>
              <Textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                className="border-primary/20 bg-background/60"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("team.priority")}</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(value: any) => setTaskForm({ ...taskForm, priority: value })}
                >
                  <SelectTrigger className="border-primary/20 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("team.low")}</SelectItem>
                    <SelectItem value="medium">{t("team.medium")}</SelectItem>
                    <SelectItem value="high">{t("team.high")}</SelectItem>
                    <SelectItem value="urgent">{t("team.urgent")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("team.dueDate")}</Label>
                <Input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                  className="border-primary/20 bg-background/60"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateTask(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                {t("team.create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
