import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame } from 'remotion';
import { z } from 'zod';

export const AudioSmokeTestSchema = z.object({
  audioUrl: z.string(),
});

export const AudioSmokeTest: React.FC<z.infer<typeof AudioSmokeTestSchema>> = ({ audioUrl }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {audioUrl && <Audio src={audioUrl} volume={0.5} />}
      <div style={{ color: '#fff', fontSize: 32, fontFamily: 'Arial' }}>
        Audio Validation Frame {frame}
      </div>
    </AbsoluteFill>
  );
};
