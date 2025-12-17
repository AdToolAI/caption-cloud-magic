import React, { useMemo } from 'react';
import { 
  AbsoluteFill, 
  Audio,
  Video,
  Img, 
  Sequence, 
  useCurrentFrame, 
  useVideoConfig,
  interpolate,
  spring,
  staticFile,
  Html5Audio,
} from 'remotion';
import { z } from 'zod';

// Fallback image for missing visuals
const FALLBACK_IMAGE = 'data:image/svg+xml;base64,' + btoa(`
<svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F5C76A" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <ellipse cx="960" cy="540" rx="400" ry="300" fill="url(#glow)"/>
  <circle cx="960" cy="480" r="80" fill="#F5C76A" opacity="0.3"/>
  <circle cx="960" cy="480" r="50" fill="#F5C76A"/>
  <polygon points="940,450 990,480 940,510" fill="white"/>
</svg>
`);

// Scene schema for Universal Creator
const UniversalCreatorSceneSchema = z.object({
  id: z.string(),
  order: z.number(),
  type: z.enum(['hook', 'problem', 'solution', 'feature', 'proof', 'cta', 'intro', 'outro', 'transition']).default('hook'),
  title: z.string().optional(),
  spokenText: z.string().optional(),
  visualDescription: z.string().optional(),
  duration: z.number().default(5),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  background: z.object({
    type: z.enum(['color', 'gradient', 'video', 'image']),
    color: z.string().optional(),
    gradientColors: z.array(z.string()).optional(),
    videoUrl: z.string().optional(),
    imageUrl: z.string().optional(),
  }),
  animation: z.enum(['fadeIn', 'slideUp', 'slideLeft', 'slideRight', 'zoomIn', 'zoomOut', 'bounce', 'none', 'kenBurns', 'parallax', 'popIn', 'flyIn', 'morphIn']).default('fadeIn'),
  kenBurnsDirection: z.enum(['in', 'out', 'left', 'right', 'up', 'down']).default('in'),
  transition: z.object({
    type: z.enum(['none', 'fade', 'crossfade', 'slide', 'zoom', 'wipe', 'blur', 'push', 'morph']),
    duration: z.number(),
    direction: z.enum(['left', 'right', 'up', 'down']).optional(),
  }),
  textOverlay: z.object({
    enabled: z.boolean().default(false),
    text: z.string().optional(),
    position: z.enum(['top', 'center', 'bottom']).default('center'),
    fontSize: z.number().default(64),
    fontColor: z.string().default('#FFFFFF'),
    animation: z.enum(['typewriter', 'fadeWords', 'highlight', 'splitReveal', 'glowPulse', 'bounceIn', 'waveIn', 'none']).default('fadeWords'),
  }).optional(),
});

// Subtitle schema
const SubtitleSchema = z.object({
  id: z.string(),
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  words: z.array(z.object({
    text: z.string(),
    startTime: z.number(),
    endTime: z.number(),
  })).optional(),
});

// Main schema for Universal Creator Video
export const UniversalCreatorVideoSchema = z.object({
  // Content
  scenes: z.array(UniversalCreatorSceneSchema).default([]),
  subtitles: z.array(SubtitleSchema).optional(),
  
  // Audio
  voiceoverUrl: z.string().optional(),
  voiceoverDuration: z.number().optional(),
  backgroundMusicUrl: z.string().optional(),
  backgroundMusicVolume: z.number().default(0.2),
  masterVolume: z.number().default(1.0),
  
  // Video settings
  targetWidth: z.number().optional(),
  targetHeight: z.number().optional(),
  fps: z.number().default(30),
  
  // Category & Style
  category: z.enum([
    'product-ad', 'social-reel', 'explainer', 'testimonial', 
    'tutorial', 'event-promo', 'brand-story', 'educational',
    'announcement', 'behind-scenes', 'comparison', 'showcase'
  ]).default('social-reel'),
  
  storytellingStructure: z.enum([
    'hook-problem-solution', 'aida', 'pas', 'hero-journey',
    'before-after', 'three-act', 'listicle', 'day-in-life',
    'challenge', 'transformation'
  ]).default('hook-problem-solution'),
  
  // Styling
  primaryColor: z.string().default('#F5C76A'),
  secondaryColor: z.string().default('#22d3ee'),
  fontFamily: z.string().default('Inter'),
  
  // Subtitle styling
  subtitleStyle: z.object({
    position: z.enum(['top', 'center', 'bottom']).default('bottom'),
    fontSize: z.number().default(48),
    fontColor: z.string().default('#FFFFFF'),
    backgroundColor: z.string().default('#000000'),
    backgroundOpacity: z.number().default(0.7),
    animation: z.enum(['none', 'fade', 'slide', 'bounce', 'typewriter', 'highlight', 'scaleUp', 'glitch', 'wordByWord']).default('highlight'),
    outlineStyle: z.enum(['none', 'stroke', 'box', 'box-stroke', 'glow', 'shadow']).default('glow'),
    outlineColor: z.string().default('#000000'),
    outlineWidth: z.number().default(2),
  }).optional(),
  
  // Features
  showProgressBar: z.boolean().default(false),
  showWatermark: z.boolean().default(false),
  watermarkText: z.string().optional(),
});

