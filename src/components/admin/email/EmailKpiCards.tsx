import { tx } from '@/lib/i18nText';
import { Card } from '@/components/ui/card';
import { Mail, Ban, AlertTriangle, TrendingDown, ShieldAlert, UserMinus, FlaskConical } from 'lucide-react';

interface Props {
  sent: number;
  suppressed: number;
  failed: number;
  realBounces: number;
  complaints: number;
  unsubscribes: number;
  testBounces: number;
  bounceRate: number;
}

export function EmailKpiCards({
  sent,
  suppressed,
  failed,
  realBounces,
  complaints,
  unsubscribes,
  testBounces,
  bounceRate,
}: Props) {
  const rateColor =
    bounceRate < 2
      ? 'text-emerald-400'
      : bounceRate < 5
      ? 'text-amber-400'
      : 'text-rose-400';

  const items = [
    { label: tx({ de: 'Versendet', en: 'Sent', es: 'Enviado' }), value: sent, icon: Mail, accent: 'text-emerald-400', ring: 'ring-emerald-400/20' },
    { label: tx({ de: 'Geblockt (Suppression)', en: 'Blocked (Suppression)', es: 'Bloqueado (Supresión)' }), value: suppressed, icon: Ban, accent: 'text-amber-400', ring: 'ring-amber-400/20' },
    { label: tx({ de: 'Fehlgeschlagen', en: 'Failed', es: 'Fallido' }), value: failed, icon: AlertTriangle, accent: 'text-rose-400', ring: 'ring-rose-400/20' },
    { label: tx({ de: 'Echte Bounces', en: 'Real Bounces', es: 'Rebotes reales' }), value: realBounces, icon: TrendingDown, accent: 'text-rose-400', ring: 'ring-rose-400/20' },
    { label: tx({ de: 'Complaints (Spam)', en: 'Complaints (Spam)', es: 'Quejas (Spam)' }), value: complaints, icon: ShieldAlert, accent: 'text-orange-400', ring: 'ring-orange-400/20' },
    { label: tx({ de: 'Unsubscribes', en: 'Unsubscribes', es: 'Bajas' }), value: unsubscribes, icon: UserMinus, accent: 'text-blue-400', ring: 'ring-blue-400/20' },
    { label: tx({ de: 'Test-Bounces', en: 'Test Bounces', es: 'Rebotes de prueba' }), value: testBounces, icon: FlaskConical, accent: 'text-muted-foreground', ring: 'ring-border' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((it) => (
        <Card key={it.label} className={`p-5 ring-1 ${it.ring} bg-card/60 backdrop-blur`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{it.label}</span>
            <it.icon className={`h-4 w-4 ${it.accent}`} />
          </div>
          <div className={`text-3xl font-bold ${it.accent}`}>{it.value.toLocaleString('de-DE')}</div>
          {it.label === 'Test-Bounces' && it.value > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">{tx({ de: 'Resend-Testadressen (ignoriert)', en: 'Resend test addresses (ignored)', es: 'Reenviar direcciones de prueba (ignoradas)' })}</p>
          )}
        </Card>
      ))}
      <Card className="p-5 ring-1 ring-primary/20 bg-card/60 backdrop-blur">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{tx({ de: 'Bounce-Rate (echt)', en: 'Bounce Rate (real)', es: 'Tasa de rebote (real)' })}</span>
          <TrendingDown className={`h-4 w-4 ${rateColor}`} />
        </div>
        <div className={`text-3xl font-bold ${rateColor}`}>{bounceRate.toFixed(2)}%</div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {bounceRate < 2 ? tx({ de: '✓ Industriestandard', en: '✓ Industry standard', es: '✓ Estándar de la industria' }) : bounceRate < 5 ? tx({ de: '⚠ Beobachten', en: '⚠ Monitor', es: '⚠ Monitorear' }) : tx({ de: '✗ Kritisch', en: '✗ Critical', es: '✗ Crítico' })}
          {tx({ de: ' · ohne Test-Adressen', en: ' · without test addresses', es: ' · sin direcciones de prueba' })}
        </p>
      </Card>
    </div>
  );
}
