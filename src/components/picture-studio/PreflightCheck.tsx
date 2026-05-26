import { AlertTriangle, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  detectMismatch,
  recommendedTierForMode,
  PICTURE_MODELS,
  type PictureMode,
  type QualityTier,
} from "@/config/pictureStudioModels";

interface Props {
  mode: PictureMode;
  tier: QualityTier;
  prompt: string;
  variantsCount: 1 | 4;
  cost: number;
  currencySymbol: string;
  hasReference?: boolean;
  onSwitchTier: (tier: QualityTier) => void;
  onOpenHelper: () => void;
  onSetVariants: (n: 1 | 4) => void;
}

/**
 * Pre-flight check banner — shown above the Generate button.
 * Catches risky combinations BEFORE credits are spent.
 */
export function PreflightCheck({
  mode, tier, prompt, variantsCount, cost, currencySymbol, hasReference = false,
  onSwitchTier, onOpenHelper, onSetVariants,
}: Props) {
  const tips: { icon: 'warn' | 'info'; text: string; action?: { label: string; run: () => void } }[] = [];

  // 1) Model / mode mismatch
  const mismatch = detectMismatch(tier, mode);
  if (mismatch) {
    const better = recommendedTierForMode(mode);
    const betterModel = PICTURE_MODELS[better];
    tips.push({
      icon: 'warn',
      text: mismatch,
      action: better !== tier ? {
        label: `Auf ${betterModel.label} wechseln (${currencySymbol}${(betterModel.cost * variantsCount).toFixed(2)})`,
        run: () => onSwitchTier(better),
      } : undefined,
    });
  }

  // 2) Variant overspend
  if (variantsCount === 4 && cost >= 0.30) {
    tips.push({
      icon: 'info',
      text: `4 Varianten = ${currencySymbol}${cost.toFixed(2)}. Lieber mit 1× starten und nur skalieren wenn das Ergebnis stimmt.`,
      action: { label: 'Auf 1× setzen', run: () => onSetVariants(1) },
    });
  }

  // 3) Weak prompt
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 0 && wordCount < 8) {
    tips.push({
      icon: 'info',
      text: `Dein Prompt ist sehr kurz (${wordCount} Wörter). Der Prompt-Helfer baut daraus einen ausführlichen Master-Prompt.`,
      action: { label: 'Prompt-Helfer öffnen', run: onOpenHelper },
    });
  }

  if (tips.length === 0) return null;

  return (
    <div className="space-y-2">
      {tips.map((tip, i) => {
        const Icon = tip.icon === 'warn' ? AlertTriangle : Info;
        const color = tip.icon === 'warn' ? 'text-amber-500' : 'text-primary';
        const bg = tip.icon === 'warn'
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-primary/5 border-primary/20';
        return (
          <div key={i} className={`flex items-start gap-2 p-2.5 rounded-md border text-xs ${bg}`}>
            <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${color}`} />
            <span className="flex-1">{tip.text}</span>
            {tip.action && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={tip.action.run}>
                {tip.action.label}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
