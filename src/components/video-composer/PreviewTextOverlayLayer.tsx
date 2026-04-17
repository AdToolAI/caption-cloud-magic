import React, { useMemo } from 'react';
import type { GlobalTextOverlay } from '@/types/video-composer';

/**
 * Lightweight, CSS-only renderer for global text overlays inside the
 * Motion Studio preview player (HTML, not Remotion). Mirrors the visual
 * behaviour of the Remotion `TextOverlayRenderer` so the preview matches
 * the final render closely enough for editing decisions.
 */

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  top:         { top: '8%',  left: '50%', transform: 'translateX(-50%)' },
  center:      { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  bottom:      { bottom: '10%', left: '50%', transform: 'translateX(-50%)' },
  bottomLeft:  { bottom: '10%', left: '5%' },
  bottomRight: { bottom: '10%', right: '5%' },
  topLeft:     { top: '8%', left: '5%' },
  topRight:    { top: '8%', right: '5%' },
  centerLeft:  { top: '50%', left: '5%', transform: 'translateY(-50%)' },
  centerRight: { top: '50%', right: '5%', transform: 'translateY(-50%)' },
};

const FONT_SIZES: Record<string, string> = {
  sm: 'clamp(14px, 2.4vw, 22px)',
  md: 'clamp(18px, 3.2vw, 30px)',
  lg: 'clamp(22px, 4vw, 40px)',
  xl: 'clamp(28px, 5.4vw, 56px)',
};

interface Props {
  overlays: GlobalTextOverlay[];
  /** Current playhead time in SECONDS (relative to start of full video). */
  currentTime: number;
  /** Used to clamp `endTime: null` overlays to "play till end". */
  totalDuration: number;
}

export function PreviewTextOverlayLayer({ overlays, currentTime, totalDuration }: Props) {
  const visible = useMemo(() => {
    return overlays.filter(o => {
      const end = o.endTime ?? totalDuration;
      return currentTime >= o.startTime && currentTime <= end;
    });
  }, [overlays, currentTime, totalDuration]);

  return (
    <>
      {/* Inline keyframes so the preview animates without polluting global CSS. */}
      <style>{`
        @keyframes mc-fadeIn { from { opacity: 0; transform: var(--mc-base-tx, none) translateY(20px); } to { opacity: 1; transform: var(--mc-base-tx, none); } }
        @keyframes mc-scaleUp { from { opacity: 0; transform: var(--mc-base-tx, none) scale(0.6); } to { opacity: 1; transform: var(--mc-base-tx, none) scale(1); } }
        @keyframes mc-bounce {
          0%   { opacity: 0; transform: var(--mc-base-tx, none) translateY(-50px); }
          50%  { opacity: 1; transform: var(--mc-base-tx, none) translateY(10px); }
          75%  { transform: var(--mc-base-tx, none) translateY(-5px); }
          100% { transform: var(--mc-base-tx, none) translateY(0); }
        }
        @keyframes mc-glitch {
          0%, 100% { transform: var(--mc-base-tx, none) translateX(0); text-shadow: 0 0 0 transparent; }
          20% { transform: var(--mc-base-tx, none) translateX(-2px); text-shadow: 2px 0 #ff0040, -2px 0 #00fff0; }
          40% { transform: var(--mc-base-tx, none) translateX(2px); text-shadow: -2px 0 #ff0040, 2px 0 #00fff0; }
          60% { transform: var(--mc-base-tx, none) translateX(-1px); text-shadow: 1px 0 #ff0040, -1px 0 #00fff0; }
        }
      `}</style>
      {visible.map((o) => {
        const localTime = currentTime - o.startTime;
        const positionStyle: React.CSSProperties =
          o.position === 'custom' && o.customPosition
            ? { top: `${o.customPosition.y}%`, left: `${o.customPosition.x}%` }
            : POSITION_STYLES[o.position] || POSITION_STYLES.center;

        const baseTransform = (positionStyle.transform as string) || 'none';

        // Animation-specific styling (typewriter & highlight need extra logic).
        let displayText = o.text;
        let extraStyle: React.CSSProperties = {};

        if (o.animation === 'typewriter') {
          const charsPerSecond = 15;
          const visibleChars = Math.floor(localTime * charsPerSecond);
          displayText = o.text.substring(0, Math.min(visibleChars, o.text.length));
        } else if (o.animation === 'highlight') {
          const widthPct = Math.min(100, (localTime / 0.7) * 100);
          extraStyle = {
            backgroundImage: 'linear-gradient(transparent 60%, rgba(255, 215, 0, 0.5) 60%)',
            backgroundSize: `${widthPct}% 100%`,
            backgroundRepeat: 'no-repeat',
          };
        } else if (o.animation === 'fadeIn') {
          extraStyle = { animation: 'mc-fadeIn 0.5s ease-out both' };
        } else if (o.animation === 'scaleUp') {
          extraStyle = { animation: 'mc-scaleUp 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both' };
        } else if (o.animation === 'bounce') {
          extraStyle = { animation: 'mc-bounce 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both' };
        } else if (o.animation === 'glitch') {
          extraStyle = { animation: 'mc-glitch 0.4s steps(2) infinite' };
        }

        const hasBg = o.style.backgroundColor && o.style.backgroundColor !== 'transparent';

        return (
          <div
            key={`${o.id}-${o.startTime}`}
            style={{
              position: 'absolute',
              fontSize: FONT_SIZES[o.style.fontSize] || FONT_SIZES.md,
              color: o.style.color,
              backgroundColor: hasBg ? o.style.backgroundColor : undefined,
              padding: hasBg ? '6px 14px' : undefined,
              borderRadius: hasBg ? '8px' : undefined,
              fontFamily: o.style.fontFamily || 'Inter, sans-serif',
              fontWeight: 700,
              textShadow: o.style.shadow ? '0 2px 8px rgba(0,0,0,0.7)' : undefined,
              maxWidth: '90%',
              whiteSpace: 'pre-wrap',
              textAlign: 'center',
              pointerEvents: 'none',
              lineHeight: 1.15,
              // Preserve any positional transform inside the keyframes:
              ['--mc-base-tx' as any]: baseTransform,
              ...positionStyle,
              ...extraStyle,
            }}
          >
            {displayText}
            {o.animation === 'typewriter' && displayText.length < o.text.length && (
              <span style={{ opacity: Math.floor(localTime * 4) % 2 ? 1 : 0 }}>|</span>
            )}
          </div>
        );
      })}
    </>
  );
}
