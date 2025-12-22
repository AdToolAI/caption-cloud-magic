import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { safeInterpolate as interpolate, safeDuration } from '../../utils/safeInterpolate';

interface TextTypewriterProps {
  text: string;
  startFrame?: number;
  speed?: number;
  style?: React.CSSProperties;
}

export const TextTypewriter: React.FC<TextTypewriterProps> = ({
  text,
  startFrame = 0,
  speed = 1,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const charsPerSecond = 15 * speed;
  const charsPerFrame = charsPerSecond / fps;
  
  const adjustedFrame = Math.max(0, frame - startFrame);
  const visibleChars = Math.floor(adjustedFrame * charsPerFrame);
  const displayText = text.substring(0, Math.min(visibleChars, text.length));

  return (
    <div
      style={{
        ...style,
        fontFamily: style.fontFamily || 'monospace',
      }}
    >
      {displayText}
      {visibleChars < text.length && (
        <span style={{ opacity: interpolate(frame % 10, [0, 5], [0, 1], { extrapolateRight: 'clamp' }) }}>
          |
        </span>
      )}
    </div>
  );
};
