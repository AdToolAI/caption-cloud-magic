/**
 * TransitionPopover — hosts the shared <TransitionSelector /> plus a
 * duration slider so users can configure the transition BETWEEN two scenes
 * directly from the Motion Studio storyboard.
 *
 * Reuses the existing Director's-Cut transition palette (see
 * `src/components/video/TransitionSelector.tsx`) so preview + export stay
 * semantically identical to the Director's Cut editor.
 */
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TransitionSelector } from '@/components/video/TransitionSelector';
import type { TransitionStyle } from '@/types/video-composer';
import { useTranslation } from '@/hooks/useTranslation';

const L10N = {
  de: { title: 'Übergang zur nächsten Szene', duration: 'Dauer', more: 'Mehr Übergänge', less: 'Weniger Übergänge' },
  en: { title: 'Transition to next scene', duration: 'Duration', more: 'More transitions', less: 'Fewer transitions' },
  es: { title: 'Transición a la siguiente escena', duration: 'Duración', more: 'Más transiciones', less: 'Menos transiciones' },
} as const;

const ALL_TRANSITIONS: TransitionStyle[] = [
  'none',
  'crossfade',
  'fade',
  'slide',
  'zoom',
  'wipe',
];
const MIN_PALETTE: TransitionStyle[] = ['none', 'crossfade'];

interface TransitionPopoverProps {
  value: TransitionStyle;
  duration: number; // seconds
  onChange: (value: TransitionStyle, duration: number) => void;
  children: React.ReactNode; // the trigger (handle button)
  disabled?: boolean;
}

export function TransitionPopover({
  value,
  duration,
  onChange,
  children,
  disabled,
}: TransitionPopoverProps) {
  const [showMore, setShowMore] = useState(false);
  const palette = showMore ? ALL_TRANSITIONS : MIN_PALETTE;
  const { language } = useTranslation();
  const l = L10N[(language as 'de' | 'en' | 'es') ?? 'de'] ?? L10N.de;

  const handleType = (next: string) => {
    onChange(next as TransitionStyle, duration);
  };
  const handleDuration = (next: number[]) => {
    onChange(value, Math.round(next[0] * 10) / 10);
  };

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="center"
        className="w-[320px] p-4 space-y-4"
      >
        <TransitionSelector
          value={value}
          onChange={handleType}
          availableTransitions={palette as string[]}
          label={l.title}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{l.duration}</Label>
            <span className="text-[11px] font-mono text-primary/80">
              {duration.toFixed(1)}s
            </span>
          </div>
          <Slider
            value={[duration]}
            min={0.2}
            max={1.5}
            step={0.1}
            onValueChange={handleDuration}
            disabled={value === 'none'}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setShowMore((v) => !v)}
        >
          {showMore ? 'Weniger Übergänge' : 'Mehr Übergänge'}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export default TransitionPopover;
