import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

interface SlideTransitionProps {
  direction: 'left' | 'right' | 'up' | 'down';
  type: 'in' | 'out';
  durationInFrames: number;
  children: React.ReactNode;
}

export const SlideTransition: React.FC<SlideTransitionProps> = ({
  direction,
  type,
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(1, durationInFrames || 30);

  const getTransform = () => {
    const isIn = type === 'in';
    
    switch (direction) {
      case 'left':
        const translateX = interpolate(
          frame,
          [0, safeDuration],
          isIn ? [-100, 0] : [0, -100],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateX(${translateX}%)`;
      
      case 'right':
        const translateXRight = interpolate(
          frame,
          [0, safeDuration],
          isIn ? [100, 0] : [0, 100],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateX(${translateXRight}%)`;
      
      case 'up':
        const translateY = interpolate(
          frame,
          [0, safeDuration],
          isIn ? [-100, 0] : [0, -100],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateY(${translateY}%)`;
      
      case 'down':
        const translateYDown = interpolate(
          frame,
          [0, safeDuration],
          isIn ? [100, 0] : [0, 100],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        return `translateY(${translateYDown}%)`;
      
      default:
        return 'none';
    }
  };

  return (
    <AbsoluteFill style={{ transform: getTransform() }}>
      {children}
    </AbsoluteFill>
  );
};
