import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { safeInterpolate, safeDuration } from '../../utils/safeInterpolate';

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
  const safeDur = safeDuration(durationInFrames, 30);

  const getTransform = () => {
    switch (direction) {
      case 'left': {
        const translateX = safeInterpolate(
          frame,
          [0, safeDur],
          isIn ? [100, 0] : [0, -100]
        );
        return `translateX(${translateX}%)`;
      }
      case 'right': {
        const translateX = safeInterpolate(
          frame,
          [0, safeDur],
          isIn ? [-100, 0] : [0, 100]
        );
        return `translateX(${translateX}%)`;
      }
      case 'up': {
        const translateY = safeInterpolate(
          frame,
          [0, safeDur],
          isIn ? [100, 0] : [0, -100]
        );
        return `translateY(${translateY}%)`;
      }
      case 'down': {
        const translateY = safeInterpolate(
          frame,
          [0, safeDur],
          isIn ? [-100, 0] : [0, 100]
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
