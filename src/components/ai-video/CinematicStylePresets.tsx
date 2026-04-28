import { useMemo } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { motion } from 'framer-motion';

import {
  CINEMATIC_STYLE_PRESETS,
  matchPresetToSelection,
  type CinematicStylePreset,
} from '@/config/cinematicStylePresets';
import type { ShotSelection } from '@/config/shotDirector';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

type Lang = 'en' | 'de' | 'es';

interface Props {
  value: ShotSelection;
  onApply: (selection: ShotSelection, presetId: string) => void;
  /** Compact variant (used inside the per-scene panel in the Composer). */
  compact?: boolean;
}

/**
 * Cinematic Style Presets — One-Click Director Looks.
 *
 * Renders a horizontal scroll-rail of bundled cinematography presets. Clicking
 * applies the entire Shot Director selection (framing + angle + movement +
 * lighting) at once. Active preset is highlighted via gold ring.
 */
export default function CinematicStylePresets({ value, onApply, compact = false }: Props) {
  const { language } = useTranslation();
  const lang = ((language as Lang) ?? 'en');
  const activeId = useMemo(() => matchPresetToSelection(value), [value]);

  return (
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      <div className="flex items-center gap-1.5">
        <Sparkles className={cn('text-primary', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
        <span className={cn('font-medium text-primary', compact ? 'text-[11px]' : 'text-xs uppercase tracking-wider')}>
          {lang === 'de' ? 'Cinematic Looks' : lang === 'es' ? 'Looks Cinematográficos' : 'Cinematic Looks'}
        </span>
        <span className={cn('text-muted-foreground', compact ? 'text-[9px]' : 'text-[10px]')}>
          {lang === 'de' ? '· One-Click Director-Style' : lang === 'es' ? '· Estilo en un clic' : '· One-click director style'}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin max-w-full">
        {CINEMATIC_STYLE_PRESETS.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            lang={lang}
            isActive={activeId === preset.id}
            compact={compact}
            onClick={() => onApply(preset.selection, preset.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface PresetCardProps {
  preset: CinematicStylePreset;
  lang: Lang;
  isActive: boolean;
  compact: boolean;
  onClick: () => void;
}

function PresetCard({ preset, lang, isActive, compact, onClick }: PresetCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      title={preset.description[lang]}
      className={cn(
        'shrink-0 relative rounded-lg border bg-card/40 backdrop-blur-sm overflow-hidden text-left transition-all group',
        compact ? 'w-[104px] p-1.5' : 'w-[140px] p-2.5',
        isActive
          ? 'border-primary ring-1 ring-primary/50 bg-primary/5'
          : 'border-border/60 hover:border-primary/40',
      )}
    >
      {/* Subtle accent gradient background */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 30% 20%, hsl(${preset.accent}) 0%, transparent 70%)`,
        }}
      />
      {isActive && (
        <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
          <Check className="h-2.5 w-2.5 text-primary-foreground" />
        </div>
      )}
      <div className="relative">
        <div className={cn('leading-none', compact ? 'text-lg mb-0.5' : 'text-2xl mb-1.5')}>{preset.emoji}</div>
        <div
          className={cn(
            'font-medium leading-tight',
            compact ? 'text-[10px]' : 'text-[11px]',
            isActive ? 'text-primary' : 'text-foreground',
          )}
        >
          {preset.name[lang]}
        </div>
        <div className={cn('text-muted-foreground leading-snug mt-0.5 line-clamp-2', compact ? 'text-[9px]' : 'text-[10px]')}>
          {preset.description[lang]}
        </div>
      </div>
    </motion.button>
  );
}
