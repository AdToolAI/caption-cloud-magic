import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { safeInterpolate, safeDuration } from '../../utils/safeInterpolate';

interface CrossfadeTransitionProps {
  durationInFrames: number;
  fromScene: React.ReactNode;
  toScene: React.ReactNode;
}

export const CrossfadeTransition: React.FC<CrossfadeTransitionProps> = ({
  durationInFrames,
  fromScene,
  toScene,
}) => {
  const frame = useCurrentFrame();
  const safeDur = safeDuration(durationInFrames, 30);

  const fromOpacity = safeInterpolate(frame, [0, safeDur], [1, 0]);
  const toOpacity = safeInterpolate(frame, [0, safeDur], [0, 1]);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: fromOpacity }}>
        {fromScene}
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: toOpacity }}>
        {toScene}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
