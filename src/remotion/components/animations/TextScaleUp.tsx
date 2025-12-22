import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { safeInterpolate as interpolate, safeDuration, safeSpring as spring } from '../../utils/safeInterpolate';

interface TextScaleUpProps {
  text: string;
  startFrame?: number;
  speed?: number;
  style?: React.CSSProperties;
}

export const TextScaleUp: React.FC<TextScaleUpProps> = ({
  text,
  startFrame = 0,
  speed = 1,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjustedFrame = Math.max(0, frame - startFrame);

  const scale = spring({
    frame: adjustedFrame,
    fps,
    config: {
      damping: 20 / speed,
      mass: 0.5,
      stiffness: 100 * speed,
    },
  });

  const opacity = interpolate(
    adjustedFrame,
    [0, 10 / speed],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <div
      style={{
        ...style,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      {text}
    </div>
  );
};
