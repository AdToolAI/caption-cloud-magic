import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { safeInterpolate, safeDuration } from '../../utils/safeInterpolate';

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
  const safeDur = safeDuration(durationInFrames, 30);

  const blur = safeInterpolate(
    frame,
    [0, safeDur],
    direction === 'in' ? [20, 0] : [0, 20]
  );

  const opacity = safeInterpolate(
    frame,
    [0, safeDur],
    direction === 'in' ? [0, 1] : [1, 0]
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