export type UniversalCreatorVideoProps = z.infer<typeof UniversalCreatorVideoSchema>;
type UniversalCreatorScene = z.infer<typeof UniversalCreatorSceneSchema>;
type Subtitle = z.infer<typeof SubtitleSchema>;

// Ken Burns Effect Component
const KenBurnsImage: React.FC<{
  imageUrl: string;
  direction: string;
  frame: number;
  durationInFrames: number;
}> = ({ imageUrl, direction, frame, durationInFrames }) => {
  const progress = frame / durationInFrames;
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  
  const startScale = 1.0;
  const endScale = 1.2;
  const panDistance = 10;
  
  let transform = '';
  switch (direction) {
    case 'in':
      transform = `scale(${interpolate(progress, [0, 1], [startScale, endScale], { extrapolateRight: 'clamp' })})`;
      break;
    case 'out':
      transform = `scale(${interpolate(progress, [0, 1], [endScale, startScale], { extrapolateRight: 'clamp' })})`;
      break;
    case 'left':
      transform = `scale(1.15) translateX(${interpolate(progress, [0, 1], [0, -panDistance])}%)`;
      break;
    case 'right':
      transform = `scale(1.15) translateX(${interpolate(progress, [0, 1], [0, panDistance])}%)`;
      break;
    case 'up':
      transform = `scale(1.15) translateY(${interpolate(progress, [0, 1], [0, -panDistance])}%)`;
      break;
    case 'down':
      transform = `scale(1.15) translateY(${interpolate(progress, [0, 1], [0, panDistance])}%)`;
      break;
    default:
      transform = `scale(${interpolate(progress, [0, 1], [1, 1.1])})`;
  }
  
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity }}>
      <Img
        src={imageUrl || FALLBACK_IMAGE}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform,
          transformOrigin: 'center center',
        }}
      />
    </div>
  );
};

// Animated Text Component
const AnimatedText: React.FC<{
  text: string;
  animation: string;
  frame: number;
  durationInFrames: number;
  primaryColor: string;
  fps: number;
}> = ({ text, animation, frame, durationInFrames, primaryColor, fps }) => {
  const words = text.split(' ');
  
  switch (animation) {
    case 'typewriter':
      const charsToShow = Math.floor(interpolate(frame, [0, durationInFrames * 0.7], [0, text.length], { extrapolateRight: 'clamp' }));
      return (
        <span>
          {text.slice(0, charsToShow)}
          <span style={{ opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0 }}>|</span>
        </span>
      );
    
    case 'fadeWords':
      return (
        <span>
          {words.map((word, i) => {
            const wordDelay = i * 5;
            const wordOpacity = interpolate(frame - wordDelay, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const wordY = interpolate(frame - wordDelay, [0, 10], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  opacity: wordOpacity,
                  transform: `translateY(${wordY}px)`,
                  marginRight: '0.25em',
                }}
              >
                {word}
              </span>
            );
          })}
        </span>
      );
    
    case 'splitReveal':
      return (
        <span>
          {words.map((word, i) => {
            const wordDelay = i * 4;
            const revealProgress = spring({
              frame: frame - wordDelay,
              fps,
              config: { damping: 15, stiffness: 100 },
            });
            return (
              <span key={i} style={{ display: 'inline-block', overflow: 'hidden', marginRight: '0.25em' }}>
                <span style={{ display: 'inline-block', transform: `translateY(${(1 - revealProgress) * 100}%)` }}>
                  {word}
                </span>
              </span>
            );
          })}
        </span>
      );
    
    case 'glowPulse':
      const glowIntensity = interpolate(Math.sin(frame * 0.1), [-1, 1], [0, 20]);
      return (
        <span style={{ textShadow: `0 0 ${glowIntensity}px ${primaryColor}, 0 0 ${glowIntensity * 2}px ${primaryColor}` }}>
          {text}
        </span>
      );
    
    case 'highlight':
      const highlightWidth = interpolate(frame, [10, 30], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return (
        <span style={{ position: 'relative' }}>
          {text}
          <span style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: 4,
            width: `${highlightWidth}%`,
            background: primaryColor,
            borderRadius: 2,
          }} />
        </span>
      );
    
    case 'bounceIn':
      return (
        <span>
          {words.map((word, i) => {
            const wordDelay = i * 3;
            const bounceProgress = spring({
              frame: frame - wordDelay,
              fps,
              config: { damping: 8, stiffness: 200 },
            });
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  transform: `scale(${bounceProgress}) translateY(${(1 - bounceProgress) * -30}px)`,
                  opacity: bounceProgress,
                  marginRight: '0.25em',
                }}
              >
                {word}
              </span>
            );
          })}
        </span>
      );
    
    default:
      return <span>{text}</span>;
  }
};

