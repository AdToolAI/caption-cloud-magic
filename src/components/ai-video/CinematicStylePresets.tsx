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
import { getCinematicPresetThumbnail } from '@/config/studioPresetThumbnails';

type Lang = 'en' | 'de' | 'es';

interface Props {
  value: ShotSelection;
  onApply: (selection: ShotSelection, presetId: string) => void;
  /** Compact variant (used inside the per-scene panel in the Composer). */
  compact?: boolean;
  /**
   * Layout of the preset cards.
   * - `rail` (default): horizontally scrollable rail (legacy).
   * - `grid`: responsive multi-column grid — used in the cleaned-up
   *   SceneStyleSheet so cards never get clipped.
   */
  layout?: 'rail' | 'grid';
  /** Hide the small header row (used when the parent already labels the section). */
  hideHeader?: boolean;
}

/**
 * Cinematic Style Presets — One-Click Director Looks.
 *
 * Renders a horizontal scroll-rail of bundled cinematography presets. Clicking
 * applies the entire Shot Director selection (framing + angle + movement +
 * lighting) at once. Active preset is highlighted via gold ring.
 */
export default function CinematicStylePresets({ value, onApply, compact = false, layout = 'rail', hideHeader = false }: Props) {
  const { language } = useTranslation();
  const lang = ((language as Lang) ?? 'en');
  const activeId = useMemo(() => matchPresetToSelection(value), [value]);

  const containerCls = layout === 'grid'
    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2'
    : 'flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin max-w-full';

  return (
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      {!hideHeader && (
        <div className="flex items-center gap-1.5">
          <Sparkles className={cn('text-primary', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          <span className={cn('font-medium text-primary', compact ? 'text-[11px]' : 'text-xs uppercase tracking-wider')}>
            {lang === 'de' ? 'Cinematic Looks' : lang === 'es' ? 'Looks Cinematográficos' : 'Cinematic Looks'}
          </span>
          <span className={cn('text-muted-foreground', compact ? 'text-[9px]' : 'text-[10px]')}>
            {lang === 'de' ? '· One-Click Director-Style' : lang === 'es' ? '· Estilo en un clic' : '· One-click director style'}
          </span>
        </div>
      )}

      <div className={containerCls}>
        {CINEMATIC_STYLE_PRESETS.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            lang={lang}
            isActive={activeId === preset.id}
            compact={compact}
            layout={layout}
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
  layout?: 'rail' | 'grid';
  onClick: () => void;
}

/**
 * Phase D — Procedural 16:9 frame thumbnail.
 *
 * Renders a real cinema-frame preview using CSS only (no image-gen cost):
 *  - 16:9 letterboxed canvas tinted by `preset.accent`
 *  - "subject" silhouette sized by framing (close-up = big, wide = small)
 *  - lighting overlay (noir hard-shadow, neon glow, golden-hour warm, etc.)
 * Far more "what you see is what you get" than an emoji chip.
 */
function FrameThumb({ preset }: { preset: CinematicStylePreset }) {
  const { framing, lighting, angle } = preset.selection;
  const accent = preset.accent;

  // Subject size & position by framing
  const subject =
    framing === 'close-up' ? { size: 78, y: 30 }
    : framing === 'medium-close' ? { size: 60, y: 40 }
    : framing === 'medium' ? { size: 44, y: 52 }
    : framing === 'wide' ? { size: 24, y: 68 }
    : framing === 'extreme-wide' ? { size: 14, y: 76 }
    : { size: 44, y: 52 };

  // Camera angle tilt (dutch / low / high)
  const tilt =
    angle === 'dutch-tilt' ? '-8deg'
    : angle === 'low-angle' ? '0deg'
    : angle === 'high-angle' ? '0deg'
    : '0deg';
  const subjectShift =
    angle === 'low-angle' ? -12
    : angle === 'high-angle' ? 12
    : 0;

  // Lighting → background composition
  const bg =
    lighting === 'hard-noir'
      ? `linear-gradient(115deg, hsl(0 0% 4%) 0%, hsl(0 0% 14%) 45%, hsl(${accent} / 0.5) 100%)`
    : lighting === 'neon-cyberpunk'
      ? `radial-gradient(circle at 30% 70%, hsl(${accent} / 0.7) 0%, transparent 55%), radial-gradient(circle at 80% 30%, hsl(190 95% 55% / 0.55) 0%, transparent 50%), linear-gradient(180deg, hsl(260 50% 8%), hsl(280 60% 4%))`
    : lighting === 'golden-hour'
      ? `linear-gradient(180deg, hsl(35 90% 60% / 0.85) 0%, hsl(${accent} / 0.7) 50%, hsl(15 60% 18%) 100%)`
    : lighting === 'soft-studio'
      ? `radial-gradient(circle at 50% 35%, hsl(${accent} / 0.55) 0%, hsl(40 30% 92% / 0.4) 60%, hsl(${accent} / 0.2) 100%)`
    : lighting === 'overcast-natural'
      ? `linear-gradient(180deg, hsl(210 15% 55%) 0%, hsl(${accent} / 0.4) 100%)`
    : `linear-gradient(135deg, hsl(${accent} / 0.7) 0%, hsl(0 0% 8%) 100%)`;

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-border/40"
      style={{ aspectRatio: '16 / 9', background: bg, transform: `rotate(${tilt})` }}
    >
      {/* Letterbox bars */}
      <div className="absolute inset-x-0 top-0 h-[8%] bg-black/85" />
      <div className="absolute inset-x-0 bottom-0 h-[8%] bg-black/85" />
      {/* Hard-shadow slice for noir */}
      {lighting === 'hard-noir' && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'repeating-linear-gradient(110deg, transparent 0 22%, hsl(0 0% 0% / 0.55) 22% 28%, transparent 28% 50%)',
          }}
        />
      )}
      {/* Subject silhouette */}
      <div
        className="absolute left-1/2 rounded-t-[60%] bg-black/75"
        style={{
          width: `${subject.size}%`,
          height: `${subject.size * 1.1}%`,
          bottom: `${8 + subjectShift}%`,
          transform: `translateX(-50%)`,
          boxShadow: `0 0 30px hsl(${accent} / 0.45)`,
        }}
      />
      {/* Soft vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)' }} />
    </div>
  );
}

function PresetCard({ preset, lang, isActive, compact, layout = 'rail', onClick }: PresetCardProps) {
  const isGrid = layout === 'grid';
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      title={preset.description[lang]}
      className={cn(
        'relative rounded-lg border bg-card/40 backdrop-blur-sm overflow-hidden text-left transition-all group',
        isGrid ? 'w-full p-2' : 'shrink-0',
        !isGrid && (compact ? 'w-[148px] p-1.5' : 'w-[180px] p-2'),
        isActive
          ? 'border-primary ring-1 ring-primary/50 bg-primary/5 shadow-[0_0_18px_-6px_hsl(var(--primary)/0.6)]'
          : 'border-border/60 hover:border-primary/40',
      )}
    >
      {isActive && (
        <div className="absolute top-1.5 right-1.5 z-10 bg-primary rounded-full p-0.5">
          <Check className="h-2.5 w-2.5 text-primary-foreground" />
        </div>
      )}
      {/* Real 16:9 frame thumbnail */}
      <FrameThumb preset={preset} />
      {/* Caption */}
      <div className="mt-1.5 px-0.5">
        <div className={cn(
          'flex items-center gap-1 font-medium leading-tight',
          compact ? 'text-[10px]' : 'text-[11px]',
          isActive ? 'text-primary' : 'text-foreground',
        )}>
          <span className="text-[11px] leading-none">{preset.emoji}</span>
          <span className="truncate">{preset.name[lang]}</span>
        </div>
        <div className={cn('text-muted-foreground leading-snug mt-0.5 line-clamp-1', compact ? 'text-[9px]' : 'text-[10px]')}>
          {preset.description[lang]}
        </div>
      </div>
    </motion.button>
  );
}
