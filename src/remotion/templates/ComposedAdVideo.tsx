import React from 'react';
import { AbsoluteFill, Video, Audio, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { z } from 'zod';
import { KineticText } from '../components/KineticText';
import { ColorGrading } from '../components/ColorGrading';
import { TextOverlayRenderer } from '../components/TextOverlayRenderer';
import {
  SUBTITLE_FONT_SIZE_MAP,
  SUBTITLE_DEFAULT_BG,
  SUBTITLE_DEFAULT_COLOR,
  SUBTITLE_DEFAULT_FONT_FAMILY,
  SUBTITLE_DEFAULT_FONT_SIZE,
  SUBTITLE_BOTTOM_PADDING,
  SUBTITLE_TOP_PADDING,
  SUBTITLE_Z_INDEX,
} from '../utils/subtitleConstants';

// ---- Subtitle schema (matches snake-free composer payload) ----
const SubtitleSegmentSchema = z.object({
  id: z.string(),
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

const SubtitleStyleSchema = z.object({
  font: z.string().optional(),
  size: z.number().optional(),
  color: z.string().optional(),
  background: z.string().optional(),
  position: z.enum(['top', 'bottom']).optional(),
}).partial();

// ---- Global Text Overlay schema (1:1 with TextOverlayRenderer) ----
const GlobalTextOverlaySchema = z.object({
  id: z.string(),
  text: z.string(),
  animation: z.enum(['fadeIn', 'scaleUp', 'bounce', 'typewriter', 'highlight', 'glitch']),
  position: z.enum(['top', 'center', 'bottom', 'bottomLeft', 'bottomRight', 'topLeft', 'topRight', 'centerLeft', 'centerRight', 'custom']),
  customPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  startTime: z.number(),
  endTime: z.number().nullable(),
  style: z.object({
    fontSize: z.enum(['sm', 'md', 'lg', 'xl']),
    color: z.string(),
    backgroundColor: z.string(),
    shadow: z.boolean(),
    fontFamily: z.string(),
  }),
});

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
  subtitles: z.object({
    enabled: z.boolean(),
    language: z.string().optional(),
    style: SubtitleStyleSchema.optional(),
    segments: z.array(SubtitleSegmentSchema),
  }).optional(),
  globalTextOverlays: z.array(GlobalTextOverlaySchema).optional(),
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

// ---- Inline subtitle renderer (mirrors DirectorsCut SubtitleClipRenderer) ----
const SubtitleSegmentRenderer: React.FC<{
  text: string;
  style?: z.infer<typeof SubtitleStyleSchema>;
}> = ({ text, style }) => {
  const position = style?.position || 'bottom';
  const fontSizeKey = SUBTITLE_DEFAULT_FONT_SIZE;
  return (
    <div style={{
      position: 'absolute',
      left: 0, right: 0, top: 0, bottom: 0,
      width: '100%', height: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: position === 'top' ? 'flex-start' : 'flex-end',
      paddingTop: position === 'top' ? SUBTITLE_TOP_PADDING : '5%',
      paddingBottom: position === 'top' ? '5%' : SUBTITLE_BOTTOM_PADDING,
      paddingLeft: '5%', paddingRight: '5%',
      pointerEvents: 'none',
      zIndex: SUBTITLE_Z_INDEX,
    }}>
      <div style={{
        backgroundColor: style?.background || SUBTITLE_DEFAULT_BG,
        color: style?.color || SUBTITLE_DEFAULT_COLOR,
        padding: '18px 32px',
        borderRadius: '10px',
        fontSize: style?.size ? `${style.size}px` : SUBTITLE_FONT_SIZE_MAP[fontSizeKey],
        fontFamily: style?.font || SUBTITLE_DEFAULT_FONT_FAMILY,
        fontWeight: 'bold',
        textAlign: 'center' as const,
        maxWidth: '85%',
        lineHeight: 1.35,
        textShadow: '0 2px 6px rgba(0,0,0,0.65)',
      }}>
        {text}
      </div>
    </div>
  );
};

const clampVolume = (v: number) => {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
};

// Main composition
export const ComposedAdVideo: React.FC<ComposedAdVideoProps> = ({
  scenes,
  colorGrading,
  kineticText,
  voiceoverUrl,
  backgroundMusicUrl,
  backgroundMusicVolume,
  subtitles,
  globalTextOverlays,
}) => {
  const { fps, durationInFrames } = useVideoConfig();

  // Calculate frame offsets for each scene (hard cuts, no transition overlap)
  let frameOffset = 0;
  const sceneFrames = scenes.map((scene) => {
    const durationFrames = Math.ceil(scene.durationSeconds * fps);
    const entry = { from: frameOffset, duration: durationFrames };
    frameOffset += durationFrames;
    return entry;
  });

  const musicVolume = clampVolume(backgroundMusicVolume ?? 0.3);
  const voEnabled = !!voiceoverUrl && voiceoverUrl.length > 0;
  const musicEnabled = !!backgroundMusicUrl && backgroundMusicUrl.length > 0;

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

      {/* Subtitles (above color grading so they stay readable) */}
      {subtitles?.enabled && Array.isArray(subtitles.segments) && subtitles.segments.map((seg) => {
        const startFrame = Math.max(0, Math.floor(seg.startTime * fps));
        const endFrame = Math.min(durationInFrames, Math.ceil(seg.endTime * fps));
        const segDuration = Math.max(1, endFrame - startFrame);
        return (
          <Sequence key={seg.id} from={startFrame} durationInFrames={segDuration}>
            <SubtitleSegmentRenderer text={seg.text} style={subtitles.style} />
          </Sequence>
        );
      })}

      {/* Global Text Overlays */}
      {Array.isArray(globalTextOverlays) && globalTextOverlays.map((overlay) => {
        const startFrame = Math.max(0, Math.floor(overlay.startTime * fps));
        const endFrameRaw = overlay.endTime != null
          ? Math.ceil(overlay.endTime * fps)
          : durationInFrames;
        const endFrame = Math.min(durationInFrames, endFrameRaw);
        const ovDuration = Math.max(1, endFrame - startFrame);
        return (
          <Sequence key={overlay.id} from={startFrame} durationInFrames={ovDuration}>
            <TextOverlayRenderer overlay={overlay as any} />
          </Sequence>
        );
      })}

      {/* Voiceover */}
      {voEnabled && (
        <Sequence from={0}>
          <Audio src={voiceoverUrl as string} volume={1} pauseWhenBuffering />
        </Sequence>
      )}

      {/* Background Music */}
      {musicEnabled && (
        <Sequence from={0}>
          <Audio src={backgroundMusicUrl as string} volume={musicVolume} pauseWhenBuffering />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
