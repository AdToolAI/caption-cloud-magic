import React from 'react';
import { cn } from '@/lib/utils';
import masterScene from '@/assets/studio-presets/framing/establishing.jpg';

interface LookPresetTileProps {
  /** CSS filter string, e.g. "contrast(1.2) saturate(0.85)". Empty string = original. */
  cssFilter?: string;
  /** Display label rendered under the image. */
  label: string;
  /** Active selection ring. */
  isActive?: boolean;
  /** Intensity 0–1 — blends filtered image over original at this opacity. */
  intensity?: number;
  onClick?: () => void;
  /** Tile size variant. */
  size?: 'sm' | 'md';
  /** Optional emoji or icon shown in the corner badge. */
  badge?: React.ReactNode;
}

/**
 * Visual preset tile that renders the SAME locked base scene with a CSS filter
 * applied — so users instantly see what each filter / color grade actually does
 * (Artlist-style comparison). Uses the framing master scene to honor the
 * "Comparable Studio Preset Thumbnails" memory rule.
 */
export const LookPresetTile: React.FC<LookPresetTileProps> = ({
  cssFilter = '',
  label,
  isActive = false,
  intensity = 1,
  onClick,
  size = 'sm',
  badge,
}) => {
  const dim = size === 'sm' ? 'h-16' : 'h-24';
  const clampedIntensity = Math.min(1, Math.max(0, intensity));
  const showBlend = !!cssFilter && clampedIntensity < 1;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-1 rounded-lg overflow-hidden transition-all border text-left',
        isActive
          ? 'border-cyan-400/60 shadow-[0_0_14px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/30'
          : 'border-white/10 hover:border-white/25 hover:shadow-[0_0_10px_rgba(245,199,106,0.12)]',
      )}
    >
      <div className={cn('relative w-full overflow-hidden bg-black', dim)}>
        {/* Base layer: original (visible only when blending below 100%) */}
        {showBlend && (
          <img
            src={masterScene}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        )}
        {/* Filtered layer */}
        <img
          src={masterScene}
          alt={label}
          className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-[1.04]"
          style={{
            filter: cssFilter || undefined,
            opacity: showBlend ? clampedIntensity : 1,
          }}
          draggable={false}
        />
        {/* Gradient scrim for label legibility */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />
        {badge && (
          <span className="absolute top-1 right-1 text-[10px] leading-none">
            {badge}
          </span>
        )}
        <span
          className={cn(
            'absolute bottom-1 left-1.5 right-1.5 truncate text-[10px] font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]',
            isActive ? 'text-cyan-200' : 'text-white/85',
          )}
        >
          {label}
        </span>
        {isActive && (
          <span className="absolute top-1 left-1 h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
        )}
      </div>
    </button>
  );
};

export default LookPresetTile;
