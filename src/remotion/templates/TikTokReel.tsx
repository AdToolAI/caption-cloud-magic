import React from 'react';
import { AbsoluteFill, Video, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { AnimatedText } from '../components/AnimatedText';

export const TikTokReelSchema = z.object({
  videoUrl: z.string(),
  overlayText: z.string(),
  hashtags: z.string(),
});

type TikTokReelProps = z.infer<typeof TikTokReelSchema>;

export const TikTokReel: React.FC<TikTokReelProps> = ({
  videoUrl,
  overlayText,
  hashtags,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const overlayOpacity = interpolate(frame, [20, 35], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // ✅ Validate durationInFrames
  const safeDuration = Math.max(90, Number(durationInFrames) || 90);
  const hashtagStart = Math.max(0, safeDuration - 60);
  const hashtagEnd = Math.max(hashtagStart + 1, safeDuration - 45);

  const hashtagsOpacity = interpolate(
    frame,
    [hashtagStart, hashtagEnd],
    [0, 1],
    {
      extrapolateRight: 'clamp',
    }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Background Video */}
      <Video
        src={videoUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Dark Overlay for Text Readability */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 100%)',
        }}
      />

      {/* Overlay Text */}
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: overlayOpacity,
          textAlign: 'center',
          padding: '30px 50px',
          background: 'rgba(0, 0, 0, 0.6)',
          borderRadius: '20px',
        }}
      >
        <AnimatedText
          text={overlayText}
          style={{
            fontSize: 60,
            fontWeight: 'bold',
            color: 'white',
          }}
        />
      </div>

      {/* Hashtags */}
      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: hashtagsOpacity,
        }}
      >
        <span
          style={{
            fontSize: 32,
            color: '#00f2ea',
            fontWeight: 'bold',
          }}
        >
          {hashtags}
        </span>
      </div>
    </AbsoluteFill>
  );
};
