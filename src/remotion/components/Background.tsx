import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';

interface BackgroundProps {
  type: 'image' | 'gradient' | 'color';
  imageUrl?: string;
  colors?: string[];
  animate?: boolean;
}

export const Background: React.FC<BackgroundProps> = ({
  type,
  imageUrl,
  colors = ['#000000', '#333333'],
  animate = false,
}) => {
  const frame = useCurrentFrame();

  if (type === 'image' && imageUrl) {
    const scale = animate
      ? interpolate(frame, [0, 300], [1.2, 1], {
          extrapolateRight: 'clamp',
        })
      : 1;

    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>
          <Img
            src={imageUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.5) 100%)',
          }}
        />
      </AbsoluteFill>
    );
  }

  if (type === 'gradient') {
    return (
      <AbsoluteFill
        style={{
          background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
        }}
      />
    );
  }

  return <AbsoluteFill style={{ backgroundColor: colors[0] }} />;
};
