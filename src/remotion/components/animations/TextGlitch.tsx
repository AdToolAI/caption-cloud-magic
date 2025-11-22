import React from 'react';
import { useCurrentFrame, random } from 'remotion';

interface TextGlitchProps {
  text: string;
  startFrame?: number;
  speed?: number;
  intensity?: number;
  style?: React.CSSProperties;
}

export const TextGlitch: React.FC<TextGlitchProps> = ({
  text,
  startFrame = 0,
  speed = 1,
  intensity = 5,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - startFrame);
  
  const glitchFrequency = 3 * speed;
  const shouldGlitch = adjustedFrame % Math.floor(30 / glitchFrequency) < 2;

  const offsetX = shouldGlitch ? random(`x-${frame}`) * intensity - intensity / 2 : 0;
  const offsetY = shouldGlitch ? random(`y-${frame}`) * intensity - intensity / 2 : 0;
  
  const colorShift = shouldGlitch ? random(`color-${frame}`) : 0;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {shouldGlitch && (
        <>
          <div
            style={{
              ...style,
              position: 'absolute',
              top: offsetY - 2,
              left: offsetX - 2,
              color: colorShift > 0.5 ? '#ff00ff' : '#00ffff',
              opacity: 0.8,
              mixBlendMode: 'screen',
            }}
          >
            {text}
          </div>
          <div
            style={{
              ...style,
              position: 'absolute',
              top: -offsetY + 2,
              left: -offsetX + 2,
              color: colorShift > 0.5 ? '#00ffff' : '#ff00ff',
              opacity: 0.8,
              mixBlendMode: 'screen',
            }}
          >
            {text}
          </div>
        </>
      )}
      <div
        style={{
          ...style,
          transform: `translate(${offsetX}px, ${offsetY}px)`,
        }}
      >
        {text}
      </div>
    </div>
  );
};
