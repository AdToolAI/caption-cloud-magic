import React from 'react';
import { useCurrentFrame } from 'remotion';
import { safeInterpolate, safeDuration } from '../../utils/safeInterpolate';

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
  const safeDur = safeDuration(durationInFrames, 30);

  const scale = safeInterpolate(
    frame,
    [0, safeDur],
    [1, intensity]
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
