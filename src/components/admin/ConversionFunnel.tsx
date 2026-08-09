import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDown, ArrowUp, Clock, Mail, Minus, Sparkles, TrendingUp, Users, Video } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { tx } from "@/lib/i18nText";

interface FunnelData {
  period_days: number;
  signups: number;
  verified: number;
  first_video: number;
  paid: number;
  prev_signups: number;
  prev_verified: number;
  prev_first_video: number;
  prev_paid: number;
  avg_hours_to_verify: number;
  avg_hours_to_first_video: number;
  reminders_sent: number;
  reminders_converted: number;
}

const formatHours = (h: number): string => {
  if (!h || h <= 0) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
};

const Delta = ({ current, previous, isPP = false }: { current: number; previous: number; isPP?: boolean }) => {
  const diff = isPP ? current - previous : current - previous;
  if (Math.abs(diff) < 0.05) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> 0{isPP ? "pp" : ""}
      </span>
    );
  }
  const positive = diff > 0;
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-success" : "text-destructive"}`}>
      <Icon className="h-3 w-3" />
      {positive ? "+" : ""}{isPP ? `${diff.toFixed(1)}pp` : Math.round(diff)}
    </span>
  );
};

const StageCard = ({
  icon: Icon,
  label,
  value,
  rate,
  prevValue,
  prevRate,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  rate?: number;
  prevValue: number;
  prevRate?: number;
  accent: string;
}) => (
  <Card className="relative overflow-hidden p-6 bg-gradient-to-br from-card to-card/60 border-border/50">
    <div
      className="absolute top-0 right-0 h-32 w-32 rounded-full blur-3xl opacity-20"
      style={{ background: accent }}
    />
    <div className="relative">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-lg bg-background/40">
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-4xl font-bold tracking-tight">{value}</span>
        {rate !== undefined && (
          <span className="text-sm text-muted-foreground">({rate.toFixed(1)}%)</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Delta current={value} previous={prevValue} />
        {rate !== undefined && prevRate !== undefined && (
          <>
            <span className="opacity-30">•</span>
            <Delta current={rate} previous={prevRate} isPP />
          </>
        )}
        <span className="opacity-50">vs. prev</span>
      </div>
    </div>
  </Card>
);

export function ConversionFunnel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (supabase.rpc as any)("get_conversion_funnel", { days })
      .then(({ data, error }: { data: FunnelData | null; error: any }) => {
        if (!active) return;
        if (error) {
          console.error("[ConversionFunnel] RPC error:", error);
        } else {
          setData(data);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [days]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return <Card className="p-6"><p className="text-muted-foreground">{tx({ de: "Keine Daten verfügbar.", en: "No data available.", es: "No hay datos disponibles." })}</p></Card>;
  }

  const verifyRate = data.signups > 0 ? (data.verified / data.signups) * 100 : 0;
  const videoRate = data.verified > 0 ? (data.first_video / data.verified) * 100 : 0;
  const paidRate = data.first_video > 0 ? (data.paid / data.first_video) * 100 : 0;
  const prevVerifyRate = data.prev_signups > 0 ? (data.prev_verified / data.prev_signups) * 100 : 0;
  const prevVideoRate = data.prev_verified > 0 ? (data.prev_first_video / data.prev_verified) * 100 : 0;
  const prevPaidRate = data.prev_first_video > 0 ? (data.prev_paid / data.prev_first_video) * 100 : 0;
  const reminderRate = data.reminders_sent > 0 ? (data.reminders_converted / data.reminders_sent) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Period filter */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Conversion Funnel</h2>
          <p className="text-sm text-muted-foreground">Signup → Verify → 1. Video → Upgrade</p>
        </div>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            <TabsTrigger value="1">{tx({ de: "Heute", en: "Today", es: "Hoy" })}</TabsTrigger>
            <TabsTrigger value="7">{tx({ de: "7 Tage", en: "7 days", es: "7 días" })}</TabsTrigger>
            <TabsTrigger value="30">{tx({ de: "30 Tage", en: "30 days", es: "30 días" })}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Funnel grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StageCard
          icon={Users}
          label="Signups"
          value={data.signups}
          prevValue={data.prev_signups}
          accent="hsl(220, 80%, 55%)"
        />
        <StageCard
          icon={Mail}
          label={tx({ de: "Verifiziert", en: "Verified", es: "Verificado" })}
          value={data.verified}
          rate={verifyRate}
          prevValue={data.prev_verified}
          prevRate={prevVerifyRate}
          accent="hsl(45, 90%, 55%)"
        />
        <StageCard
          icon={Video}
          label={tx({ de: "1. Video", en: "1st video", es: "1.º video" })}
          value={data.first_video}
          rate={videoRate}
          prevValue={data.prev_first_video}
          prevRate={prevVideoRate}
          accent="hsl(280, 70%, 55%)"
        />
        <StageCard
          icon={Sparkles}
          label={tx({ de: "Upgrade Paid", en: "Upgrade Paid", es: "Upgrade de pago" })}
          value={data.paid}
          rate={paidRate}
          prevValue={data.prev_paid}
          prevRate={prevPaidRate}
          accent="hsl(150, 70%, 50%)"
        />
      </div>

      {/* Time-to metrics + reminder effectiveness */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-background/40">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              tx({ de: "Ø Zeit bis Bestätigung", en: "Avg. time to verify", es: "Tiempo promedio de verificación" })
            </span>
          </div>
          <div className="text-3xl font-bold">{formatHours(data.avg_hours_to_verify)}</div>
          <p className="text-xs text-muted-foreground mt-2">
            {data.avg_hours_to_verify < 1
              ? "tx({ de: "🎉 Blitzschnell", en: "🎉 Lightning fast", es: "🎉 Muy rápido" })"
              : data.avg_hours_to_verify < 6
              ? "tx({ de: "✅ Sehr gut", en: "✅ Very good", es: "✅ Muy bueno" })"
              : data.avg_hours_to_verify < 24
              ? "tx({ de: "👍 Solide", en: "👍 Solid", es: "👍 Sólido" })"
              : "tx({ de: "⚠️ Verbesserungspotenzial", en: "⚠️ Potential for improvement", es: "⚠️ Potencial de mejora" })"}
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-background/40">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              tx({ de: "Ø Verify → 1. Video", en: "Avg. Verify → 1st Video", es: "Promedio Verificación → 1.er Video" })
            </span>
          </div>
          <div className="text-3xl font-bold">{formatHours(data.avg_hours_to_first_video)}</div>
          <p className="text-xs text-muted-foreground mt-2">
            {data.avg_hours_to_first_video < 1
              ? "tx({ de: "🎉 Sofort-Aktivierung", en: "🎉 Immediate Activation", es: "🎉 Activación inmediata" })"
              : data.avg_hours_to_first_video < 24
              ? "tx({ de: "✅ Same-day Activation", en: "✅ Same-day Activation", es: "✅ Activación en el mismo día" })"
              : "tx({ de: "⚠️ Onboarding straffen", en: "⚠️ Streamline onboarding", es: "⚠️ Optimizar el proceso de incorporación" })"}
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-background/40">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              tx({ de: "Reminder-Wirksamkeit", en: "Reminder effectiveness", es: "Eficacia de los recordatorios" })
            </span>
          </div>
          <div className="text-3xl font-bold">
            {data.reminders_converted}
            <span className="text-base text-muted-foreground font-normal"> / {data.reminders_sent}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {data.reminders_sent === 0
              ? tx({ de: "Noch keine Reminder versendet", en: "No reminders sent yet", es: "Aún no se han enviado recordatorios" })
              : tx({ de: `${reminderRate.toFixed(1)}% verifizierten nach Reminder`, en: `${reminderRate.toFixed(1)}% verified after reminder`, es: `${reminderRate.toFixed(1)}% verificado tras recordatorio` })}
          </p>
        </Card>
      </div>
    </div>
  );
}
