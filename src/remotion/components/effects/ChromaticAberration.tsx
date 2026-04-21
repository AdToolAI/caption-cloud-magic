import React from 'react';
import { useCurrentFrame } from 'remotion';
import { safeInterpolate } from '../../utils/safeInterpolate';

interface ChromaticAberrationProps {
  intensity?: number;
}

/**
 * RGB-split chromatic aberration overlay for hero / tech moments.
 * Built with three layered gradient strips offset by RGB.
 */
export const ChromaticAberration: React.FC<ChromaticAberrationProps> = ({
  intensity = 0.4,
}) => {
  const frame = useCurrentFrame();
  const offset = safeInterpolate(
    Math.sin(frame / 30),
    [-1, 1],
    [-3, 3]
  );

  const layerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    mixBlendMode: 'screen',
    opacity: intensity * 0.5,
  };

  return (
    <>
      <div
        style={{
          ...layerStyle,
          background: 'radial-gradient(ellipse at center, transparent 50%, hsl(0, 100%, 50%) 100%)',
          transform: `translate(${offset}px, 0)`,
        }}
      />
      <div
        style={{
          ...layerStyle,
          background: 'radial-gradient(ellipse at center, transparent 50%, hsl(120, 100%, 50%) 100%)',
        }}
      />
      <div
        style={{
          ...layerStyle,
          background: 'radial-gradient(ellipse at center, transparent 50%, hsl(240, 100%, 50%) 100%)',
          transform: `translate(${-offset}px, 0)`,
        }}
      />
    </>
  );
};
