import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { safeInterpolate, safeDuration } from '../../utils/safeInterpolate';

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
  const safeDur = safeDuration(durationInFrames, 30);

  const scale = safeInterpolate(
    frame,
    [0, safeDur],
    direction === 'in' ? [0.5, 1] : [1, 1.5]
  );

  const opacity = safeInterpolate(
    frame,
    [0, safeDur],
    direction === 'in' ? [0, 1] : [1, 0]
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
