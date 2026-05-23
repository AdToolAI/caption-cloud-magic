import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ShieldCheck, AlertTriangle, KeyRound, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface TokenStatus {
  secret_name: string;
  last_updated_at: string;
  token_last6: string;
  is_valid: boolean;
  expires_at: string | null;
  days_remaining: number | null;
  never_expires: boolean;
  threshold_days: number;
  needs_refresh: boolean;
  scopes: string[];
  app_id_match: boolean;
}

export function MetaTokenHealthTab() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const statusQ = useQuery({
    queryKey: ["meta-token-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("auto-refresh-meta-tokens", {
        body: { mode: "status" },
      });
      if (error) throw error;
      return data as { ok: boolean; status: TokenStatus };
    },
    refetchInterval: 60_000,
  });

  const refreshM = useMutation({
    mutationFn: async (force: boolean) => {
      setRefreshing(true);
      const { data, error } = await supabase.functions.invoke("auto-refresh-meta-tokens", {
        body: { mode: "refresh", force },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.refreshed) {
        toast.success(`Token erneuert — gültig bis ${data.new_expires_at ? format(new Date(data.new_expires_at), "dd.MM.yyyy") : "∞"}`);
      } else {
        toast.info(`Kein Refresh nötig: ${data?.reason || "ok"}`);
      }
      qc.invalidateQueries({ queryKey: ["meta-token-status"] });
    },
    onError: (err: any) => toast.error(err?.message || "Refresh fehlgeschlagen"),
    onSettled: () => setRefreshing(false),
  });

  const s = statusQ.data?.status;

  const healthColor = !s
    ? "text-zinc-400"
    : !s.is_valid
    ? "text-red-400"
    : s.needs_refresh
    ? "text-amber-400"
    : "text-emerald-400";

  const healthIcon = !s
    ? <Clock className="h-5 w-5" />
    : !s.is_valid
    ? <AlertTriangle className="h-5 w-5" />
    : s.needs_refresh
    ? <AlertTriangle className="h-5 w-5" />
    : <ShieldCheck className="h-5 w-5" />;

  return (
    <div className="mt-4 space-y-4">
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/20">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-[#F5C76A]">
            <KeyRound className="h-5 w-5" />
            Meta Page Token Health
          </CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={refreshing}
              onClick={() => refreshM.mutate(false)}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Check / Refresh wenn nötig
            </Button>
            <Button
              size="sm"
              variant="default"
              disabled={refreshing}
              onClick={() => refreshM.mutate(true)}
              className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/80"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Force Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {statusQ.isLoading ? (
            <div className="text-zinc-400">Lade Status…</div>
          ) : statusQ.error ? (
            <div className="text-red-400">Fehler: {(statusQ.error as Error).message}</div>
          ) : s ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Stat label="Status">
                <span className={`flex items-center gap-2 font-medium ${healthColor}`}>
                  {healthIcon}
                  {!s.is_valid ? "Invalid" : s.needs_refresh ? "Refresh fällig" : "Gesund"}
                </span>
              </Stat>
              <Stat label="Läuft ab">
                <span className="text-white">
                  {s.never_expires ? "Nie" : s.expires_at ? format(new Date(s.expires_at), "dd.MM.yyyy HH:mm") : "—"}
                </span>
              </Stat>
              <Stat label="Restlaufzeit">
                <span className={healthColor}>
                  {s.never_expires ? "∞" : s.days_remaining !== null ? `${s.days_remaining} Tage` : "—"}
                </span>
              </Stat>
              <Stat label="Token (last 6)">
                <code className="text-xs text-zinc-300">…{s.token_last6}</code>
              </Stat>
              <Stat label="Letztes Update">
                <span className="text-zinc-300 text-sm">
                  {s.last_updated_at ? format(new Date(s.last_updated_at), "dd.MM.yyyy HH:mm") : "—"}
                </span>
              </Stat>
              <Stat label="App ID matched">
                <Badge variant={s.app_id_match ? "default" : "destructive"}>
                  {s.app_id_match ? "Ja" : "Nein"}
                </Badge>
              </Stat>
              <div className="col-span-full">
                <div className="text-xs text-zinc-500 mb-1">Scopes</div>
                <div className="flex flex-wrap gap-1">
                  {s.scopes.length ? s.scopes.map((sc) => (
                    <Badge key={sc} variant="outline" className="text-xs">{sc}</Badge>
                  )) : <span className="text-zinc-500 text-xs">keine</span>}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 text-xs text-zinc-500 border-t border-[#F5C76A]/10 pt-3">
            Cron läuft täglich um 03:00 UTC. Refresh wird ausgelöst, sobald Restlaufzeit &lt; {s?.threshold_days ?? 14} Tage.
            Bei <code>token_invalid</code> muss manuell ein neuer Short-Token im{" "}
            <code>InstagramTokenDialog</code> eingefügt werden.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}
