import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Sparkles,
  Zap,
  TrendingDown,
  AlertTriangle,
  Coins,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useRenderCostEstimation, type CostEstimation } from '@/hooks/useRenderCostEstimation';
import { useRenderEngine } from '@/hooks/useRenderEngine';
import { useCredits } from '@/hooks/useCredits';
import { useTranslation } from '@/hooks/useTranslation';
import type { ComposerScene, AssemblyConfig } from '@/types/video-composer';

interface CostEstimationPanelProps {
  scenes: ComposerScene[];
  assemblyConfig?: AssemblyConfig;
  templateId?: string;
}

type Engine = 'remotion' | 'shotstack';
type Resolution = '720p' | '1080p' | '4k';
type Complexity = 'simple' | 'medium' | 'complex';

/**
 * Cost Estimation Panel — sits in the Composer Assembly tab and shows the user
 * a live, side-by-side cost comparison between Remotion (default) and
 * Shotstack render engines. Recommends the cheaper option, lets users pick
 * their preferred engine and warns when wallet balance is too low.
 */
export default function CostEstimationPanel({
  scenes,
  assemblyConfig,
  templateId,
}: CostEstimationPanelProps) {
  const { t } = useTranslation();
  const { renderEngine, setRenderEngine } = useRenderEngine();
  const { balance, loading: walletLoading } = useCredits();
  const { loading, estimateCost, getCostBreakdown } = useRenderCostEstimation();
  const [estimation, setEstimation] = useState<CostEstimation | null>(null);
  const [errored, setErrored] = useState(false);

  // ── Derived render parameters ────────────────────────────────────────
  const durationSec = useMemo(
    () => scenes.reduce((sum, s) => sum + (s.durationSeconds || 0), 0),
    [scenes]
  );

  // ── Stock-First Savings: count scenes that use free stock instead of paid AI ─
  const stockStats = useMemo(() => {
    const stockScenes = scenes.filter(
      (s) => s.clipSource === 'stock' || s.clipSource === 'stock-image'
    );
    const stockSeconds = stockScenes.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
    // Compare against Veo 3.1 Lite 720p baseline (€0.20/s = 20 Credits/s) — the
    // cheapest paid AI scene generation. Cost-savings shown to the user.
    const SAVED_CREDITS_PER_SEC = 20;
    const savedCredits = Math.round(stockSeconds * SAVED_CREDITS_PER_SEC);
    const savedEuros = (stockSeconds * 0.2).toFixed(2);
    return {
      sceneCount: stockScenes.length,
      seconds: stockSeconds,
      savedCredits,
      savedEuros,
    };
  }, [scenes]);

  const resolution: Resolution = '1080p';

  const complexity: Complexity = useMemo(() => {
    const sceneCount = scenes.length;
    const hasGrading = !!assemblyConfig?.colorGrading && assemblyConfig.colorGrading !== 'none';
    const hasWatermark = !!assemblyConfig?.watermark?.enabled;
    const hasOverlays =
      Array.isArray(assemblyConfig?.globalTextOverlays) &&
      assemblyConfig!.globalTextOverlays!.length > 0;

    if (sceneCount > 6 || hasGrading || hasWatermark || hasOverlays) return 'complex';
    if (sceneCount >= 3) return 'medium';
    return 'simple';
  }, [scenes.length, assemblyConfig]);

  // Debounce inputs so we don't hammer the edge function on every keystroke
  const debouncedDuration = useDebounce(durationSec, 500);
  const debouncedComplexity = useDebounce(complexity, 500);

  useEffect(() => {
    if (debouncedDuration <= 0) {
      setEstimation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setErrored(false);
      const result = await estimateCost({
        durationSec: debouncedDuration,
        resolution,
        complexity: debouncedComplexity,
        templateId,
      });
      if (cancelled) return;
      if (result) {
        setEstimation(result);
      } else {
        setErrored(true);
        setEstimation(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedDuration, debouncedComplexity, resolution, templateId, estimateCost]);

  // ── Loading / empty / error states ───────────────────────────────────
  if (durationSec <= 0) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-card to-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" />
            {t('videoComposer.costEstimateTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('videoComposer.costEstimateAddScenes')}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading && !estimation) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary animate-pulse" />
            {t('videoComposer.costEstimateCalculating')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (errored || !estimation) {
    return (
      <Card className="border-muted bg-muted/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" />
            {t('videoComposer.costEstimateUnavailable')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {t('videoComposer.costEstimateUnavailableDesc')}
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Computed values ──────────────────────────────────────────────────
  const recommendedEngine = estimation.recommended;
  const recommendedCost =
    recommendedEngine === 'remotion' ? estimation.remotion : estimation.shotstack;
  const currentBalance = balance?.balance ?? 0;
  const insufficientForRecommended = !walletLoading && currentBalance < recommendedCost;
  const breakdown = getCostBreakdown(estimation);

  const total = estimation.remotion + estimation.shotstack;
  const remotionPct = (estimation.remotion / total) * 100;
  const shotstackPct = (estimation.shotstack / total) * 100;

  const EngineRow = ({
    engine,
    label,
    cost,
    percent,
  }: {
    engine: Engine;
    label: string;
    cost: number;
    percent: number;
  }) => {
    const isRecommended = engine === recommendedEngine;
    const isActive = engine === renderEngine;
    return (
      <div
        className={[
          'rounded-lg border p-4 transition-all',
          isActive
            ? 'border-primary ring-1 ring-primary/40 bg-primary/5'
            : 'border-border/50 bg-card/30 hover:border-border',
        ].join(' ')}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap
              className={`h-4 w-4 ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            />
            <span className="font-semibold text-sm">{label}</span>
            {isRecommended && (
              <Badge variant="default" className="gap-1 text-[10px] h-5">
                <Sparkles className="h-2.5 w-2.5" />
                {t('videoComposer.costRecommended')}
              </Badge>
            )}
            {isActive && !isRecommended && (
              <Badge variant="secondary" className="text-[10px] h-5">
                {t('videoComposer.costSelected')}
              </Badge>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold tabular-nums">{cost}</span>
            <span className="text-xs text-muted-foreground">Credits</span>
          </div>
        </div>
        <Progress value={percent} className="h-1.5 mb-3" />
        <Button
          size="sm"
          variant={isActive ? 'default' : 'outline'}
          className="w-full h-7 text-xs"
          onClick={() => setRenderEngine(engine)}
          disabled={isActive}
        >
          {isActive ? (
            <>
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t('videoComposer.costEngineActive')}
            </>
          ) : (
            t('videoComposer.costEnginePick')
          )}
        </Button>
      </div>
    );
  };

  const sceneWord =
    stockStats.sceneCount === 1
      ? t('videoComposer.sceneWordSingular')
      : t('videoComposer.sceneWordPlural');

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 shadow-[0_0_30px_-15px_hsl(var(--primary)/0.4)]">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" />
            {t('videoComposer.costEstimateTitle')}
          </CardTitle>
          {estimation.savings > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <TrendingDown className="h-3 w-3 text-emerald-500" />
              {t('videoComposer.costSaveBadge', { amount: estimation.savings })}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {durationSec.toFixed(1)}s · {resolution} · {t('videoComposer.costComplexity')}:{' '}
          <span className="capitalize">{complexity}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <EngineRow
          engine="remotion"
          label="Remotion"
          cost={estimation.remotion}
          percent={remotionPct}
        />
        <EngineRow
          engine="shotstack"
          label="Shotstack"
          cost={estimation.shotstack}
          percent={shotstackPct}
        />

        {/* Free Stock Library savings banner */}
        {stockStats.sceneCount > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
            <span className="text-base leading-none mt-0.5">🎁</span>
            <div className="flex-1 text-xs">
              <p className="font-medium text-emerald-300 tabular-nums">
                {t('videoComposer.stockSavingsLine', {
                  count: stockStats.sceneCount,
                  sceneWord,
                  credits: stockStats.savedCredits,
                  euros: stockStats.savedEuros,
                })}
              </p>
              <p className="text-muted-foreground mt-0.5">
                {t('videoComposer.stockSavingsHint')}
              </p>
            </div>
          </div>
        )}

        {/* Wallet balance warning */}
        {insufficientForRecommended && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium text-destructive">
                {t('videoComposer.costInsufficient', { balance: currentBalance })}
              </p>
              <p className="text-muted-foreground mt-0.5">
                {t('videoComposer.costTopUp')}
              </p>
            </div>
          </div>
        )}

        {!insufficientForRecommended && !walletLoading && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{t('videoComposer.costYourBalance')}</span>
            <span className="tabular-nums font-medium text-foreground">
              {currentBalance} Credits
            </span>
          </div>
        )}

        {/* Historical hint */}
        {estimation.historicalAverage && (
          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3" />
            <span>
              {t('videoComposer.costHistorical')}{' '}
              <strong className="text-foreground">
                {estimation.historicalAverage} Credits
              </strong>
              .
            </span>
          </div>
        )}

        {/* Breakdown accordion */}
        <Accordion type="single" collapsible className="border-t pt-1">
          <AccordionItem value="breakdown" className="border-0">
            <AccordionTrigger className="py-2 text-xs hover:no-underline">
              {t('videoComposer.costBreakdown')}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1.5 pt-1">
                {breakdown.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-muted/30"
                  >
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium tabular-nums">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
