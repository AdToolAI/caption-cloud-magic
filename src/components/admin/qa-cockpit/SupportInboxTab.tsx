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
import { useTx } from "@/lib/i18nText";

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
  const tx = useTx();
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
      toast.success(tx({ de: "KI-Triage neu gestartet", en: "AI triage restarted", es: "Triaje de IA reiniciado" }));
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (e: any) => toast.error(`${tx({ de: "Fehler", en: "Error", es: "Error" })}: ${e?.message ?? String(e)}`),
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
          ? tx({ de: "Ticket auf 'resolved' gesetzt — Kunde wird automatisch benachrichtigt", en: "Ticket set to 'resolved' — customer is notified automatically", es: "Ticket marcado como 'resuelto' — el cliente será notificado automáticamente" })
          : `${tx({ de: "Status", en: "Status", es: "Estado" })}: ${vars.status}`
      );
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      if (selected?.id === vars.id) setSelected({ ...selected, status: vars.status });
    },
    onError: (e: any) => toast.error(`${tx({ de: "Fehler", en: "Error", es: "Error" })}: ${e?.message ?? String(e)}`),
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
          <h3 className="font-semibold text-[#F5C76A]">{tx({ de: "Support Inbox", en: "Support inbox", es: "Bandeja de soporte" })}</h3>
          <Badge variant="outline" className="ml-auto text-xs">
            {counts.open} {tx({ de: "offen", en: "open", es: "abiertos" })} · {counts.triaged} {tx({ de: "triagiert", en: "triaged", es: "triados" })}
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
                    {Array.isArray((t as Record<string, unknown>).attachments) &&
                      ((t as Record<string, unknown>).attachments as Array<{ type?: string }>).some(
                        (a) => (a?.type || "").startsWith("image/") || (a?.type || "").startsWith("video/")
                      ) && (
                        <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-500/40">
                          📎 evidence
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
              {tx({ de: "Keine Tickets in", en: "No tickets in", es: "Sin tickets en" })} "{filter}"
            </p>
          )}
        </div>
      </div>

      {/* Detail */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
        <CardContent className="pt-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              {tx({ de: "Wähle ein Ticket aus der Liste", en: "Select a ticket from the list", es: "Selecciona un ticket de la lista" })}
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
                  {tx({ de: "Re-Triage", en: "Re-triage", es: "Retriaje" })}
                </Button>
              </div>

              {selected.ai_analyzed_at ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <Field label={tx({ de: "Kategorie", en: "Category", es: "Categoría" })} value={selected.ai_category} />
                    <Field label="Severity" value={selected.ai_severity} />
                    <Field label="ETA" value={`${selected.ai_eta_hours}h`} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">
                      {tx({ de: "Root-Cause-Hypothese (AI)", en: "Root-cause hypothesis (AI)", es: "Hipótesis de causa raíz (IA)" })}
                    </div>
                    <div className="text-sm bg-black/40 border border-[#F5C76A]/10 rounded p-3 whitespace-pre-wrap">
                      {selected.ai_root_cause}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-1 flex items-center gap-2">
                      <Sparkles className="h-3 w-3" />
                      {tx({ de: "Vorgeschlagene Antwort", en: "Suggested reply", es: "Respuesta sugerida" })} ({selected.ai_language ?? "en"})
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
                          toast.success(tx({ de: "In Zwischenablage kopiert", en: "Copied to clipboard", es: "Copiado al portapapeles" }));
                        }}
                      >
                        {tx({ de: "Kopieren", en: "Copy", es: "Copiar" })}
                      </Button>
                      <a
                        href={`mailto:${selected.contact_email}?subject=${encodeURIComponent(
                          "Re: " + selected.subject
                        )}&body=${encodeURIComponent(replyDraft)}`}
                      >
                        <Button size="sm" variant="default">
                          <Send className="h-3.5 w-3.5 mr-1" /> {tx({ de: "Im Mailclient öffnen", en: "Open in mail client", es: "Abrir en el cliente de correo" })}
                        </Button>
                      </a>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground bg-black/30 p-3 rounded">
                  <Loader2 className="h-3 w-3 animate-spin inline mr-2" />
                  {tx({ de: "KI-Triage läuft noch… (~10–20s nach Ticket-Erstellung)", en: "AI triage still running… (~10–20s after ticket creation)", es: "El triaje de IA sigue en curso… (~10–20s tras la creación del ticket)" })}
                </div>
              )}

              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">
                  {tx({ de: "Original-Beschreibung", en: "Original description", es: "Descripción original" })}
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
                    {tx({ de: "In Bearbeitung", en: "In progress", es: "En proceso" })}
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
                    {tx({ de: "Als gelöst markieren (Kunde wird informiert)", en: "Mark as resolved (customer will be notified)", es: "Marcar como resuelto (se notificará al cliente)" })}
                  </Button>
                )}
                {selected.resolved_notification_sent_at && (
                  <Badge variant="outline" className="text-emerald-300 text-xs">
                    ✓ {tx({ de: "Resolved-Mail gesendet", en: "Resolved email sent", es: "Correo de resolución enviado" })}
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
