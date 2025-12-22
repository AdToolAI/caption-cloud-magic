import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

interface FadeTransitionProps {
  direction: 'in' | 'out';
  durationInFrames: number;
  children: React.ReactNode;
}

export const FadeTransition: React.FC<FadeTransitionProps> = ({
  direction,
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(1, durationInFrames || 30);

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
    <AbsoluteFill style={{ opacity }}>
      {children}
    </AbsoluteFill>
  );
};
