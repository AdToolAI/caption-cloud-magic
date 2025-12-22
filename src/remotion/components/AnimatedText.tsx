import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { safeInterpolate } from '../utils/safeInterpolate';

interface AnimatedTextProps {
  text: string;
  opacity?: number;
  delay?: number;
  style?: React.CSSProperties;
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  opacity = 1,
  delay = 0,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const animationStart = delay;
  const animationDuration = 15;

  const scale = safeInterpolate(
    frame,
    [animationStart, animationStart + animationDuration],
    [0.8, 1]
  );

  const translateY = safeInterpolate(
    frame,
    [animationStart, animationStart + animationDuration],
    [20, 0]
  );

  return (
    <div
      style={{
        ...style,
        opacity,
        transform: `scale(${scale}) translateY(${translateY}px)`,
        textAlign: 'center',
        width: '100%',
        padding: '0 40px',
        textShadow: '0 2px 10px rgba(0,0,0,0.5)',
      }}
    >
      {text}
    </div>
  );
};
