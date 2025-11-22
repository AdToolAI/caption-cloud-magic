import React from 'react';
import { interpolate, useCurrentFrame, Easing } from 'remotion';

interface TextBounceProps {
  text: string;
  startFrame?: number;
  speed?: number;
  style?: React.CSSProperties;
}

export const TextBounce: React.FC<TextBounceProps> = ({
  text,
  startFrame = 0,
  speed = 1,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - startFrame);
  
  const animationDuration = 30 / speed;
  
  const translateY = interpolate(
    adjustedFrame,
    [0, animationDuration * 0.4, animationDuration * 0.6, animationDuration],
    [-50, 10, -5, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    }
  );

  const opacity = interpolate(
    adjustedFrame,
    [0, animationDuration * 0.2],
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
        transform: `translateY(${translateY}px)`,
        opacity,
      }}
    >
      {text}
    </div>
  );
};
