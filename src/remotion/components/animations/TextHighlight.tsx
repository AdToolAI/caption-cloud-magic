import React from 'react';
import { useCurrentFrame } from 'remotion';
import { safeInterpolate as interpolate, safeDuration } from '../../utils/safeInterpolate';

interface TextHighlightProps {
  text: string;
  startFrame?: number;
  speed?: number;
  highlightColor?: string;
  style?: React.CSSProperties;
}

export const TextHighlight: React.FC<TextHighlightProps> = ({
  text,
  startFrame = 0,
  speed = 1,
  highlightColor = '#FFD700',
  style = {},
}) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - startFrame);
  
  const animationDuration = 20 / speed;
  
  const highlightWidth = interpolate(
    adjustedFrame,
    [0, animationDuration],
    [0, 100],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          left: 0,
          width: `${highlightWidth}%`,
          height: '40%',
          backgroundColor: highlightColor,
          opacity: 0.5,
          zIndex: -1,
        }}
      />
      <span>{text}</span>
    </div>
  );
};
