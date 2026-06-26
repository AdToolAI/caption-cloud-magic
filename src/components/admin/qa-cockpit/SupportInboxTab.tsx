import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Inbox, Sparkles, Send, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const SEV: Record<string, string> = {
  blocking: "bg-red-500/20 text-red-300 border-red-500/40",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  normal: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  low: "bg-slate-500/20 text-slate-300 border-slate-500/40",
};

const STATUS: Record<string, string> = {
  open: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  in_progress: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  waiting: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  resolved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

export function SupportInboxTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"open" | "in_progress" | "resolved" | "all">("open");
  const [selected, setSelected] = useState<any | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  const tickets = useQuery({
    queryKey: ["support-tickets", filter],
    queryFn: async () => {
      let q = supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (filter !== "all") q = q.eq("status", filter);
      const { data } = await q;
      return data ?? [];
    },
    refetchInterval: 8000,
  });

  const retriage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke("triage-support-ticket", {
        body: { ticket_id: id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("KI-Triage neu gestartet");
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (e: any) => toast.error(`Fehler: ${e?.message ?? String(e)}`),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.status === "resolved"
          ? "Ticket auf 'resolved' gesetzt — Kunde wird automatisch benachrichtigt"
          : `Status: ${vars.status}`
      );
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      if (selected?.id === vars.id) setSelected({ ...selected, status: vars.status });
    },
    onError: (e: any) => toast.error(`Fehler: ${e?.message ?? String(e)}`),
  });

  const counts = (tickets.data ?? []).reduce(
    (acc, t: any) => {
      acc.total++;
      if (t.status === "open") acc.open++;
      if (t.ai_analyzed_at) acc.triaged++;
      return acc;
    },
    { total: 0, open: 0, triaged: 0 }
  );

  return (
    <div className="grid lg:grid-cols-[420px_1fr] gap-4 mt-4">
      {/* List */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Inbox className="h-4 w-4 text-[#F5C76A]" />
          <h3 className="font-semibold text-[#F5C76A]">Support Inbox</h3>
          <Badge variant="outline" className="ml-auto text-xs">
            {counts.open} offen · {counts.triaged} triagiert
          </Badge>
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["open", "in_progress", "resolved", "all"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="h-7 text-xs"
            >
              {f}
            </Button>
          ))}
        </div>

        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          {tickets.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {(tickets.data ?? []).map((t: any) => {
            const sev = t.ai_severity ?? t.severity ?? "normal";
            return (
              <Card
                key={t.id}
                onClick={() => {
                  setSelected(t);
                  setReplyDraft(t.ai_suggested_reply ?? "");
                }}
                className={`cursor-pointer bg-[#0A0F1F]/80 border-[#F5C76A]/10 hover:border-[#F5C76A]/40 transition ${
                  selected?.id === t.id ? "border-[#F5C76A]/60" : ""
                }`}
              >
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge className={SEV[sev]}>{sev}</Badge>
                    <Badge className={STATUS[t.status] ?? ""}>{t.status}</Badge>
                    {t.ai_analyzed_at && (
                      <Badge variant="outline" className="text-[10px]">
                        <Sparkles className="h-2.5 w-2.5 mr-1" />
                        AI · {Math.round((t.ai_confidence ?? 0) * 100)}%
                      </Badge>
                    )}
                    {t.linked_incident_id && (
                      <Badge variant="outline" className="text-[10px] text-amber-300">
                        🔗 incident
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="text-sm font-medium truncate">{t.subject}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.contact_email ?? "—"} · {t.affected_module ?? "—"}
                  </div>
                  {t.ai_eta_hours && (
                    <div className="text-[11px] text-[#F5C76A] mt-1">
                      ETA ~{t.ai_eta_hours}h
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {tickets.data?.length === 0 && (
            <p className="text-xs text-muted-foreground py-8 text-center">
              Keine Tickets in "{filter}"
            </p>
          )}
        </div>
      </div>

      {/* Detail */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
        <CardContent className="pt-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              Wähle ein Ticket aus der Liste
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold">{selected.subject}</h3>
                  <p className="text-xs text-muted-foreground">
                    #{selected.id.slice(0, 8)} · {selected.contact_email ?? "—"} ·{" "}
                    {selected.affected_module ?? "—"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => retriage.mutate(selected.id)}
                  disabled={retriage.isPending}
                >
                  {retriage.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  )}
                  Re-Triage
                </Button>
              </div>

              {selected.ai_analyzed_at ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <Field label="Kategorie" value={selected.ai_category} />
                    <Field label="Severity" value={selected.ai_severity} />
                    <Field label="ETA" value={`${selected.ai_eta_hours}h`} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">
                      Root-Cause-Hypothese (AI)
                    </div>
                    <div className="text-sm bg-black/40 border border-[#F5C76A]/10 rounded p-3 whitespace-pre-wrap">
                      {selected.ai_root_cause}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-1 flex items-center gap-2">
                      <Sparkles className="h-3 w-3" />
                      Vorgeschlagene Antwort ({selected.ai_language ?? "en"})
                    </div>
                    <Textarea
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      className="min-h-[140px] bg-black/40 text-sm"
                    />
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(replyDraft);
                          toast.success("In Zwischenablage kopiert");
                        }}
                      >
                        Kopieren
                      </Button>
                      <a
                        href={`mailto:${selected.contact_email}?subject=${encodeURIComponent(
                          "Re: " + selected.subject
                        )}&body=${encodeURIComponent(replyDraft)}`}
                      >
                        <Button size="sm" variant="default">
                          <Send className="h-3.5 w-3.5 mr-1" /> Im Mailclient öffnen
                        </Button>
                      </a>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground bg-black/30 p-3 rounded">
                  <Loader2 className="h-3 w-3 animate-spin inline mr-2" />
                  KI-Triage läuft noch… (~10–20s nach Ticket-Erstellung)
                </div>
              )}

              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">
                  Original-Beschreibung
                </div>
                <div className="text-sm bg-black/30 border border-white/5 rounded p-3 whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {selected.description ?? "—"}
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-white/5 flex-wrap">
                {selected.status !== "in_progress" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateStatus.mutate({ id: selected.id, status: "in_progress" })
                    }
                  >
                    In Bearbeitung
                  </Button>
                )}
                {selected.status !== "resolved" && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() =>
                      updateStatus.mutate({ id: selected.id, status: "resolved" })
                    }
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Als gelöst markieren (Kunde wird informiert)
                  </Button>
                )}
                {selected.resolved_notification_sent_at && (
                  <Badge variant="outline" className="text-emerald-300 text-xs">
                    ✓ Resolved-Mail gesendet
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-black/30 border border-white/5 rounded p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}