// Scene Background Component
const SceneBackground: React.FC<{
  scene: UniversalCreatorScene;
  frame: number;
  durationInFrames: number;
  fps: number;
}> = ({ scene, frame, durationInFrames, fps }) => {
  const { background, animation, kenBurnsDirection } = scene;
  
  // Entry animation
  const entryOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  
  // Animation transforms
  const getAnimationStyle = () => {
    switch (animation) {
      case 'fadeIn':
        return { opacity: entryOpacity };
      case 'slideUp':
        const slideUpY = interpolate(frame, [0, 20], [50, 0], { extrapolateRight: 'clamp' });
        return { opacity: entryOpacity, transform: `translateY(${slideUpY}px)` };
      case 'slideLeft':
        const slideLeftX = interpolate(frame, [0, 20], [100, 0], { extrapolateRight: 'clamp' });
        return { opacity: entryOpacity, transform: `translateX(${slideLeftX}px)` };
      case 'slideRight':
        const slideRightX = interpolate(frame, [0, 20], [-100, 0], { extrapolateRight: 'clamp' });
        return { opacity: entryOpacity, transform: `translateX(${slideRightX}px)` };
      case 'zoomIn':
        const zoomScale = interpolate(frame, [0, 20], [0.8, 1], { extrapolateRight: 'clamp' });
        return { opacity: entryOpacity, transform: `scale(${zoomScale})` };
      case 'zoomOut':
        const zoomOutScale = interpolate(frame, [0, 20], [1.2, 1], { extrapolateRight: 'clamp' });
        return { opacity: entryOpacity, transform: `scale(${zoomOutScale})` };
      case 'bounce':
        const bounceScale = spring({ frame, fps, config: { damping: 8, stiffness: 200 } });
        return { opacity: 1, transform: `scale(${bounceScale})` };
      case 'popIn':
        const popScale = spring({ frame, fps, config: { damping: 12, stiffness: 300 } });
        return { opacity: popScale, transform: `scale(${0.5 + popScale * 0.5})` };
      default:
        return { opacity: 1 };
    }
  };
  
  // Ken Burns special handling
  if (animation === 'kenBurns' && background.type === 'image' && background.imageUrl) {
    return (
      <KenBurnsImage
        imageUrl={background.imageUrl}
        direction={kenBurnsDirection}
        frame={frame}
        durationInFrames={durationInFrames}
      />
    );
  }
  
  // Render background based on type
  const renderBackground = () => {
    if (background.type === 'color') {
      return <AbsoluteFill style={{ backgroundColor: background.color || '#000000' }} />;
    }
    
    if (background.type === 'gradient' && background.gradientColors) {
      return (
        <AbsoluteFill
          style={{
            background: `linear-gradient(135deg, ${background.gradientColors[0]}, ${background.gradientColors[1] || '#333333'})`,
          }}
        />
      );
    }
    
    if (background.type === 'image' && background.imageUrl) {
      return (
        <AbsoluteFill>
          <Img
            src={background.imageUrl || FALLBACK_IMAGE}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      );
    }
    
    if (background.type === 'video' && background.videoUrl) {
      return (
        <AbsoluteFill>
          <Video
            src={background.videoUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loop
            muted
          />
        </AbsoluteFill>
      );
    }
    
    return <AbsoluteFill style={{ backgroundColor: '#000000' }} />;
  };
  
  return (
    <AbsoluteFill style={getAnimationStyle()}>
      {renderBackground()}
    </AbsoluteFill>
  );
};

// Text Overlay Component
const TextOverlay: React.FC<{
  scene: UniversalCreatorScene;
  frame: number;
  durationInFrames: number;
  primaryColor: string;
  fps: number;
}> = ({ scene, frame, durationInFrames, primaryColor, fps }) => {
  const textOverlay = scene.textOverlay;
  if (!textOverlay?.enabled || !textOverlay.text) return null;
  
  const positionStyles: Record<string, React.CSSProperties> = {
    top: { top: 80, justifyContent: 'flex-start' },
    center: { top: '50%', transform: 'translateY(-50%)' },
    bottom: { bottom: 120, justifyContent: 'flex-end' },
  };
  
  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 60px',
        ...positionStyles[textOverlay.position],
      }}
    >
      <div
        style={{
          fontSize: textOverlay.fontSize,
          color: textOverlay.fontColor,
          fontFamily: "'Inter', sans-serif",
          fontWeight: 700,
          textAlign: 'center',
          textShadow: '0 4px 20px rgba(0,0,0,0.5)',
          maxWidth: '80%',
        }}
      >
        <AnimatedText
          text={textOverlay.text}
          animation={textOverlay.animation}
          frame={frame}
          durationInFrames={durationInFrames}
          primaryColor={primaryColor}
          fps={fps}
        />
      </div>
    </AbsoluteFill>
  );
};

