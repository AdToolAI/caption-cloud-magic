import React from 'react';
import { Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { safeInterpolate } from '../utils/safeInterpolate';

interface KenBurnsImageProps {
  src: string;
  durationInFrames: number;
  /** Variant — controls direction & intensity of the Ken-Burns motion. */
  variant?: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down';
  /** Maximum scale multiplier at peak (default 1.15). */
  maxScale?: number;
}

const VARIANTS = {
  'zoom-in':   { fromScale: 1.0,  toScale: 1.15, fromX: 0,   toX: 0,   fromY: 0,   toY: 0   },
  'zoom-out':  { fromScale: 1.15, toScale: 1.0,  fromX: 0,   toX: 0,   fromY: 0,   toY: 0   },
  'pan-left':  { fromScale: 1.1,  toScale: 1.1,  fromX: 4,   toX: -4,  fromY: 0,   toY: 0   },
  'pan-right': { fromScale: 1.1,  toScale: 1.1,  fromX: -4,  toX: 4,   fromY: 0,   toY: 0   },
  'pan-up':    { fromScale: 1.1,  toScale: 1.1,  fromX: 0,   toX: 0,   fromY: 4,   toY: -4  },
  'pan-down':  { fromScale: 1.1,  toScale: 1.1,  fromX: 0,   toX: 0,   fromY: -4,  toY: 4   },
} as const;

/**
 * Ken-Burns animated image — used by AI-image scenes in the Video Composer.
 * 100% Lambda-safe: no external libs, pure interpolate() + transform.
 */
export const KenBurnsImage: React.FC<KenBurnsImageProps> = ({
  src,
  durationInFrames,
  variant = 'zoom-in',
  maxScale = 1.15,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const safeDuration = Math.max(2, durationInFrames);

  const v = VARIANTS[variant] ?? VARIANTS['zoom-in'];
  // Override scale if caller passed a different maxScale and using zoom-in
  const fromScale = variant === 'zoom-out' ? maxScale : v.fromScale;
  const toScale = variant === 'zoom-in' ? maxScale : v.toScale;

  const scale = safeInterpolate(frame, [0, safeDuration], [fromScale, toScale]);
  const xPct = safeInterpolate(frame, [0, safeDuration], [v.fromX, v.toX]);
  const yPct = safeInterpolate(frame, [0, safeDuration], [v.fromY, v.toY]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `translate(${xPct}%, ${yPct}%) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      />
    </div>
  );
};

/**
 * Picks a deterministic Ken-Burns variant based on scene index — so a series
 * of image scenes feels visually varied without random per-render output.
 */
export function pickKenBurnsVariant(sceneIndex: number): KenBurnsImageProps['variant'] {
  const variants: KenBurnsImageProps['variant'][] = [
    'zoom-in',
    'pan-right',
    'zoom-out',
    'pan-left',
    'zoom-in',
    'pan-up',
    'zoom-out',
    'pan-down',
  ];
  return variants[sceneIndex % variants.length];
}
