import { Zap, Activity, Wand2, Music2, Sparkles, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MUSIC_TIER_PRICING, type MusicTier } from '@/hooks/useMusicGeneration';
import { Badge } from '@/components/ui/badge';

interface ProviderSelectorProps {
  value: MusicTier;
  onChange: (tier: MusicTier) => void;
  currencySymbol?: string;
  disabled?: boolean;
}

const TIER_META: Record<MusicTier, { icon: typeof Zap; label: string; subtitle: string; accent: string }> = {
  quick:    { icon: Zap,      label: 'Quick',     subtitle: 'Loops, fast',           accent: 'from-cyan-500/20 to-cyan-500/5' },
  adaptive: { icon: Activity, label: 'Adaptive',  subtitle: 'Background, loopable',  accent: 'from-emerald-500/20 to-emerald-500/5' },
  standard: { icon: Wand2,    label: 'Standard',  subtitle: 'Polished instrumental', accent: 'from-primary/30 to-primary/5' },
  vocal:    { icon: Music2,   label: 'Vocal',     subtitle: 'Songs with lyrics',     accent: 'from-fuchsia-500/20 to-fuchsia-500/5' },
  pro:      { icon: Sparkles, label: 'Pro',       subtitle: 'Long-form pro',         accent: 'from-amber-500/30 to-amber-500/5' },
};

const ORDER: MusicTier[] = ['quick', 'adaptive', 'standard', 'vocal', 'pro'];

export function ProviderSelector({ value, onChange, currencySymbol = '€', disabled }: ProviderSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
      {ORDER.map((tier) => {
        const meta = TIER_META[tier];
        const pricing = MUSIC_TIER_PRICING[tier];
        const Icon = meta.icon;
        const active = value === tier;
        return (
          <button
            key={tier}
            type="button"
            disabled={disabled}
            onClick={() => onChange(tier)}
            className={cn(
              "relative group text-left p-3 rounded-xl border transition-all overflow-hidden",
              "bg-gradient-to-br backdrop-blur-sm",
              active
                ? "border-primary shadow-[0_0_24px_-4px_hsl(var(--primary)/0.45)] scale-[1.02]"
                : "border-border/40 hover:border-primary/40 hover:scale-[1.01]",
              meta.accent,
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-foreground/70")} />
              {active && <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
            </div>
            <div className="font-display text-sm font-semibold text-foreground">{meta.label}</div>
            <div className="text-[10px] text-muted-foreground mb-2">{meta.subtitle}</div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/80">{pricing.engine}</span>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "mt-1.5 h-5 px-1.5 text-[10px] gap-1",
                active ? "border-primary/60 text-primary" : "border-border/60 text-muted-foreground"
              )}
            >
              {currencySymbol}{pricing.eur.toFixed(2)} • ≤{pricing.maxDuration}s
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
