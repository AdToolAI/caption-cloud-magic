import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

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

  const fromOpacity = interpolate(frame, [0, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const toOpacity = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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
