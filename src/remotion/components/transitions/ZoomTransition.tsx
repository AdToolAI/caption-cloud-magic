import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

interface ZoomTransitionProps {
  direction: 'in' | 'out';
  durationInFrames: number;
  children: React.ReactNode;
}

export const ZoomTransition: React.FC<ZoomTransitionProps> = ({
  direction,
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(1, durationInFrames || 30);

  const scale = interpolate(
    frame,
    [0, safeDuration],
    direction === 'in' ? [0.5, 1] : [1, 1.5],
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
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