// Subtitle Layer Component
const SubtitleLayer: React.FC<{
  subtitles?: Subtitle[];
  subtitleStyle?: UniversalCreatorVideoProps['subtitleStyle'];
  frame: number;
  fps: number;
}> = ({ subtitles, subtitleStyle, frame, fps }) => {
  if (!subtitles || !subtitleStyle) return null;
  
  const currentTime = frame / fps;
  const currentSegment = subtitles.find(
    (s) => currentTime >= s.startTime && currentTime <= s.endTime
  );
  
  if (!currentSegment) return null;
  
  const segmentProgress = (currentTime - currentSegment.startTime) / (currentSegment.endTime - currentSegment.startTime);
  const words = currentSegment.text.split(' ');
  
  // Entry/exit animations
  const entryOpacity = interpolate(currentTime - currentSegment.startTime, [0, 0.15], [0, 1], { extrapolateRight: 'clamp' });
  const exitOpacity = interpolate(currentSegment.endTime - currentTime, [0, 0.15], [0, 1], { extrapolateRight: 'clamp' });
  
  const getPositionStyles = () => {
    switch (subtitleStyle.position) {
      case 'top': return { top: 60 };
      case 'center': return { top: '50%', transform: 'translateY(-50%)' };
      default: return { bottom: 80 };
    }
  };
  
  const getOutlineStyle = (): React.CSSProperties => {
    switch (subtitleStyle.outlineStyle) {
      case 'stroke':
        return { WebkitTextStroke: `${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineColor}` };
      case 'glow':
        return { textShadow: `0 0 ${subtitleStyle.outlineWidth * 3}px ${subtitleStyle.outlineColor}, 0 0 ${subtitleStyle.outlineWidth * 6}px ${subtitleStyle.outlineColor}` };
      case 'shadow':
        return { textShadow: `${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth * 2}px ${subtitleStyle.outlineColor}` };
      case 'box':
        return { backgroundColor: `rgba(0,0,0,${subtitleStyle.backgroundOpacity})`, padding: '8px 20px', borderRadius: 8 };
      default:
        return {};
    }
  };
  
  const renderText = () => {
    switch (subtitleStyle.animation) {
      case 'wordByWord':
        const wordsToShow = Math.ceil(segmentProgress * words.length);
        return words.slice(0, wordsToShow).join(' ');
      
      case 'highlight':
        const highlightIndex = Math.floor(segmentProgress * words.length);
        return (
          <span>
            {words.map((word, i) => (
              <span
                key={i}
                style={{
                  color: i === highlightIndex ? '#F5C76A' : subtitleStyle.fontColor,
                  fontWeight: i === highlightIndex ? 800 : 600,
                  marginRight: '0.2em',
                }}
              >
                {word}
              </span>
            ))}
          </span>
        );
      
      default:
        return currentSegment.text;
    }
  };
  
  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        ...getPositionStyles(),
        opacity: Math.min(entryOpacity, exitOpacity),
      }}
    >
      <div
        style={{
          fontSize: subtitleStyle.fontSize,
          color: subtitleStyle.fontColor,
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          textAlign: 'center',
          maxWidth: '80%',
          lineHeight: 1.4,
          ...getOutlineStyle(),
        }}
      >
        {renderText()}
      </div>
    </AbsoluteFill>
  );
};

