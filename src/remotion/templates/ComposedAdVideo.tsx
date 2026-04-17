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

// Single scene renderer — hard cuts only.
// Refined transitions are handled in Director's Cut after export.
const Scene: React.FC<{
  videoUrl: string;
  textOverlay?: ComposedAdVideoProps['scenes'][0]['textOverlay'];
  kineticText: boolean;
}> = ({ videoUrl, textOverlay, kineticText }) => {
  const frame = useCurrentFrame();

  return (
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
            delay={0}
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

  // Calculate frame offsets for each scene (hard cuts, no transition overlap)
  let frameOffset = 0;
  const sceneFrames = scenes.map((scene) => {
    const durationFrames = Math.ceil(scene.durationSeconds * fps);
    const entry = { from: frameOffset, duration: durationFrames };
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
