import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

interface ZoomInProps {
  durationInFrames: number;
  intensity?: number;
  children: React.ReactNode;
}

export const ZoomIn: React.FC<ZoomInProps> = ({
  durationInFrames,
  intensity = 1.2,
  children,
}) => {
  const frame = useCurrentFrame();
  
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(1, durationInFrames || 30);

  const scale = interpolate(
    frame,
    [0, safeDuration],
    [1, intensity],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    >
      {children}
    </div>
  );
};
