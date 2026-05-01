import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, CheckCircle2, AlertTriangle, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const COMPONENTS = [
  { key: "web_app", label: "Web App & Login" },
  { key: "database", label: "Database" },
  { key: "video_rendering", label: "Video Rendering" },
  { key: "ai_generation", label: "AI Generation" },
  { key: "file_storage", label: "File Storage" },
  { key: "social_publishing", label: "Social Publishing" },
];

const SEVERITIES = [
  { value: "degraded", label: "Degraded performance" },
  { value: "partial_outage", label: "Partial outage" },
  { value: "major_outage", label: "Major outage" },
];

const STATUSES = [
  { value: "investigating", label: "Investigating" },
  { value: "identified", label: "Identified" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
];

// Pre-defined incident templates for fast publishing during real outages.
// One-click fills the form; all fields remain editable (e.g. to add a concrete ETA).
const TEMPLATES: Array<{
  id: string;
  label: string;
  title: string;
  description: string;
  severity: "degraded" | "partial_outage" | "major_outage";
  affected: string[];
}> = [
  {
    id: "replicate_outage",
    label: "Replicate (AI Video) outage",
    title: "AI video generation degraded — Replicate provider issue",
    description:
      "We're aware of elevated error rates and slower generations on AI video models hosted via Replicate (Hailuo, Seedance, Kling, HappyHorse, Wan, Pika, Vidu). Failed generations are automatically refunded. We're monitoring the upstream provider and will update as soon as the situation changes.",
    severity: "partial_outage",
    affected: ["ai_generation"],
  },
  {
    id: "lambda_render_slow",
    label: "Video rendering (Lambda) slow",
    title: "Video rendering experiencing slower-than-usual processing times",
    description:
      "Director's Cut and Composer renders may take longer than usual due to AWS Lambda concurrency limits. All renders will complete; failed renders are automatically refunded. We're scaling capacity now.",
    severity: "degraded",
    affected: ["video_rendering"],
  },
  {
    id: "social_publishing_degraded",
    label: "Social publishing degraded",
    title: "Social publishing temporarily affected (Meta / TikTok / X)",
    description:
      "Some scheduled posts may be delayed or fail to publish due to upstream API issues at one or more social platforms. Posts will be retried automatically. We recommend keeping drafts saved.",
    severity: "degraded",
    affected: ["social_publishing"],
  },
  {
    id: "scheduled_maintenance",
    label: "Scheduled maintenance",
    title: "Scheduled maintenance window",
    description:
      "We're performing scheduled maintenance to improve performance and reliability. Brief interruptions to video rendering and AI generation may occur. No data will be lost; in-flight jobs will resume automatically.",
    severity: "degraded",
    affected: ["video_rendering", "ai_generation"],
  },
  {
    id: "major_db_outage",
    label: "Major outage (DB / Auth)",
    title: "Service disruption — login and data access affected",
    description:
      "We're investigating a service disruption affecting login, dashboard access, and saved projects. Our team has been alerted and is actively working on a fix. No data is at risk. We'll update this incident every 15 minutes.",
    severity: "major_outage",
    affected: ["web_app", "database"],
  },
];

interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  affected_components: string[];
  started_at: string;
  resolved_at: string | null;
}

export function IncidentManager() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "degraded",
    affected: [] as string[],
  });

  const { data: incidents, isLoading } = useQuery<Incident[]>({
    queryKey: ["status-incidents-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("status_incidents")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Incident[];
    },
    refetchInterval: 30_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required");
      if (form.affected.length === 0) throw new Error("Select at least one component");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("status_incidents").insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        severity: form.severity,
        affected_components: form.affected,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Incident published");
      setForm({ title: "", description: "", severity: "degraded", affected: [] });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["status-incidents-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, resolve }: { id: string; status: string; resolve?: boolean }) => {
      const patch: Record<string, unknown> = { status };
      if (resolve) patch.resolved_at = new Date().toISOString();
      const { error } = await supabase.from("status_incidents").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["status-incidents-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const active = (incidents ?? []).filter((i) => !i.resolved_at);
  const past = (incidents ?? []).filter((i) => i.resolved_at);

  const sevColor = (s: string) =>
    s === "major_outage"
      ? "destructive"
      : s === "partial_outage"
      ? "default"
      : "secondary";

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Status Incidents</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Manually publish incidents to <code className="text-[#F5C76A]">/status</code> for
              external provider outages (Replicate, HeyGen, Meta, etc.).
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> New incident
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Publish a new incident</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    placeholder="e.g. Replicate API degraded"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Textarea
                    placeholder="What's affected? What are we doing about it?"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Severity</Label>
                  <Select
                    value={form.severity}
                    onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Affected components</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {COMPONENTS.map((c) => (
                      <label
                        key={c.key}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={form.affected.includes(c.key)}
                          onCheckedChange={(checked) => {
                            setForm((f) => ({
                              ...f,
                              affected: checked
                                ? [...f.affected, c.key]
                                : f.affected.filter((k) => k !== c.key),
                            }));
                          }}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Publish
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Active ({active.length})
                </div>
                {active.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    No active incidents.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {active.map((i) => (
                      <li
                        key={i.id}
                        className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3"
                      >
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex items-start gap-2 min-w-0">
                            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-sm">{i.title}</div>
                              {i.description && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {i.description}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1 mt-2">
                                <Badge variant={sevColor(i.severity)} className="text-[10px]">
                                  {i.severity.replace("_", " ")}
                                </Badge>
                                {i.affected_components.map((c) => (
                                  <Badge key={c} variant="outline" className="text-[10px]">
                                    {COMPONENTS.find((x) => x.key === c)?.label ?? c}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(i.started_at), { addSuffix: true })}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <Select
                            value={i.status}
                            onValueChange={(v) =>
                              updateStatus.mutate({ id: i.id, status: v })
                            }
                          >
                            <SelectTrigger className="h-8 w-[160px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.filter((s) => s.value !== "resolved").map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateStatus.mutate({
                                id: i.id,
                                status: "resolved",
                                resolve: true,
                              })
                            }
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolve
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {past.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    Past ({past.length})
                  </div>
                  <ul className="space-y-1.5">
                    {past.slice(0, 10).map((i) => (
                      <li
                        key={i.id}
                        className="text-sm flex items-center justify-between border-b border-white/5 py-1.5"
                      >
                        <span className="truncate">{i.title}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                          {new Date(i.started_at).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
