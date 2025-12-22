import React from 'react';
import { useCurrentFrame } from 'remotion';
import { safeInterpolate, safeDuration } from '../../utils/safeInterpolate';

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
  const safeDur = safeDuration(durationInFrames, 30);

  const getTransform = () => {
    switch (direction) {
      case 'left': {
        const translateX = safeInterpolate(
          frame,
          [0, safeDur],
          [0, -distance]
        );
        return `translateX(${translateX}%)`;
      }
      case 'right': {
        const translateX = safeInterpolate(
          frame,
          [0, safeDur],
          [0, distance]
        );
        return `translateX(${translateX}%)`;
      }
      case 'up': {
        const translateY = safeInterpolate(
          frame,
          [0, safeDur],
          [0, -distance]
        );
        return `translateY(${translateY}%)`;
      }
      case 'down': {
        const translateY = safeInterpolate(
          frame,
          [0, safeDur],
          [0, distance]
        );
        return `translateY(${translateY}%)`;
      }
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
