/**
 * TransitionHandle — thin semantic knot BETWEEN two scenes in the
 * storyboard. Click opens the TransitionPopover to configure type + duration.
 *
 * The transition data lives on the LEFT scene's
 * `transitionType` / `transitionDuration` fields (existing composer schema).
 */
import { ArrowDown, Scissors, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TransitionStyle } from '@/types/video-composer';
import { TransitionPopover } from './TransitionPopover';
import { useTranslation } from '@/hooks/useTranslation';

const L10N: Record<'de' | 'en' | 'es', Record<TransitionStyle, string>> = {
  de: { none: 'Cut', crossfade: 'Crossfade', fade: 'Fade', slide: 'Slide', zoom: 'Zoom', wipe: 'Wipe' },
  en: { none: 'Cut', crossfade: 'Crossfade', fade: 'Fade', slide: 'Slide', zoom: 'Zoom', wipe: 'Wipe' },
  es: { none: 'Corte', crossfade: 'Fundido', fade: 'Fade', slide: 'Slide', zoom: 'Zoom', wipe: 'Wipe' },
};
const EDIT_LABEL: Record<'de' | 'en' | 'es', string> = {
  de: 'Übergang bearbeiten',
  en: 'Edit transition',
  es: 'Editar transición',
};

interface TransitionHandleProps {
  value: TransitionStyle;
  duration: number;
  onChange: (value: TransitionStyle, duration: number) => void;
  disabled?: boolean;
}

export function TransitionHandle({
  value,
  duration,
  onChange,
  disabled,
}: TransitionHandleProps) {
  const label = LABEL[value] ?? 'Cut';
  const isCut = value === 'none';
  const Icon = isCut ? Scissors : Waves;

  return (
    <div className="flex items-center justify-center py-1.5">
      <TransitionPopover
        value={value}
        duration={duration}
        onChange={onChange}
        disabled={disabled}
      >
        <button
          type="button"
          aria-label={`Übergang bearbeiten (${label})`}
          className={cn(
            'group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-[0.14em]',
            'border backdrop-blur-md transition-all',
            isCut
              ? 'border-border/40 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-primary'
              : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15',
          )}
        >
          <Icon className="h-3 w-3" />
          <span>{label}</span>
          {!isCut && (
            <span className="font-mono text-[9px] opacity-70">
              {duration.toFixed(1)}s
            </span>
          )}
          <ArrowDown className="h-2.5 w-2.5 opacity-50 group-hover:opacity-100" />
        </button>
      </TransitionPopover>
    </div>
  );
}

export default TransitionHandle;
