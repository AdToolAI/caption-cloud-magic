import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingDown, Sparkles, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * CostComparisonWidget
 * -------------------------------------------------------
 * Visualisiert den Preisvorteil unserer pay-per-second Engine
 * gegenüber typischen Subscription-basierten Markt-Angeboten —
 * bewusst OHNE Konkurrenten beim Namen zu nennen
 * ("Markt-Subscription Ø" statt Brand-Name).
 *
 * Datenbasis:
 *   - Eigener Spend: ai_video_transactions (deduction, letzte 30 Tage)
 *   - Wallet-Balance: ai_video_wallets
 *   - Markt-Referenz: pauschal 199 € / Monat (Ø Mid-Tier Subscription)
 */

const MARKET_REFERENCE_EUR_PER_MONTH = 199; // generischer Mid-Tier Branchenwert

interface SpendStats {
  spentLast30: number;
  generations: number;
  avgPerGeneration: number;
}

export function CostComparisonWidget() {
  const { user } = useAuth();
  const { wallet, loading: walletLoading } = useAIVideoWallet();
  const [stats, setStats] = useState<SpendStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        setStats({ spentLast30: 0, generations: 0, avgPerGeneration: 0 });
        setLoading(false);
        return;
      }
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data, error } = await supabase
        .from('ai_video_transactions')
        .select('amount_euros, type, created_at')
        .eq('user_id', user.id)
        .eq('type', 'deduction')
        .gte('created_at', since.toISOString());

      if (!cancelled) {
        if (!error && data) {
          // Deduction-Beträge sind negativ → absolute Summe
          const spent = data.reduce((sum, t) => sum + Math.abs(Number(t.amount_euros) || 0), 0);
          const count = data.length;
          setStats({
            spentLast30: spent,
            generations: count,
            avgPerGeneration: count > 0 ? spent / count : 0,
          });
        } else {
          setStats({ spentLast30: 0, generations: 0, avgPerGeneration: 0 });
        }
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const symbol = wallet?.currency === 'USD' ? '$' : '€';
  const fmt = (v: number) => `${symbol}${v.toFixed(2)}`;

  const { savings, savingsPercent, multiplier } = useMemo(() => {
    if (!stats) return { savings: 0, savingsPercent: 0, multiplier: 0 };
    const market = MARKET_REFERENCE_EUR_PER_MONTH;
    const ours = stats.spentLast30;
    const sav = Math.max(0, market - ours);
    const pct = market > 0 ? Math.min(100, (sav / market) * 100) : 0;
    const mult = ours > 0 ? market / ours : 0;
    return { savings: sav, savingsPercent: pct, multiplier: mult };
  }, [stats]);

  const isLoading = loading || walletLoading;

  return (
    <Card className="relative overflow-hidden p-6 backdrop-blur-xl bg-card/60 border-border/50">
      {/* Decorative gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/5 pointer-events-none" />

      <div className="relative space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold leading-tight">Preisvorteil</h3>
              <p className="text-xs text-muted-foreground">Letzte 30 Tage · Pay-per-Use</p>
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground/70 hover:text-foreground transition-colors"
                  aria-label="Berechnungs-Info"
                >
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs text-xs">
                Vergleich gegen einen typischen Mid-Tier Markt-Wert von ca.{' '}
                {symbol}
                {MARKET_REFERENCE_EUR_PER_MONTH}/Monat für vergleichbare KI-Video-Suiten.
                Du zahlst nur, was du wirklich generierst – kein Abo, keine Mindestlaufzeit.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Hero stat: Savings */}
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {fmt(savings)}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                gespart
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              vs. typisches Markt-Abo ({fmt(MARKET_REFERENCE_EUR_PER_MONTH)}/Monat)
            </p>
          </div>
        )}

        {/* Visual comparison bars */}
        {!isLoading && stats && (
          <div className="space-y-3 pt-1">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                  Markt-Subscription Ø
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {fmt(MARKET_REFERENCE_EUR_PER_MONTH)}
                </span>
              </div>
              <Progress value={100} className="h-1.5 [&>div]:bg-muted-foreground/40" />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Dein tatsächlicher Spend
                </span>
                <span className="tabular-nums font-medium">{fmt(stats.spentLast30)}</span>
              </div>
              <Progress
                value={
                  MARKET_REFERENCE_EUR_PER_MONTH > 0
                    ? Math.min(100, (stats.spentLast30 / MARKET_REFERENCE_EUR_PER_MONTH) * 100)
                    : 0
                }
                className="h-1.5"
              />
            </div>
          </div>
        )}

        {/* Bottom stats grid */}
        {!isLoading && stats && (
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/50">
            <div>
              <div className="text-lg font-semibold tabular-nums">
                {multiplier > 0 ? `${multiplier.toFixed(1)}×` : '—'}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                günstiger
              </div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums">{stats.generations}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Generationen
              </div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums">
                {stats.avgPerGeneration > 0 ? fmt(stats.avgPerGeneration) : '—'}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Ø / Video
              </div>
            </div>
          </div>
        )}

        {/* CTA hint when no spend yet */}
        {!isLoading && stats && stats.generations === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md p-3">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>
              Noch keine Generationen in den letzten 30 Tagen – starte ein Projekt, um deine
              Ersparnis live zu sehen.
            </span>
          </div>
        )}

        {/* Savings percent visual */}
        {!isLoading && savingsPercent > 0 && (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Ersparnis-Quote</span>
            <span className="font-medium text-primary">{savingsPercent.toFixed(0)}%</span>
          </div>
        )}
      </div>
    </Card>
  );
}
