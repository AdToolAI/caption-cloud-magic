import React from 'react';
import { AbsoluteFill, Video, Audio, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { z } from 'zod';
import { KineticText } from '../components/KineticText';
import { ColorGrading } from '../components/ColorGrading';

// Schema
export const ComposedAdVideoSchema = z.object({
  scenes: z.array(z.object({
    videoUrl: z.string(),
    durationSeconds: z.number(),
    textOverlay: z.object({
      text: z.string(),
      position: z.enum(['top', 'center', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right']),
      animation: z.enum(['none', 'fade-in', 'scale-bounce', 'slide-left', 'slide-right', 'word-by-word', 'glow-pulse']),
      fontSize: z.number(),
      color: z.string(),
      fontFamily: z.string().optional(),
    }).optional(),
    transitionType: z.enum(['none', 'fade', 'crossfade', 'wipe', 'slide', 'zoom']).optional(),
    transitionDuration: z.number().optional(),
  })),
  colorGrading: z.enum(['none', 'cinematic-warm', 'cool-blue', 'vintage-film', 'high-contrast', 'moody-dark']).default('none'),
  kineticText: z.boolean().default(false),
  voiceoverUrl: z.string().optional(),
  backgroundMusicUrl: z.string().optional(),
  backgroundMusicVolume: z.number().default(0.3),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5']).default('16:9'),
});

type ComposedAdVideoProps = z.infer<typeof ComposedAdVideoSchema>;

// Transition component
const SceneTransition: React.FC<{
  type: string;
  progress: number; // 0-1
  children: React.ReactNode;
}> = ({ type, progress, children }) => {
  let style: React.CSSProperties = {};

  switch (type) {
    case 'fade':
      style = { opacity: interpolate(progress, [0, 1], [0, 1], { extrapolateRight: 'clamp' }) };
      break;
    case 'slide':
      style = { transform: `translateX(${interpolate(progress, [0, 1], [100, 0], { extrapolateRight: 'clamp' })}%)` };
      break;
    case 'zoom':
      style = {
        transform: `scale(${interpolate(progress, [0, 1], [1.3, 1], { extrapolateRight: 'clamp' })})`,
        opacity: interpolate(progress, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
      };
      break;
    case 'wipe': {
      const clip = interpolate(progress, [0, 1], [100, 0], { extrapolateRight: 'clamp' });
      style = { clipPath: `inset(0 ${clip}% 0 0)` };
      break;
    }
    default:
      break;
  }

  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

// Single scene renderer
const Scene: React.FC<{
  videoUrl: string;
  textOverlay?: ComposedAdVideoProps['scenes'][0]['textOverlay'];
  kineticText: boolean;
  transitionType: string;
  transitionFrames: number;
  durationFrames: number;
}> = ({ videoUrl, textOverlay, kineticText, transitionType, transitionFrames, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Transition in
  const transitionProgress = transitionFrames > 0
    ? interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;

  return (
    <SceneTransition type={transitionType} progress={transitionProgress}>
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        {videoUrl && (
          <Video
            src={videoUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            muted
          />
        )}
        {textOverlay?.text && (
          kineticText ? (
            <KineticText
              text={textOverlay.text}
              position={textOverlay.position as any}
              animation={textOverlay.animation as any}
              fontSize={textOverlay.fontSize}
              color={textOverlay.color}
              fontFamily={textOverlay.fontFamily}
              delay={Math.min(10, transitionFrames)}
            />
          ) : (
            <div style={{
              position: 'absolute',
              bottom: '10%',
              width: '100%',
              textAlign: 'center',
              padding: '0 40px',
            }}>
              <span style={{
                fontSize: textOverlay.fontSize,
                color: textOverlay.color,
                fontWeight: 700,
                fontFamily: textOverlay.fontFamily || 'Inter, sans-serif',
                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
                opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' }),
              }}>
                {textOverlay.text}
              </span>
            </div>
          )
        )}
      </AbsoluteFill>
    </SceneTransition>
  );
};

// Main composition
export const ComposedAdVideo: React.FC<ComposedAdVideoProps> = ({
  scenes,
  colorGrading,
  kineticText,
  voiceoverUrl,
  backgroundMusicUrl,
  backgroundMusicVolume,
}) => {
  const { fps } = useVideoConfig();

  // Calculate frame offsets for each scene
  let frameOffset = 0;
  const sceneFrames = scenes.map((scene) => {
    const durationFrames = Math.ceil(scene.durationSeconds * fps);
    const transitionFrames = Math.ceil((scene.transitionDuration || 0) * fps);
    const entry = { from: frameOffset, duration: durationFrames, transitionFrames };
    frameOffset += durationFrames;
    return entry;
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <ColorGrading preset={colorGrading as any}>
        {scenes.map((scene, i) => (
          <Sequence
            key={i}
            from={sceneFrames[i].from}
            durationInFrames={sceneFrames[i].duration}
          >
            <Scene
              videoUrl={scene.videoUrl}
              textOverlay={scene.textOverlay}
              kineticText={kineticText}
              transitionType={scene.transitionType || 'fade'}
              transitionFrames={sceneFrames[i].transitionFrames}
              durationFrames={sceneFrames[i].duration}
            />
          </Sequence>
        ))}
      </ColorGrading>

      {/* Voiceover */}
      {voiceoverUrl && (
        <Sequence from={0}>
          <Audio src={voiceoverUrl} volume={1} />
        </Sequence>
      )}

      {/* Background Music */}
      {backgroundMusicUrl && (
        <Sequence from={0}>
          <Audio src={backgroundMusicUrl} volume={backgroundMusicVolume} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
