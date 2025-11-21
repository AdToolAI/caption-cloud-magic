import React from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';

export const UniversalVideoSchema = z.object({
  voiceoverUrl: z.string().optional(),
  voiceoverDuration: z.number().optional(),
  subtitles: z.array(z.object({
    id: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    text: z.string(),
    words: z.array(z.object({
      text: z.string(),
      startTime: z.number(),
      endTime: z.number(),
    })),
  })).optional(),
  subtitleStyle: z.object({
    position: z.enum(['top', 'center', 'bottom']),
    font: z.string(),
    fontSize: z.number(),
    color: z.string(),
    backgroundColor: z.string(),
    backgroundOpacity: z.number(),
    animation: z.enum(['none', 'fade', 'slide', 'bounce']),
    outlineStyle: z.enum(['none', 'stroke', 'box', 'box-stroke', 'glow', 'shadow']),
    outlineColor: z.string(),
    outlineWidth: z.number(),
  }).optional(),
  background: z.object({
    type: z.enum(['color', 'gradient', 'video', 'image']),
    color: z.string().optional(),
    gradientColors: z.array(z.string()).optional(),
    videoUrl: z.string().optional(),
    imageUrl: z.string().optional(),
  }).optional(),
});

type UniversalVideoProps = z.infer<typeof UniversalVideoSchema>;

const BackgroundLayer: React.FC<{ background?: UniversalVideoProps['background'] }> = ({ background }) => {
  if (!background) {
    return <AbsoluteFill style={{ backgroundColor: '#000000' }} />;
  }

  if (background.type === 'color') {
    return <AbsoluteFill style={{ backgroundColor: background.color || '#000000' }} />;
  }

  if (background.type === 'gradient' && background.gradientColors) {
    return (
      <AbsoluteFill
        style={{
          background: `linear-gradient(135deg, ${background.gradientColors[0] || '#000000'}, ${background.gradientColors[1] || '#333333'})`,
        }}
      />
    );
  }

  if (background.type === 'image' && background.imageUrl) {
    return (
      <AbsoluteFill>
        <img
          src={background.imageUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>
    );
  }

  if (background.type === 'video' && background.videoUrl) {
    return (
      <AbsoluteFill>
        <video
          src={background.videoUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          loop
          muted
        />
      </AbsoluteFill>
    );
  }

  return <AbsoluteFill style={{ backgroundColor: '#000000' }} />;
};

const SubtitleLayer: React.FC<{
  subtitles?: UniversalVideoProps['subtitles'];
  subtitleStyle?: UniversalVideoProps['subtitleStyle'];
}> = ({ subtitles, subtitleStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (!subtitles || !subtitleStyle) return null;

  const currentSegment = subtitles.find(
    (segment) => currentTime >= segment.startTime && currentTime <= segment.endTime
  );

  if (!currentSegment) return null;

  const currentWord = currentSegment.words.find(
    (word) => currentTime >= word.startTime && currentTime <= word.endTime
  );

  const getAnimationStyle = () => {
    if (subtitleStyle.animation === 'none') return {};

    const segmentProgress = (currentTime - currentSegment.startTime) / (currentSegment.endTime - currentSegment.startTime);

    if (subtitleStyle.animation === 'fade') {
      const opacity = interpolate(segmentProgress, [0, 0.1, 0.9, 1], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return { opacity };
    }

    if (subtitleStyle.animation === 'slide') {
      const translateY = interpolate(segmentProgress, [0, 0.15], [50, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return { transform: `translateY(${translateY}px)` };
    }

    if (subtitleStyle.animation === 'bounce') {
      const scale = interpolate(segmentProgress, [0, 0.1, 0.2], [0.8, 1.1, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return { transform: `scale(${scale})` };
    }

    return {};
  };

  const getOutlineStyle = () => {
    if (subtitleStyle.outlineStyle === 'none') return {};

    if (subtitleStyle.outlineStyle === 'stroke') {
      return {
        WebkitTextStroke: `${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineColor}`,
      };
    }

    if (subtitleStyle.outlineStyle === 'box') {
      return {
        backgroundColor: subtitleStyle.backgroundColor,
        padding: '8px 16px',
        borderRadius: '8px',
      };
    }

    if (subtitleStyle.outlineStyle === 'box-stroke') {
      return {
        backgroundColor: subtitleStyle.backgroundColor,
        padding: '8px 16px',
        borderRadius: '8px',
        border: `${subtitleStyle.outlineWidth}px solid ${subtitleStyle.outlineColor}`,
      };
    }

    if (subtitleStyle.outlineStyle === 'glow') {
      return {
        textShadow: `0 0 ${subtitleStyle.outlineWidth * 2}px ${subtitleStyle.outlineColor}`,
      };
    }

    if (subtitleStyle.outlineStyle === 'shadow') {
      return {
        textShadow: `${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth * 2}px ${subtitleStyle.outlineColor}`,
      };
    }

    return {};
  };

  const positionStyle = {
    top: subtitleStyle.position === 'top' ? '10%' : subtitleStyle.position === 'center' ? '50%' : 'auto',
    bottom: subtitleStyle.position === 'bottom' ? '10%' : 'auto',
    transform: subtitleStyle.position === 'center' ? 'translateY(-50%)' : 'none',
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        ...positionStyle,
      }}
    >
      <div
        style={{
          fontFamily: subtitleStyle.font,
          fontSize: subtitleStyle.fontSize,
          color: subtitleStyle.color,
          textAlign: 'center',
          maxWidth: '80%',
          ...getOutlineStyle(),
          ...getAnimationStyle(),
        }}
      >
        {currentSegment.words.map((word, index) => (
          <span
            key={index}
            style={{
              fontWeight: currentWord?.text === word.text ? 'bold' : 'normal',
              marginRight: '0.3em',
            }}
          >
            {word.text}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const UniversalVideo: React.FC<UniversalVideoProps> = ({
  voiceoverUrl,
  subtitles,
  subtitleStyle,
  background,
}) => {
  return (
    <AbsoluteFill>
      <BackgroundLayer background={background} />
      
      {voiceoverUrl && <Audio src={voiceoverUrl} />}
      
      <SubtitleLayer subtitles={subtitles} subtitleStyle={subtitleStyle} />
    </AbsoluteFill>
  );
};
