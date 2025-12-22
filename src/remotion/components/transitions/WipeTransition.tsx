import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

interface WipeTransitionProps {
  direction: 'left' | 'right' | 'up' | 'down';
  type: 'in' | 'out';
  durationInFrames: number;
  children: React.ReactNode;
}

export const WipeTransition: React.FC<WipeTransitionProps> = ({
  direction,
  type,
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  const isIn = type === 'in';
  
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(1, durationInFrames || 30);

  const getClipPath = () => {
    const progress = interpolate(
      frame,
      [0, safeDuration],
      isIn ? [0, 100] : [100, 0],
      {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }
    );

    switch (direction) {
      case 'left':
        return `inset(0 ${100 - progress}% 0 0)`;
      case 'right':
        return `inset(0 0 0 ${100 - progress}%)`;
      case 'up':
        return `inset(0 0 ${100 - progress}% 0)`;
      case 'down':
        return `inset(${100 - progress}% 0 0 0)`;
      default:
        return 'none';
    }
  };

  return (
    <AbsoluteFill
      style={{
        clipPath: getClipPath(),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
