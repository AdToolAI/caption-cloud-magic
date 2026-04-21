import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { safeInterpolate } from '../../utils/safeInterpolate';

interface GlowOrbsProps {
  color?: string;
  count?: number;
  intensity?: number; // 0-1
}

/**
 * Pulsating glow orbs — 100% Lambda-safe, frame-deterministic.
 * Uses CSS filter blur + radial gradients (no external assets).
 */
export const GlowOrbs: React.FC<GlowOrbsProps> = ({
  color = 'hsl(45, 90%, 60%)',
  count = 4,
  intensity = 0.4,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const safeCount = Math.max(1, Math.min(8, count));

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
        const offset = i * 73;
        const baseX = (i * 137) % 100;
        const baseY = (i * 191) % 100;
        const xDrift = Math.sin((frame + offset) / 60) * 8;
        const yDrift = Math.cos((frame + offset) / 75) * 8;
        const x = baseX + xDrift;
        const y = baseY + yDrift;
        const scale = 1 + Math.sin((frame + offset) / 40) * 0.3;
        const orbOpacity = safeInterpolate(
          Math.sin((frame + offset) / 50),
          [-1, 1],
          [intensity * 0.5, intensity]
        );
        const size = Math.min(width, height) * 0.35;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
              filter: 'blur(40px)',
              transform: `translate(-50%, -50%) scale(${scale})`,
              opacity: orbOpacity,
              mixBlendMode: 'screen',
            }}
          />
        );
      })}
    </div>
  );
};
