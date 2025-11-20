import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { z } from 'zod';
import { AnimatedText } from '../components/AnimatedText';
import { Background } from '../components/Background';

export const InstagramStorySchema = z.object({
  backgroundUrl: z.string(),
  headline: z.string(),
  text: z.string(),
});

type InstagramStoryProps = z.infer<typeof InstagramStorySchema>;

export const InstagramStory: React.FC<InstagramStoryProps> = ({
  backgroundUrl,
  headline,
  text,
}) => {
  const frame = useCurrentFrame();

  const headlineOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const textOpacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      <Background type="image" imageUrl={backgroundUrl} animate />

      {/* Content Container */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '60px',
        }}
      >
        <AnimatedText
          text={headline}
          opacity={headlineOpacity}
          style={{
            fontSize: 72,
            fontWeight: 'bold',
            color: 'white',
            marginBottom: 40,
          }}
        />

        <AnimatedText
          text={text}
          opacity={textOpacity}
          delay={20}
          style={{
            fontSize: 36,
            color: 'white',
            lineHeight: 1.5,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
