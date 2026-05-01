import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileQuestion } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  severity?: string;
  affected_module?: string;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  in_progress: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  resolved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  closed: "bg-white/10 text-muted-foreground border-white/20",
};

const SEV_DOT: Record<string, string> = {
  low: "bg-emerald-400",
  normal: "bg-blue-400",
  high: "bg-amber-400",
  blocking: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]",
};

const TEXT = {
  en: { title: "My tickets", empty: "You haven't submitted any tickets yet.", loading: "Loading…" },
  de: { title: "Meine Tickets", empty: "Du hast noch keine Tickets eingereicht.", loading: "Lade…" },
  es: { title: "Mis tickets", empty: "Aún no has enviado tickets.", loading: "Cargando…" },
} as const;

export function MyTicketsList({ userId }: { userId: string }) {
  const { language } = useTranslation();
  const t = TEXT[(language as keyof typeof TEXT)] || TEXT.en;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("id, subject, category, status, priority, severity, affected_module, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled) {
        setTickets((data ?? []) as Ticket[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        {t.loading}
      </div>
    );
  }

  if (!tickets.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <FileQuestion className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">{t.empty}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tickets.map((tk) => (
        <div
          key={tk.id}
          className="rounded-lg border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`h-2 w-2 rounded-full ${SEV_DOT[tk.severity ?? "normal"] ?? SEV_DOT.normal}`} />
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                  {tk.affected_module ?? tk.category}
                </span>
              </div>
              <h3 className="text-sm font-medium text-foreground truncate">{tk.subject}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(tk.created_at).toLocaleString()}
              </p>
            </div>
            <span
              className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-wider border ${
                STATUS_COLOR[tk.status] ?? STATUS_COLOR.open
              }`}
            >
              {tk.status.replace("_", " ")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
