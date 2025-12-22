import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { safeInterpolate, safeDuration } from '../../utils/safeInterpolate';

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
  const safeDur = safeDuration(durationInFrames, 30);

  const getClipPath = () => {
    const progress = safeInterpolate(
      frame,
      [0, safeDur],
      isIn ? [0, 100] : [100, 0]
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
