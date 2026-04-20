import { Card } from '@/components/ui/card';
import { Mail, Ban, AlertTriangle, TrendingDown } from 'lucide-react';

interface Props {
  sent: number;
  suppressed: number;
  failed: number;
  bouncesComplaints: number;
  bounceRate: number;
}

export function EmailKpiCards({ sent, suppressed, failed, bouncesComplaints, bounceRate }: Props) {
  const rateColor =
    bounceRate < 2
      ? 'text-emerald-400'
      : bounceRate < 5
      ? 'text-amber-400'
      : 'text-rose-400';

  const items = [
    { label: 'Versendet', value: sent, icon: Mail, accent: 'text-emerald-400', ring: 'ring-emerald-400/20' },
    { label: 'Geblockt (Suppression)', value: suppressed, icon: Ban, accent: 'text-amber-400', ring: 'ring-amber-400/20' },
    { label: 'Fehlgeschlagen', value: failed, icon: AlertTriangle, accent: 'text-rose-400', ring: 'ring-rose-400/20' },
    { label: 'Bounces + Complaints (gesamt)', value: bouncesComplaints, icon: TrendingDown, accent: 'text-orange-400', ring: 'ring-orange-400/20' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {items.map((it) => (
        <Card key={it.label} className={`p-5 ring-1 ${it.ring} bg-card/60 backdrop-blur`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{it.label}</span>
            <it.icon className={`h-4 w-4 ${it.accent}`} />
          </div>
          <div className={`text-3xl font-bold ${it.accent}`}>{it.value.toLocaleString('de-DE')}</div>
        </Card>
      ))}
      <Card className="p-5 ring-1 ring-primary/20 bg-card/60 backdrop-blur">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Bounce-Rate</span>
          <TrendingDown className={`h-4 w-4 ${rateColor}`} />
        </div>
        <div className={`text-3xl font-bold ${rateColor}`}>{bounceRate.toFixed(2)}%</div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {bounceRate < 2 ? '✓ Industriestandard' : bounceRate < 5 ? '⚠ Beobachten' : '✗ Kritisch'}
        </p>
      </Card>
    </div>
  );
}
