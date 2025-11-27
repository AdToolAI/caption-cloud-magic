import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

interface PushTransitionProps {
  direction: 'left' | 'right' | 'up' | 'down';
  type: 'in' | 'out';
  durationInFrames: number;
  children: React.ReactNode;
}

export const PushTransition: React.FC<PushTransitionProps> = ({
  direction,
  type,
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  const isIn = type === 'in';

  const getTransform = () => {
    switch (direction) {
      case 'left': {
        const translateX = interpolate(
          frame,
          [0, durationInFrames],
          isIn ? [100, 0] : [0, -100],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateX(${translateX}%)`;
      }
      case 'right': {
        const translateX = interpolate(
          frame,
          [0, durationInFrames],
          isIn ? [-100, 0] : [0, 100],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateX(${translateX}%)`;
      }
      case 'up': {
        const translateY = interpolate(
          frame,
          [0, durationInFrames],
          isIn ? [100, 0] : [0, -100],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateY(${translateY}%)`;
      }
      case 'down': {
        const translateY = interpolate(
          frame,
          [0, durationInFrames],
          isIn ? [-100, 0] : [0, 100],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateY(${translateY}%)`;
      }
      default:
        return 'none';
    }
  };

  return (
    <AbsoluteFill style={{ transform: getTransform() }}>
      {children}
    </AbsoluteFill>
  );
};
