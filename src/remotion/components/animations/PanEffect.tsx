import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

interface PanEffectProps {
  durationInFrames: number;
  direction: 'left' | 'right' | 'up' | 'down';
  distance?: number;
  children: React.ReactNode;
}

export const PanEffect: React.FC<PanEffectProps> = ({
  durationInFrames,
  direction,
  distance = 20,
  children,
}) => {
  const frame = useCurrentFrame();

  const getTransform = () => {
    switch (direction) {
      case 'left':
        const translateXLeft = interpolate(
          frame,
          [0, durationInFrames],
          [0, -distance],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateX(${translateXLeft}%)`;
      case 'right':
        const translateXRight = interpolate(
          frame,
          [0, durationInFrames],
          [0, distance],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateX(${translateXRight}%)`;
      case 'up':
        const translateYUp = interpolate(
          frame,
          [0, durationInFrames],
          [0, -distance],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateY(${translateYUp}%)`;
      case 'down':
        const translateYDown = interpolate(
          frame,
          [0, durationInFrames],
          [0, distance],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateY(${translateYDown}%)`;
      default:
        return 'none';
    }
  };

  return (
    <div
      style={{
        width: '120%',
        height: '120%',
        transform: getTransform(),
      }}
    >
      {children}
    </div>
  );
};
