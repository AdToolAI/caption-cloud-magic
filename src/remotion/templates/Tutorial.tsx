import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { AnimatedText } from '../components/AnimatedText';
import { Background } from '../components/Background';
import { safeInterpolate, safeDuration } from '../utils/safeInterpolate';

export const TutorialSchema = z.object({
  title: z.string(),
  steps: z.array(z.string()),
  voiceoverUrl: z.string().optional(),
});

type TutorialProps = z.infer<typeof TutorialSchema>;

export const Tutorial: React.FC<TutorialProps> = ({
  title,
  steps,
  voiceoverUrl,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const titleOpacity = safeInterpolate(frame, [10, 25], [0, 1]);

  // ✅ Validate durationInFrames - Minimum 100 Frames
  const safeDur = safeDuration(durationInFrames, 100);
  
  // Calculate frames per step with minimum
  const framesPerStep = Math.max(60, Math.floor((safeDur - 100) / Math.max(1, steps.length)));

  return (
    <AbsoluteFill>
      <Background type="gradient" colors={['#232526', '#414345']} />

      {voiceoverUrl && <Audio src={voiceoverUrl} />}

      {/* Title */}
      <div
        style={{
          position: 'absolute',
          top: '10%',
          width: '100%',
        }}
      >
        <AnimatedText
          text={title}
          opacity={titleOpacity}
          style={{
            fontSize: 72,
            fontWeight: 'bold',
            color: 'white',
          }}
        />
      </div>

      {/* Steps */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '0 100px',
        }}
      >
        {steps.map((step, index) => {
          const stepStart = 50 + index * framesPerStep;
          const stepEnd = stepStart + framesPerStep;

          // ✅ Sichere 4-Element Range berechnen
          const fadeIn = Math.min(20, framesPerStep * 0.25);
          const fadeOutStart = Math.max(stepStart + fadeIn + 1, stepEnd - 20);

          const stepOpacity = safeInterpolate(
            frame,
            [stepStart, stepStart + fadeIn, fadeOutStart, stepEnd],
            [0, 1, 1, 0]
          );

          const stepTranslateX = safeInterpolate(
            frame,
            [stepStart, stepStart + fadeIn],
            [-50, 0]
          );

          return (
            <div
              key={index}
              style={{
                opacity: stepOpacity,
                transform: `translateX(${stepTranslateX}px)`,
                marginBottom: 50,
                display: 'flex',
                alignItems: 'center',
                gap: 30,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 40,
                  fontWeight: 'bold',
                  color: 'white',
                }}
              >
                {index + 1}
              </div>
              <div
                style={{
                  fontSize: 48,
                  color: 'white',
                  fontWeight: '500',
                }}
              >
                {step}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
