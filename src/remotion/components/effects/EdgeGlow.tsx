import React from 'react';
import { useCurrentFrame } from 'remotion';
import { safeInterpolate } from '../../utils/safeInterpolate';

interface EdgeGlowProps {
  color?: string;
  intensity?: number;
  thickness?: number;
}

/**
 * Bond-style golden inner edge glow — premium framing.
 * Pulses subtly to feel "alive" without distracting.
 */
export const EdgeGlow: React.FC<EdgeGlowProps> = ({
  color = 'hsl(45, 95%, 55%)',
  intensity = 0.6,
  thickness = 80,
}) => {
  const frame = useCurrentFrame();
  const pulse = safeInterpolate(
    Math.sin(frame / 45),
    [-1, 1],
    [intensity * 0.7, intensity]
  );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        boxShadow: `inset 0 0 ${thickness}px ${thickness / 4}px ${color}`,
        opacity: pulse,
        mixBlendMode: 'screen',
      }}
    />
  );
};
