import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Pause, Play, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useEmailHealth, setMarketingPaused } from "@/hooks/useEmailHealth";
import { formatDistanceToNow } from "date-fns";

export function EmailHealthTab() {
  const { data, isLoading, refetch } = useEmailHealth();
  const [busy, setBusy] = useState(false);

  const totalSends7d = data?.byTemplate.reduce((s, t) => s + t.sends, 0) ?? 0;
  const heaviestUser = data?.topRecipients[0];
  const heavyRecipientCount = data?.topRecipients.filter((r) => r.sends > 4).length ?? 0;

  async function togglePause() {
    setBusy(true);
    try {
      await setMarketingPaused(!data?.marketingPaused);
      toast.success(data?.marketingPaused ? "Marketing emails resumed" : "Marketing emails paused");
      await refetch();
    } catch (e: any) {
      toast.error("Failed: " + (e?.message ?? "unknown"));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#F5C76A]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Global kill-switch */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/20">
        <CardContent className="pt-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className={`w-5 h-5 ${data?.marketingPaused ? "text-red-400" : "text-[#F5C76A]"}`} />
            <div>
              <div className="font-semibold">Global marketing kill-switch</div>
              <div className="text-xs text-muted-foreground">
                Pauses every marketing send (activation, drip, winback, trial countdown). Bypass templates (auth, trial-final-day, pre-pause, expired) still go through.
              </div>
            </div>
          </div>
          <Button
            variant={data?.marketingPaused ? "default" : "destructive"}
            disabled={busy}
            onClick={togglePause}
            className="gap-2"
          >
            {data?.marketingPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {data?.marketingPaused ? "Resume marketing" : "Pause all marketing"}
          </Button>
        </CardContent>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KPI label="Sends (last 7d)" value={String(totalSends7d)} icon={<Mail className="w-4 h-4" />} />
        <KPI
          label="Heaviest recipient"
          value={heaviestUser ? `${heaviestUser.sends} emails` : "—"}
          subtitle={heaviestUser?.email}
        />
        <KPI
          label="Users with >4 / 7d"
          value={String(heavyRecipientCount)}
          tone={heavyRecipientCount > 5 ? "warn" : "ok"}
        />
      </div>

      {/* Per template */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
        <CardHeader>
          <CardTitle className="text-base">Sends by template (deduped, 7d)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {data?.byTemplate.length === 0 && (
            <div className="text-sm text-muted-foreground">No sends recorded in the last 7 days.</div>
          )}
          {data?.byTemplate.map((t) => (
            <div
              key={t.template}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/5"
            >
              <span className="font-mono text-sm truncate">{t.template}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {t.lastSent ? formatDistanceToNow(new Date(t.lastSent), { addSuffix: true }) : "—"}
                </span>
                <Badge variant="outline">{t.sends}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Top recipients */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
        <CardHeader>
          <CardTitle className="text-base">Top 10 recipients (sanity check)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {data?.topRecipients.map((r) => (
            <div key={r.email} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/5">
              <span className="font-mono text-sm truncate">{r.email}</span>
              <Badge variant={r.sends > 4 ? "destructive" : "outline"}>{r.sends}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Trial funnel */}
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
        <CardHeader>
          <CardTitle className="text-base">Trial funnel right now</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {data?.trialFunnel.map((b) => (
            <div key={b.stage} className="border border-[#F5C76A]/10 rounded p-3">
              <div className="text-xs text-muted-foreground">{b.stage}</div>
              <div className="text-2xl font-semibold text-[#F5C76A]">{b.users}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({
  label, value, subtitle, icon, tone,
}: {
  label: string; value: string; subtitle?: string; icon?: React.ReactNode; tone?: "ok" | "warn";
}) {
  return (
    <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className={`text-2xl font-semibold mt-1 ${tone === "warn" ? "text-amber-400" : "text-[#F5C76A]"}`}>
          {value}
        </div>
        {subtitle && <div className="text-xs text-muted-foreground truncate mt-1">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}
