import React from 'react';
import { useCurrentFrame } from 'remotion';

interface LightRaysProps {
  color?: string;
  intensity?: number;
  rotationSpeed?: number;
}

/**
 * Rotating cinematic light rays via conic-gradient.
 * Pure CSS — Lambda-safe, no DOM thrash.
 */
export const LightRays: React.FC<LightRaysProps> = ({
  color = 'hsl(45, 80%, 70%)',
  intensity = 0.25,
  rotationSpeed = 0.3,
}) => {
  const frame = useCurrentFrame();
  const rotation = (frame * rotationSpeed) % 360;

  return (
    <div
      style={{
        position: 'absolute',
        inset: '-25%',
        pointerEvents: 'none',
        background: `conic-gradient(from ${rotation}deg at 50% 50%, transparent 0deg, ${color} 20deg, transparent 40deg, transparent 100deg, ${color} 130deg, transparent 160deg, transparent 240deg, ${color} 270deg, transparent 300deg)`,
        opacity: intensity,
        mixBlendMode: 'screen',
        filter: 'blur(30px)',
      }}
    />
  );
};
