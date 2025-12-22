import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

interface BlurTransitionProps {
  direction: 'in' | 'out';
  durationInFrames: number;
  children: React.ReactNode;
}

export const BlurTransition: React.FC<BlurTransitionProps> = ({
  direction,
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(1, durationInFrames || 30);

  const blur = interpolate(
    frame,
    [0, safeDuration],
    direction === 'in' ? [20, 0] : [0, 20],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  const opacity = interpolate(
    frame,
    [0, safeDuration],
    direction === 'in' ? [0, 1] : [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <AbsoluteFill
      style={{
        filter: `blur(${blur}px)`,
        opacity,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