// Progress Bar Component
const ProgressBar: React.FC<{
  frame: number;
  totalFrames: number;
  primaryColor: string;
}> = ({ frame, totalFrames, primaryColor }) => {
  const progress = (frame / totalFrames) * 100;
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 40,
        right: 40,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          backgroundColor: primaryColor,
          borderRadius: 2,
          boxShadow: `0 0 10px ${primaryColor}`,
        }}
      />
    </div>
  );
};

// Watermark Component
const Watermark: React.FC<{ text?: string }> = ({ text }) => {
  if (!text) return null;
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 30,
        right: 40,
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {text}
    </div>
  );
};

// Main Component
export const UniversalCreatorVideo: React.FC<UniversalCreatorVideoProps> = ({
  scenes = [],
  subtitles,
  voiceoverUrl,
  backgroundMusicUrl,
  backgroundMusicVolume = 0.2,
  masterVolume = 1.0,
  primaryColor = '#F5C76A',
  subtitleStyle,
  showProgressBar = false,
  showWatermark = false,
  watermarkText,
  fps: propsFps,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const effectiveFps = propsFps || fps;
  
  // Calculate scene timings
  const sceneTimings = useMemo(() => {
    let cumulativeFrames = 0;
    return scenes.map((scene, index) => {
      const sceneDurationFrames = Math.ceil(scene.duration * effectiveFps);
      const startFrame = cumulativeFrames;
      cumulativeFrames += sceneDurationFrames;
      return {
        ...scene,
        startFrame,
        endFrame: cumulativeFrames,
        durationInFrames: sceneDurationFrames,
      };
    });
  }, [scenes, effectiveFps]);
  
  // Fallback: single scene if no scenes provided
  if (scenes.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#0f172a' }}>
        {/* Audio layers */}
        {voiceoverUrl && (
          <Html5Audio src={voiceoverUrl} volume={masterVolume} pauseWhenBuffering />
        )}
        {backgroundMusicUrl && (
          <Html5Audio src={backgroundMusicUrl} volume={backgroundMusicVolume * masterVolume} pauseWhenBuffering />
        )}
        
        {/* Default background */}
        <AbsoluteFill style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            fontSize: 48,
            color: primaryColor,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 700,
          }}>
            Universal Video Creator
          </div>
        </AbsoluteFill>
        
        {/* Subtitles */}
        <SubtitleLayer
          subtitles={subtitles}
          subtitleStyle={subtitleStyle}
          frame={frame}
          fps={effectiveFps}
        />
      </AbsoluteFill>
    );
  }
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Audio layers - always present */}
      {voiceoverUrl && (
        <Html5Audio
          src={voiceoverUrl}
          volume={masterVolume}
          startFrom={0}
          pauseWhenBuffering
        />
      )}
      {backgroundMusicUrl && (
        <Html5Audio
          src={backgroundMusicUrl}
          volume={backgroundMusicVolume * masterVolume}
          startFrom={0}
          pauseWhenBuffering
        />
      )}
      
      {/* Render scenes as sequences */}
      {sceneTimings.map((scene, index) => (
        <Sequence
          key={scene.id || index}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
        >
          <SceneBackground
            scene={scene}
            frame={frame - scene.startFrame}
            durationInFrames={scene.durationInFrames}
            fps={effectiveFps}
          />
          <TextOverlay
            scene={scene}
            frame={frame - scene.startFrame}
            durationInFrames={scene.durationInFrames}
            primaryColor={primaryColor}
            fps={effectiveFps}
          />
        </Sequence>
      ))}
      
      {/* Global subtitle layer */}
      <SubtitleLayer
        subtitles={subtitles}
        subtitleStyle={subtitleStyle}
        frame={frame}
        fps={effectiveFps}
      />
      
      {/* Progress bar */}
      {showProgressBar && (
        <ProgressBar
          frame={frame}
          totalFrames={durationInFrames}
          primaryColor={primaryColor}
        />
      )}
      
      {/* Watermark */}
      {showWatermark && <Watermark text={watermarkText} />}
    </AbsoluteFill>
  );
};
