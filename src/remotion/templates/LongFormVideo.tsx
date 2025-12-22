import React from 'react';
import { AbsoluteFill, Sequence, Video, useVideoConfig, useCurrentFrame, Easing } from 'remotion';
import { safeInterpolate, safeDuration as safeDur } from '../utils/safeInterpolate';
import { z } from 'zod';

export const LongFormVideoSchema = z.object({
  scenes: z.array(z.object({
    videoUrl: z.string(),
    duration: z.number(), // in seconds
    transitionType: z.enum(['none', 'fade', 'crossfade', 'slide', 'zoom', 'wipe']).optional().default('none'),
    transitionDuration: z.number().optional().default(0.5),
  })),
  fps: z.number().optional().default(30),
  aspectRatio: z.string().optional().default('16:9'),
});

type LongFormVideoProps = z.infer<typeof LongFormVideoSchema>;

interface SceneSegment {
  videoUrl: string;
  startFrame: number;
  durationFrames: number;
  transitionType: string;
  transitionDurationFrames: number;
}

export const LongFormVideo: React.FC<LongFormVideoProps> = ({ scenes, fps = 30 }) => {
  const { width, height } = useVideoConfig();

  // Calculate scene segments with frame positions
  const sceneSegments: SceneSegment[] = [];
  let currentFrame = 0;

  scenes.forEach((scene, index) => {
    const durationFrames = Math.ceil(scene.duration * fps);
    const transitionDurationFrames = Math.ceil((scene.transitionDuration || 0.5) * fps);

    sceneSegments.push({
      videoUrl: scene.videoUrl,
      startFrame: currentFrame,
      durationFrames,
      transitionType: scene.transitionType || 'none',
      transitionDurationFrames,
    });

    // Advance frame counter (subtract transition overlap for crossfade)
    if (scene.transitionType === 'crossfade' && index < scenes.length - 1) {
      currentFrame += durationFrames - transitionDurationFrames;
    } else {
      currentFrame += durationFrames;
    }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {sceneSegments.map((segment, index) => {
        const nextSegment = sceneSegments[index + 1];
        const hasTransitionOut = nextSegment && segment.transitionType !== 'none';

        return (
          <Sequence
            key={index}
            from={segment.startFrame}
            durationInFrames={segment.durationFrames}
          >
            <SceneWithTransition
              videoUrl={segment.videoUrl}
              durationFrames={segment.durationFrames}
              transitionType={segment.transitionType}
              transitionDurationFrames={segment.transitionDurationFrames}
              hasTransitionOut={hasTransitionOut}
              width={width}
              height={height}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

interface SceneWithTransitionProps {
  videoUrl: string;
  durationFrames: number;
  transitionType: string;
  transitionDurationFrames: number;
  hasTransitionOut: boolean;
  width: number;
  height: number;
}

const SceneWithTransition: React.FC<SceneWithTransitionProps> = ({
  videoUrl,
  durationFrames,
  transitionType,
  transitionDurationFrames,
  hasTransitionOut,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  
  // Use safe duration values
  const safeTransitionDuration = safeDur(transitionDurationFrames, 15);
  const safeDurationFrames = safeDur(durationFrames, 60);

  // Calculate transition effects
  let opacity = 1;
  let transform = 'none';

  // Fade in at start
  if (transitionType === 'fade' || transitionType === 'crossfade') {
    if (frame < safeTransitionDuration) {
      opacity = safeInterpolate(frame, [0, safeTransitionDuration], [0, 1], {
        easing: Easing.inOut(Easing.ease),
      });
    }
  }

  // Fade out at end
  if (hasTransitionOut && (transitionType === 'fade' || transitionType === 'crossfade')) {
    const fadeOutStart = Math.max(0, safeDurationFrames - safeTransitionDuration);
    if (frame > fadeOutStart) {
      opacity = safeInterpolate(frame, [fadeOutStart, safeDurationFrames], [1, 0], {
        easing: Easing.inOut(Easing.ease),
      });
    }
  }

  // Slide transition
  if (transitionType === 'slide') {
    if (frame < safeTransitionDuration) {
      const slideProgress = safeInterpolate(frame, [0, safeTransitionDuration], [100, 0], {
        easing: Easing.out(Easing.cubic),
      });
      transform = `translateX(${slideProgress}%)`;
    }
  }

  // Zoom transition
  if (transitionType === 'zoom') {
    if (frame < safeTransitionDuration) {
      const scale = safeInterpolate(frame, [0, safeTransitionDuration], [0.8, 1], {
        easing: Easing.out(Easing.cubic),
      });
      opacity = safeInterpolate(frame, [0, safeTransitionDuration], [0, 1], {
        easing: Easing.inOut(Easing.ease),
      });
      transform = `scale(${scale})`;
    }
  }

  // Wipe transition
  if (transitionType === 'wipe') {
    if (frame < safeTransitionDuration) {
      const clipProgress = safeInterpolate(frame, [0, safeTransitionDuration], [0, 100], {
        easing: Easing.inOut(Easing.ease),
      });
      return (
        <AbsoluteFill
          style={{
            clipPath: `inset(0 ${100 - clipProgress}% 0 0)`,
          }}
        >
          <Video
            src={videoUrl}
            style={{ width, height, objectFit: 'cover' }}
            pauseWhenBuffering
          />
        </AbsoluteFill>
      );
    }
  }

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform,
      }}
    >
      <Video
        src={videoUrl}
        style={{ width, height, objectFit: 'cover' }}
        pauseWhenBuffering
      />
    </AbsoluteFill>
  );
};

export default LongFormVideo;
