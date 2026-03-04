import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

export const SmokeTestVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = Math.min(1, frame / 15);

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{ opacity, color: 'white', fontSize: 64, fontWeight: 'bold', textAlign: 'center' }}>
        SMOKE TEST OK
        <div style={{ fontSize: 24, marginTop: 20, opacity: 0.7 }}>
          Frame {frame} / 60
        </div>
      </div>
    </AbsoluteFill>
  );
};
