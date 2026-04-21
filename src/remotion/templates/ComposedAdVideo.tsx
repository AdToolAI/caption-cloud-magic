import React from 'react';
import { AbsoluteFill, Video, Audio, Sequence, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { z } from 'zod';
import { KineticText } from '../components/KineticText';
import { ColorGrading } from '../components/ColorGrading';
import { TextOverlayRenderer } from '../components/TextOverlayRenderer';
import { KenBurnsImage, pickKenBurnsVariant } from '../components/KenBurnsImage';
import { SceneEffectsLayer, type SceneEffectConfig } from '../components/effects';
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

// Per-scene effect schema (mirrors src/remotion/components/effects/index.tsx)
const SceneEffectSchema = z.object({
  id: z.enum([
    'glow-orbs',
    'light-rays',
    'particle-field',
    'gradient-pulse',
    'edge-glow',
    'chromatic-aberration',
  ]),
  color: z.string().optional(),
  intensity: z.number().optional(),
});

// Schema
export const ComposedAdVideoSchema = z.object({
  scenes: z.array(z.object({
    videoUrl: z.string(),
    /** When true, `videoUrl` is treated as a still image and rendered with Ken-Burns. */
    isImage: z.boolean().optional(),
    /** SINGLE SOURCE OF TRUTH: this is the EFFECTIVE duration the edge function
     * has already probed/clamped against the real mp4 length. The renderer
     * takes it 1:1 — no further math. This guarantees Audio/Video geometry
     * stays in lock-step and eliminates the rubber-band effect at transitions. */
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
    /** Optional layered visual effects (Lambda-safe procedural Glow/Rays/Particles). */
    effects: z.array(SceneEffectSchema).optional(),
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
  watermark: z.object({
    enabled: z.boolean(),
    text: z.string(),
    position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']),
    size: z.enum(['small', 'medium', 'large']),
    opacity: z.number(),
  }).optional(),
});

type ComposedAdVideoProps = z.infer<typeof ComposedAdVideoSchema>;

// Plain scene renderer — no manual transitions, TransitionSeries handles all overlap/fade math.
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
          // Lock playback rate to 1.0 — prevents implicit speed warping when
          // Sequence/Video durations diverge.
          playbackRate={1}
          // Use Remotion default pauseWhenBuffering=true (matches DirectorsCut/
          // UniversalCreator) so audio stays glitch-free at scene boundaries.
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

// ---- UNIFORM CROSSFADE POLICY (2026-04-18b) ----
// All scenes use a single, uniform 15-frame (0.5s) crossfade. No per-scene
// choice — eliminates the bug class around mixed transition types. Audio
// (voiceover + bgmusic) lives OUTSIDE TransitionSeries in its own pre-buffer
// Sequence, so crossfades are acoustically invisible: only the video layer
// blends. `transitionType` / `transitionDuration` in the schema remain for
// forward compatibility but are ignored by this renderer.
const CROSSFADE_FRAMES = 15;

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
  watermark,
}) => {
  const { fps, durationInFrames, height } = useVideoConfig();

  // Hard cuts only — each scene's frame count is `round(durationSeconds * fps)`.
  // Audio timeline therefore equals the exact sum of scene frames, no overlap drift.
  const sceneFrames = scenes.map((scene) =>
    Math.max(1, Math.round(scene.durationSeconds * fps))
  );

  const musicVolume = clampVolume(backgroundMusicVolume ?? 0.3);
  const voEnabled = !!voiceoverUrl && voiceoverUrl.length > 0;
  const musicEnabled = !!backgroundMusicUrl && backgroundMusicUrl.length > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <ColorGrading preset={colorGrading as any}>
        {/* TransitionSeries with uniform 15-frame crossfade between scenes.
            `premountFor={60}` warms up the next decoder 60 frames before
            its in-point → no cold-start stall. Audio is decoupled (lives
            outside TransitionSeries), so the crossfade is silent. */}
        <TransitionSeries>
          {scenes.map((scene, i) => (
            <React.Fragment key={i}>
              <TransitionSeries.Sequence
                durationInFrames={sceneFrames[i]}
                premountFor={60}
              >
                <Scene
                  videoUrl={scene.videoUrl}
                  textOverlay={scene.textOverlay}
                  kineticText={kineticText}
                />
              </TransitionSeries.Sequence>
              {i < scenes.length - 1 && (
                <TransitionSeries.Transition
                  presentation={fade()}
                  timing={linearTiming({ durationInFrames: CROSSFADE_FRAMES })}
                />
              )}
            </React.Fragment>
          ))}
        </TransitionSeries>
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

      {/* ── WATERMARK OVERLAY (above scenes, below subtitles)
          Rendered as a single AbsoluteFill outside TransitionSeries so the
          stamp stays rock-stable through every crossfade. */}
      {watermark?.enabled && watermark.text && (() => {
        const sizePxMap = { small: 16, medium: 24, large: 36 } as const;
        const baseFontPx = sizePxMap[watermark.size] ?? 24;
        // Scale relative to 1080p reference height
        const scaledFontPx = Math.round((baseFontPx * height) / 1080);
        const pos = watermark.position;
        const justifyContent =
          pos === 'top-left' || pos === 'bottom-left'
            ? 'flex-start'
            : pos === 'top-right' || pos === 'bottom-right'
            ? 'flex-end'
            : 'center';
        const alignItems =
          pos === 'top-left' || pos === 'top-right'
            ? 'flex-start'
            : pos === 'bottom-left' || pos === 'bottom-right'
            ? 'flex-end'
            : 'center';
        return (
          <AbsoluteFill
            style={{
              display: 'flex',
              justifyContent,
              alignItems,
              padding: `${Math.round(height * 0.04)}px`,
              pointerEvents: 'none',
              zIndex: 50,
            }}
          >
            <span
              style={{
                fontSize: `${scaledFontPx}px`,
                color: '#FFFFFF',
                opacity: watermark.opacity,
                fontWeight: 600,
                fontFamily: 'Inter, sans-serif',
                textShadow: '0 2px 8px rgba(0,0,0,0.7)',
                letterSpacing: '0.02em',
              }}
            >
              {watermark.text}
            </span>
          </AbsoluteFill>
        );
      })()}

      {/* ── ONE-TRACK VOICEOVER (matches DirectorsCut/UniversalCreator pattern) ──
          CRITICAL FIX (2026-04-18): Both DirectorsCut and UniversalCreator use
          Remotion's DEFAULT `pauseWhenBuffering=true` and a stable `key` so
          React never remounts the <Audio> element across scene boundaries.
          The Composer was previously forcing `pauseWhenBuffering={false}`,
          which caused Lambda workers to keep audio playing even when the
          next scene's video chunk wasn't decoded yet → audible stutters /
          micro-cuts at every scene boundary. Now we mirror the working
          pattern: stable key + default buffering behavior.

          PRE-BUFFER (2026-04-18b): Wrap audio in a Sequence starting `-fps`
          frames before frame 0. This gives the audio decoder a full second
          to initialize before the first frame is rendered, eliminating
          initial cold-start audio glitches. */}
      {voEnabled && (
        <Sequence from={-fps} durationInFrames={durationInFrames + fps}>
          <Audio
            key="composer-voiceover-stable"
            src={voiceoverUrl as string}
            volume={1}
            loop={false}
            startFrom={0}
          />
        </Sequence>
      )}

      {/* Background Music — same stable-key + pre-buffer pattern */}
      {musicEnabled && (
        <Sequence from={-fps} durationInFrames={durationInFrames + fps}>
          <Audio
            key="composer-bgmusic-stable"
            src={backgroundMusicUrl as string}
            volume={musicVolume}
            startFrom={0}
            endAt={durationInFrames}
          />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
