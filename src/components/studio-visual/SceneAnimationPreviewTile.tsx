import React from 'react';
import { cn } from '@/lib/utils';
import masterScene from '@/assets/studio-presets/framing/establishing.jpg';
import './motionTiles.css';

export type SceneAnimationId =
  | 'none'
  | 'zoomIn' | 'zoomOut'
  | 'zoomInSlow' | 'zoomOutSlow'
  | 'panLeft' | 'panRight' | 'panUp' | 'panDown'
  | 'kenBurnsTL' | 'kenBurnsBR';

interface SceneAnimationPreviewTileProps {
  animationId: SceneAnimationId;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

/**
 * Locked-base-scene tile that loops the actual scene-animation effect on hover
 * or when active — Artlist-style visual comparison for camera moves.
 */
export const SceneAnimationPreviewTile: React.FC<SceneAnimationPreviewTileProps> = ({
  animationId,
  label,
  isActive = false,
  onClick,
  size = 'sm',
  icon,
}) => {
  const dim = size === 'sm' ? 'h-16' : 'h-24';
  const cls = `sa-${animationId}`;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={(e) => e.currentTarget.querySelector('.sa-stage')?.setAttribute('data-play', 'true')}
      onMouseLeave={(e) => {
        const stage = e.currentTarget.querySelector('.sa-stage');
        if (stage && !isActive) stage.setAttribute('data-play', 'false');
      }}
      className={cn(
        'group relative flex flex-col gap-1 rounded-lg overflow-hidden transition-all border text-left',
        isActive
          ? 'border-cyan-400/60 shadow-[0_0_14px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/30'
          : 'border-white/10 hover:border-white/25 hover:shadow-[0_0_10px_rgba(245,199,106,0.12)]',
      )}
    >
      <div
        className={cn('sa-stage relative w-full overflow-hidden bg-black', dim, cls)}
        data-play={isActive ? 'true' : 'false'}
      >
        <img
          src={masterScene}
          alt={label}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />
        {icon && (
          <span className="absolute top-1 right-1 text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {icon}
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

export default SceneAnimationPreviewTile;
