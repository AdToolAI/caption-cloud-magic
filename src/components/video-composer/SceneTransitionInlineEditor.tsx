/**
 * SceneTransitionInlineEditor — flat, always-visible transition editor for the
 * currently selected scene's outgoing transition. Mirrors the popover UI but
 * inline for keyboard/A11y access from the StudioPane.
 *
 * Writes to `scene.transitionType` / `scene.transitionDuration` — the same
 * fields the storyboard `TransitionHandle` writes and that
 * `compose-video-assemble` reads from the DB during export.
 */
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { TransitionSelector } from '@/components/video/TransitionSelector';
import { useState } from 'react';
import type { TransitionStyle } from '@/types/video-composer';
import { useTranslation } from '@/hooks/useTranslation';

const ALL_TRANSITIONS: TransitionStyle[] = [
  'none',
  'crossfade',
  'fade',
  'slide',
  'zoom',
  'wipe',
];
const MIN_PALETTE: TransitionStyle[] = ['none', 'crossfade'];

const L10N = {
  de: { title: 'Übergang zur nächsten Szene', duration: 'Dauer', more: 'Mehr Übergänge', less: 'Weniger Übergänge' },
  en: { title: 'Transition to next scene', duration: 'Duration', more: 'More transitions', less: 'Fewer transitions' },
  es: { title: 'Transición a la siguiente escena', duration: 'Duración', more: 'Más transiciones', less: 'Menos transiciones' },
} as const;

interface Props {
  transitionType: TransitionStyle;
  transitionDuration: number;
  onChange: (type: TransitionStyle, duration: number) => void;
}

export function SceneTransitionInlineEditor({
  transitionType,
  transitionDuration,
  onChange,
}: Props) {
  const { language } = useTranslation();
  const l = L10N[(language as 'de' | 'en' | 'es') ?? 'de'] ?? L10N.de;
  const [showMore, setShowMore] = useState(false);
  const palette = showMore ? ALL_TRANSITIONS : MIN_PALETTE;

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 backdrop-blur-sm p-3 space-y-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-primary font-bold">
        {l.title}
      </div>

      <TransitionSelector
        value={transitionType}
        onChange={(v) => onChange(v as TransitionStyle, transitionDuration)}
        availableTransitions={palette as string[]}
        label=""
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{l.duration}</Label>
          <span className="text-[11px] font-mono text-primary/80">
            {transitionDuration.toFixed(1)}s
          </span>
        </div>
        <Slider
          value={[transitionDuration]}
          min={0.2}
          max={1.5}
          step={0.1}
          onValueChange={(v) => onChange(transitionType, Math.round(v[0] * 10) / 10)}
          disabled={transitionType === 'none'}
        />
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setShowMore((v) => !v)}
      >
        {showMore ? l.less : l.more}
      </Button>
    </div>
  );
}

export default SceneTransitionInlineEditor;
