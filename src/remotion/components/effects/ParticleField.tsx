import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';

interface ParticleFieldProps {
  color?: string;
  count?: number;
  intensity?: number;
}

/**
 * Floating particle field — deterministic positions via prime-based hashing.
 * No Math.random — every frame is reproducible.
 */
export const ParticleField: React.FC<ParticleFieldProps> = ({
  color = 'hsl(45, 90%, 75%)',
  count = 30,
  intensity = 0.7,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const safeCount = Math.max(1, Math.min(60, count));

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: safeCount }).map((_, i) => {
        const seedX = (i * 97) % 100;
        const seedY = (i * 53) % 100;
        const speed = 0.3 + ((i * 17) % 7) * 0.05;
        const drift = Math.sin((frame + i * 11) / 80) * 6;
        const yOffset = ((seedY - (frame * speed) / 4) % 110 + 110) % 110;
        const size = 2 + (i % 4);
        const particleOpacity =
          (Math.sin((frame + i * 31) / 30) * 0.4 + 0.6) * intensity;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${seedX + drift}%`,
              top: `${yOffset}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 ${size * 3}px ${color}`,
              opacity: particleOpacity,
            }}
          />
        );
      })}
    </div>
  );
};
