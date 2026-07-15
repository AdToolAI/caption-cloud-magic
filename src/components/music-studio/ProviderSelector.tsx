import { Activity, Wand2, Music2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ENGINE_CATALOG, ENGINE_ORDER, formatMusicPriceBadge, type MusicEngineId } from '@/lib/music/engineCatalog';

interface ProviderSelectorProps {
  value: MusicEngineId;
  onChange: (engineId: MusicEngineId) => void;
  currencySymbol?: string;
  disabled?: boolean;
}

const ICONS: Record<string, typeof Music2> = {
  'stable-audio-25':     Activity,
  'minimax-15':          Music2,
  'elevenlabs-music-v2': Wand2,
  'lyria-3-pro':         Sparkles,
};

/**
 * Channel-strip style engine selector.
 * Each engine is rendered as a vertical "console channel" with an animated
 * level meter, LED indicator, and a physical bevel on hover / active.
 */
export function ProviderSelector({ value, onChange, currencySymbol = '€', disabled }: ProviderSelectorProps) {
  return (
    <div
      className={cn(
        'relative rounded-xl p-2.5',
        'bg-[linear-gradient(180deg,hsl(var(--background)/0.6),hsl(var(--background)/0.35))]',
        'border border-primary/15 backdrop-blur-md',
        'shadow-[inset_0_1px_0_hsl(var(--primary)/0.08),0_10px_30px_-15px_hsl(var(--primary)/0.25)]',
      )}
    >
      {/* Rack rails */}
      <div className="pointer-events-none absolute inset-x-3 top-1 h-px bg-primary/15" />
      <div className="pointer-events-none absolute inset-x-3 bottom-1 h-px bg-primary/10" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {ENGINE_ORDER.map((id) => {
          const engine = ENGINE_CATALOG[id];
          const Icon = ICONS[id] || Music2;
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
                'group relative text-left rounded-lg overflow-hidden transition-all',
                'border backdrop-blur-sm',
                'flex flex-col',
                active
                  ? 'border-primary/70 shadow-[0_0_0_1px_hsl(var(--primary)/0.5),0_10px_30px_-10px_hsl(var(--primary)/0.45)]'
                  : 'border-primary/15 hover:border-primary/40',
                'bg-[linear-gradient(180deg,hsl(var(--card)/0.7),hsl(var(--background)/0.75))]',
                isDisabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {/* Top brushed-metal cap */}
              <div className={cn(
                'flex items-center justify-between px-3 py-2 border-b border-primary/10',
                'bg-[linear-gradient(180deg,hsl(var(--primary)/0.08),transparent)]'
              )}>
                <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-foreground/60')} />
                <div className="flex items-center gap-1.5">
                  {engine.badge && (
                    <span className="text-[8.5px] font-semibold tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 uppercase">
                      {engine.badge}
                    </span>
                  )}
                  {/* LED */}
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    active ? 'bg-primary shadow-[0_0_8px_hsl(var(--primary))] animate-pulse' : 'bg-foreground/20',
                  )} />
                </div>
              </div>

              {/* Body */}
              <div className="px-3 py-2.5 flex-1">
                <div className="font-display text-[15px] font-semibold text-foreground leading-tight">
                  {engine.label}
                </div>
                <div className="text-[10.5px] text-muted-foreground mt-0.5 line-clamp-1">
                  {engine.subtitle}
                </div>
                <div className="text-[9.5px] text-muted-foreground/70 mt-1 uppercase tracking-wider truncate">
                  {engine.provider}
                </div>
              </div>

              {/* Level meter row */}
              <div className="px-3 pt-1.5 pb-2 flex items-end gap-[3px] h-9">
                {Array.from({ length: 14 }).map((_, i) => {
                  const seed = Math.abs(Math.sin(i * 1.7 + id.length) * 43758) % 1;
                  const base = 0.2 + seed * 0.55;
                  return (
                    <motion.span
                      key={i}
                      className="flex-1 rounded-sm origin-bottom"
                      style={{
                        background: active
                          ? 'linear-gradient(to top, hsl(var(--primary) / 0.35), hsl(var(--primary)))'
                          : 'linear-gradient(to top, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.35))',
                      }}
                      animate={{
                        scaleY: active ? [base, base + 0.35, base] : [base, base + 0.12, base],
                      }}
                      transition={{
                        duration: active ? 0.7 + seed * 0.7 : 2 + seed * 1.5,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: i * 0.05,
                      }}
                    />
                  );
                })}
              </div>

              {/* Bottom: price LCD */}
              <div className={cn(
                'flex items-center justify-between px-3 py-1.5 border-t',
                active ? 'border-primary/40 bg-primary/5' : 'border-primary/10 bg-background/40',
              )}>
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Rate</span>
                <span className={cn(
                  'font-mono text-[11px] font-semibold tabular-nums',
                  active ? 'text-primary' : 'text-foreground/80',
                )}>
                  {formatMusicPriceBadge(id, currencySymbol)}
                </span>
              </div>

              {engine.comingSoon && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-[9.5px] font-semibold px-2 py-0.5 rounded bg-background/85 border border-primary/40 text-primary uppercase tracking-widest">
                    Bald verfügbar
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
