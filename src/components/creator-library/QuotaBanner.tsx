import { tx } from '@/lib/i18nText';
/**
 * QuotaBanner — Creator-Library plan/quota indicator.
 * Shows "Inklusive" for paid plans, monthly-counter for Free.
 */
import { Link } from 'react-router-dom';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useDownloadQuota } from '@/hooks/useDownloadQuota';

export default function QuotaBanner() {
  const q = useDownloadQuota();
  if (q.loading) return null;

  if (q.unlimited) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-amber-500/5 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span className="text-emerald-200">
            {tx({ de: 'Creator Library:', en: 'Creator Library:', es: 'Creator Library:' })} <strong>{tx({ de: 'unlimited inklusive', en: 'unlimited included', es: 'ilimitado incluido' })}</strong> {tx({ de: 'in deinem', en: 'in your', es: 'en tu' })} {q.plan}-{tx({ de: 'Plan', en: 'plan', es: 'plan' })}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {tx({ de: "vergleichbar mit Artlist €30/mo", en: "comparable to Artlist €30/mo", es: "comparable a Artlist €30/mes" })}
        </span>
      </div>
    );
  }

  const pct = Math.min(100, (q.used / q.limit) * 100);
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-amber-200">
          Free-Plan: <strong>{q.used} / {q.limit}</strong> {tx({ de: "Downloads diesen Monat", en: "downloads this month", es: "descargas este mes" })}
        </span>
        <Button asChild size="sm" variant="outline" className="h-7">
          <Link to="/pricing">
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Unlimited freischalten
          </Link>
        </Button>
      </div>
      <Progress value={pct} className="h-1.5" />
      {q.exceeded && (
        <p className="text-[11px] text-amber-300">
          {tx({ de: "Monatslimit erreicht — Upgrade auf einen Paid-Plan für unbegrenzte Downloads.", en: "Monthly limit reached — Upgrade to a paid plan for unlimited downloads.", es: "Límite mensual alcanzado — Actualiza a un plan de pago para descargas ilimitadas." })}
        </p>
      )}
    </div>
  );
}
