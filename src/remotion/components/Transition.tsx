import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

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

  const getTransform = () => {
    if (type === 'fade') {
      const opacity = interpolate(
        frame,
        direction === 'in' ? [0, duration] : [0, duration],
        direction === 'in' ? [0, 1] : [1, 0],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }
      );
      return { opacity };
    }

    if (type === 'slide') {
      const translateX = interpolate(
        frame,
        [0, duration],
        direction === 'in' ? [100, 0] : [0, -100],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }
      );
      return { transform: `translateX(${translateX}%)` };
    }

    if (type === 'zoom') {
      const scale = interpolate(
        frame,
        [0, duration],
        direction === 'in' ? [0.5, 1] : [1, 1.5],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }
      );
      return { transform: `scale(${scale})` };
    }

    return {};
  };

  return <AbsoluteFill style={getTransform()}>{children}</AbsoluteFill>;
};
