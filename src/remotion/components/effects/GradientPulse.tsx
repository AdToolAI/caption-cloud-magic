import React from 'react';
import { useCurrentFrame } from 'remotion';
import { safeInterpolate } from '../../utils/safeInterpolate';

interface GradientPulseProps {
  colorA?: string;
  colorB?: string;
  intensity?: number;
}

/**
 * Subtle breathing color-gradient layer.
 * Adds atmospheric depth without distracting from foreground.
 */
export const GradientPulse: React.FC<GradientPulseProps> = ({
  colorA = 'hsl(45, 70%, 30%)',
  colorB = 'hsl(220, 60%, 15%)',
  intensity = 0.35,
}) => {
  const frame = useCurrentFrame();
  const t = (Math.sin(frame / 60) + 1) / 2; // 0-1
  const angle = safeInterpolate(t, [0, 1], [120, 240]);
  const stopA = safeInterpolate(t, [0, 1], [20, 40]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `linear-gradient(${angle}deg, ${colorA} 0%, transparent ${stopA}%, ${colorB} 100%)`,
        opacity: intensity,
        mixBlendMode: 'overlay',
      }}
    />
  );
};
