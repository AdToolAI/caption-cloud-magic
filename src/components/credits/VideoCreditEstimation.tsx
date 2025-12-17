import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Sparkles, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { calculateExplainerVideoCost, EXPLAINER_VIDEO_PRICING } from '@/config/aiVideoCredits';
import type { Currency } from '@/config/pricing';

interface VideoCreditEstimationProps {
  sceneCount: number;
  hasCharacter: boolean;
  currency?: Currency;
  onPurchaseClick?: () => void;
  className?: string;
}

export function VideoCreditEstimation({
  sceneCount,
  hasCharacter,
  currency = 'EUR',
  onPurchaseClick,
  className
}: VideoCreditEstimationProps) {
  const { wallet, loading } = useAIVideoWallet();
  const [estimatedCost, setEstimatedCost] = useState({ credits: 0, breakdown: { scenes: 0, character: 0 } });

  useEffect(() => {
    const cost = calculateExplainerVideoCost(sceneCount, hasCharacter, currency);
    setEstimatedCost(cost);
  }, [sceneCount, hasCharacter, currency]);

  const balance = wallet?.balance_euros ?? 0;
  const hasEnoughCredits = balance >= estimatedCost.credits;
  const currencySymbol = currency === 'EUR' ? '€' : '$';

  if (loading) {
    return (
      <div className={cn("animate-pulse bg-muted/20 rounded-xl h-24", className)} />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "p-4 rounded-xl border backdrop-blur-sm",
        hasEnoughCredits 
          ? "bg-green-500/5 border-green-500/20" 
          : "bg-amber-500/5 border-amber-500/20",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[#F5C76A]" />
          <span className="text-sm font-medium">Kostenschätzung</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Guthaben:</span>
          <span className={cn(
            "font-semibold",
            hasEnoughCredits ? "text-green-400" : "text-amber-400"
          )}>
            {balance.toFixed(2)}{currencySymbol}
          </span>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="space-y-1.5 mb-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {sceneCount} Szenen × {EXPLAINER_VIDEO_PRICING.pricePerScene[currency].toFixed(2)}{currencySymbol}
          </span>
          <span>{estimatedCost.breakdown.scenes.toFixed(2)}{currencySymbol}</span>
        </div>
        {hasCharacter && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Character Sheet</span>
            <span>{estimatedCost.breakdown.character.toFixed(2)}{currencySymbol}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Multi-Format Export (3×)</span>
          <span className="text-green-400">Inkl.</span>
        </div>
        <div className="h-px bg-white/10 my-2" />
        <div className="flex justify-between font-semibold">
          <span>Gesamtkosten</span>
          <span className="text-[#F5C76A]">{estimatedCost.credits.toFixed(2)}{currencySymbol}</span>
        </div>
      </div>

      {/* Status */}
      {hasEnoughCredits ? (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <Sparkles className="h-4 w-4" />
          <span>Ausreichend Guthaben vorhanden</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4" />
            <span>
              Es fehlen {(estimatedCost.credits - balance).toFixed(2)}{currencySymbol}
            </span>
          </div>
          <Button
            onClick={onPurchaseClick}
            className="w-full bg-gradient-to-r from-[#F5C76A] to-amber-500 text-black hover:shadow-lg"
            size="sm"
          >
            <Wallet className="h-4 w-4 mr-2" />
            Credits kaufen
            <ExternalLink className="h-3 w-3 ml-2" />
          </Button>
        </div>
      )}
    </motion.div>
  );
}
