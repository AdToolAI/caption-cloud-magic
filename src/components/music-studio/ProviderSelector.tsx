import { Activity, Wand2, Music2, Sparkles, Waves, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ENGINE_CATALOG, ENGINE_ORDER, formatMusicPriceBadge, type MusicEngineId } from '@/lib/music/engineCatalog';

interface ProviderSelectorProps {
  value: MusicEngineId;
  onChange: (engineId: MusicEngineId) => void;
  currencySymbol?: string;
  disabled?: boolean;
}

const ICONS: Record<string, typeof Zap> = {
  'stable-audio-25':      Activity,
  'minimax-15':           Music2,
  'elevenlabs-music-v2':  Wand2,
  'lyria-3-pro':          Sparkles,
};

const ACCENTS: Record<string, string> = {
  'stable-audio-25':      'from-emerald-500/20 to-emerald-500/5',
  'minimax-15':           'from-fuchsia-500/20 to-fuchsia-500/5',
  'elevenlabs-music-v2':  'from-primary/25 to-primary/5',
  'lyria-3-pro':          'from-amber-500/25 to-amber-500/5',
};


export function ProviderSelector({ value, onChange, currencySymbol = '€', disabled }: ProviderSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {ENGINE_ORDER.map((id) => {
        const engine = ENGINE_CATALOG[id];
        const Icon = ICONS[id] || Music2;
        const accent = ACCENTS[id] || 'from-primary/20 to-primary/5';
        const active = value === id;
        const isDisabled = disabled || engine.comingSoon;
        return (
          <button
            key={id}
            type="button"
            disabled={isDisabled}
            onClick={() => onChange(id as MusicEngineId)}
            title={engine.comingSoon ? 'Preview-Access wird in Kürze freigeschaltet' : undefined}
            className={cn(
              'relative group text-left p-3 rounded-xl border transition-all overflow-hidden',
              'bg-gradient-to-br backdrop-blur-sm',
              active
                ? 'border-primary shadow-[0_0_24px_-4px_hsl(var(--primary)/0.45)] scale-[1.02]'
                : 'border-border/40 hover:border-primary/40 hover:scale-[1.01]',
              accent,
              isDisabled && 'opacity-50 cursor-not-allowed hover:scale-100'
            )}
          >
            {engine.badge && (
              <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold tracking-wider px-1.5 py-0.5 rounded bg-primary/25 text-primary border border-primary/40">
                {engine.badge}
              </span>
            )}
            <div className="flex items-center justify-between mb-1.5">
              <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-foreground/70')} />
              {active && <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
            </div>
            <div className="font-display text-sm font-semibold text-foreground">{engine.label}</div>
            <div className="text-[10px] text-muted-foreground mb-2">{engine.subtitle}</div>
            <div className="text-[10px] text-muted-foreground/80 truncate mb-1.5">{engine.provider}</div>
            <Badge
              variant="outline"
              className={cn(
                'h-5 px-1.5 text-[10px] gap-1',
                active ? 'border-primary/60 text-primary' : 'border-border/60 text-muted-foreground'
              )}
            >
              {formatMusicPriceBadge(id, currencySymbol)}
            </Badge>
            {engine.comingSoon && (
              <div className="absolute inset-0 flex items-end justify-center pb-1.5 pointer-events-none">
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-background/80 border border-primary/30 text-primary">
                  Bald verfügbar
                </span>
              </div>
            )}
          </button>
        );
      })}

    </div>
  );
}
