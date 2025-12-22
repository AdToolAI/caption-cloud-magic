import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { safeInterpolate, safeDuration } from '../utils/safeInterpolate';

interface TransitionProps {
  type: 'fade' | 'slide' | 'zoom';
  direction?: 'in' | 'out';
  duration?: number;
  children: React.ReactNode;
}

export const Transition: React.FC<TransitionProps> = ({
  type,
  direction = 'in',
  duration = 20,
  children,
}) => {
  const frame = useCurrentFrame();
  const safeDur = safeDuration(duration, 20);

  const getTransform = () => {
    if (type === 'fade') {
      const opacity = safeInterpolate(
        frame,
        [0, safeDur],
        direction === 'in' ? [0, 1] : [1, 0]
      );
      return { opacity };
    }

    if (type === 'slide') {
      const translateX = safeInterpolate(
        frame,
        [0, safeDur],
        direction === 'in' ? [100, 0] : [0, -100]
      );
      return { transform: `translateX(${translateX}%)` };
    }

    if (type === 'zoom') {
      const scale = safeInterpolate(
        frame,
        [0, safeDur],
        direction === 'in' ? [0.5, 1] : [1, 1.5]
      );
      return { transform: `scale(${scale})` };
    }

    return {};
  };

  return <AbsoluteFill style={getTransform()}>{children}</AbsoluteFill>;
};
