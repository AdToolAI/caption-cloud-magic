import React from 'react';
import { useCurrentFrame } from 'remotion';
import { safeInterpolate, safeDuration } from '../../utils/safeInterpolate';

interface ParallaxEffectProps {
  durationInFrames: number;
  layers: Array<{
    depth: number;
    children: React.ReactNode;
  }>;
}

export const ParallaxEffect: React.FC<ParallaxEffectProps> = ({
  durationInFrames,
  layers,
}) => {
  const frame = useCurrentFrame();
  const safeDur = safeDuration(durationInFrames, 30);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {layers.map((layer, index) => {
        const translateY = safeInterpolate(
          frame,
          [0, safeDur],
          [0, -20 * layer.depth]
        );

        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              transform: `translateY(${translateY}px)`,
            }}
          >
            {layer.children}
          </div>
        );
      })}
    </div>
  );
};
