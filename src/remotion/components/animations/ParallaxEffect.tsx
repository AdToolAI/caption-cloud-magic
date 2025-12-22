import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

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
  
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(1, durationInFrames || 30);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {layers.map((layer, index) => {
        const translateY = interpolate(
          frame,
          [0, safeDuration],
          [0, -20 * layer.depth],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }
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
