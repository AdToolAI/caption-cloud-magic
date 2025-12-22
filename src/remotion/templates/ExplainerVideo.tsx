import React, { useMemo } from 'react';
import { 
  AbsoluteFill, 
  Audio,
  Video,
  Img, 
  Sequence, 
  useCurrentFrame, 
  useVideoConfig,
  spring,
  getRemotionEnvironment,
  staticFile,
} from 'remotion';
import { safeInterpolate as interpolate, safeDuration } from '../utils/safeInterpolate';
import { z } from 'zod';

// 🎬 Loft-Film: Import Lottie components for professional animations
import { LottieIcons } from '../components/LottieIcons';
import { MorphTransition } from '../components/MorphTransition';

// 🎬 NEW: Import ProfessionalLottieCharacter for 95%+ Loft-Film quality
import { ProfessionalLottieCharacter, type PhonemeTimestamp as CharacterPhonemeTimestamp } from '../components/ProfessionalLottieCharacter';

// 🎬 NEW: Import RiveCharacter for lip-sync animations
import { RiveCharacter, type PhonemeTimestamp } from '../components/RiveCharacter';
import { getGestureForSceneType, detectEmotionFromText } from '@/utils/phonemeMapping';

// 🎬 LOFT-FILM: Import DrawOnEffect for hand-drawn annotations
import { DrawOnEffect } from '../components/DrawOnEffect';

// ✅ PHASE 2-4: Import 95%+ quality components
import { PrecisionSubtitleOverlay } from '../components/PrecisionSubtitleOverlay';
import { SceneAudioManager, type SceneAudioConfig } from '../components/SceneAudioManager';
import { getSoundUrlSync, type SoundEffectType } from '../components/EmbeddedSoundLibrary';

// ✅ Enhanced Fallback placeholder for missing images - prevents black scenes
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
  <circle cx="960" cy="480" r="120" fill="#F5C76A" opacity="0.15"/>
  <circle cx="960" cy="480" r="80" fill="#F5C76A" opacity="0.3"/>
  <circle cx="960" cy="480" r="50" fill="#F5C76A"/>
  <polygon points="940,450 990,480 940,510" fill="white"/>
</svg>
`);

// Schema definitions
const SubtitleSchema = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
});

const ExplainerSceneSchema = z.object({
  id: z.string().optional().default(''),
  type: z.enum(['hook', 'problem', 'solution', 'feature', 'proof', 'cta']).optional().default('hook'),
  title: z.string().optional().default(''),
  spokenText: z.string().optional().default(''),
  visualDescription: z.string().optional().default(''),
  durationSeconds: z.number().optional().default(5),
  startTime: z.number().optional().default(0),
  endTime: z.number().optional().default(5),
  emotionalTone: z.string().optional().default('neutral'),
  imageUrl: z.string().optional(),
  // 🎬 NEW: Hailuo 2.3 animated video URL
  animatedVideoUrl: z.string().optional(),
  useAnimation: z.boolean().optional().default(false),
  animation: z.enum(['fadeIn', 'slideUp', 'slideLeft', 'zoomIn', 'bounce', 'none', 'kenBurns', 'parallax', 'popIn', 'flyIn', 'morphIn']).optional().default('fadeIn'),
  textAnimation: z.enum(['typewriter', 'fadeWords', 'highlight', 'none', 'splitReveal', 'glowPulse', 'bounceIn', 'waveIn']).optional().default('fadeWords'),
  kenBurnsDirection: z.enum(['in', 'out', 'left', 'right', 'up', 'down']).optional().default('in'),
  parallaxLayers: z.number().optional().default(3),
  // ✅ PHASE 3 & 4: Professional transitions and sound effects
  transitionType: z.enum(['morph', 'wipe', 'zoom', 'dissolve', 'fade']).optional().default('fade'),
  soundEffectType: z.enum(['whoosh', 'pop', 'success', 'alert', 'none']).optional().default('none'),
  statsOverlay: z.array(z.string()).optional(),
  // ✅ PHASE 4: Beat-sync timing adjustment
  beatAligned: z.boolean().optional().default(false),
});

// Phoneme timestamp schema for lip-sync
const PhonemeTimestampSchema = z.object({
  character: z.string(),
  start_time: z.number(),
  end_time: z.number(),
});

export const ExplainerVideoSchema = z.object({
  scenes: z.array(ExplainerSceneSchema),
  voiceoverUrl: z.string().optional(),
  backgroundMusicUrl: z.string().optional(),
  backgroundMusicVolume: z.number().optional(),
  masterVolume: z.number().optional(),
  soundEffects: z.array(z.object({
    sceneId: z.string(),
    soundUrl: z.string(),
    volume: z.number(),
    startTime: z.number(),
  })).optional(),
  subtitles: z.array(SubtitleSchema).optional(),
  subtitleConfig: z.object({
    enabled: z.boolean().optional(),
    position: z.enum(['top', 'center', 'bottom']).optional(),
    fontSize: z.number().optional(),
    fontColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    animation: z.enum(['none', 'fadeIn', 'wordByWord', 'highlight']).optional(),
  }).optional(),
  style: z.enum(['flat-design', 'isometric', 'whiteboard', 'comic', 'corporate', 'modern-3d']).optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  showSceneTitles: z.boolean().optional(),
  showProgressBar: z.boolean().optional(),
  targetWidth: z.number().optional(),
  targetHeight: z.number().optional(),
  // 🎬 NEW: Lip-sync data from ElevenLabs timestamps API
  phonemeTimestamps: z.array(PhonemeTimestampSchema).optional(),
  // 🎬 NEW: Enable Rive character with lip-sync
  useRiveCharacter: z.boolean().optional(),
  // ✅ PHASE 2: Brand colors from 15-Phase Interview
  brandColors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
  }).optional(),
  // ✅ PHASE 2: Preferred font from consultation
  preferredFont: z.enum(['poppins', 'outfit', 'dm-sans', 'auto']).optional().default('poppins'),
  // ✅ PHASE 4: Beat-sync data for music-synchronized transitions
  beatSyncData: z.object({
    bpm: z.number(),
    transitionPoints: z.array(z.number()),
    downbeats: z.array(z.number()),
  }).optional(),
});

type ExplainerScene = z.infer<typeof ExplainerSceneSchema>;
type ExplainerVideoProps = z.infer<typeof ExplainerVideoSchema>;
type Subtitle = z.infer<typeof SubtitleSchema>;

// Ken Burns Effect Component
const KenBurnsImage: React.FC<{
  imageUrl: string;
  direction: string;
  frame: number;
  durationInFrames: number;
  fps: number;
}> = ({ imageUrl, direction, frame, durationInFrames, fps }) => {
  // ✅ Validate durationInFrames to prevent division by zero
  const safeDuration = Math.max(1, durationInFrames || 30);
  const progress = frame / safeDuration;
  
  // Entry fade
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  
  // Ken Burns effect based on direction
  let transform = '';
  const startScale = 1.0;
  const endScale = 1.2;
  const panDistance = 10; // percent
  
  switch (direction) {
    case 'in':
      const scaleIn = interpolate(progress, [0, 1], [startScale, endScale], { extrapolateRight: 'clamp' });
      transform = `scale(${scaleIn})`;
      break;
    case 'out':
      const scaleOut = interpolate(progress, [0, 1], [endScale, startScale], { extrapolateRight: 'clamp' });
      transform = `scale(${scaleOut})`;
      break;
    case 'left':
      const panLeft = interpolate(progress, [0, 1], [0, -panDistance], { extrapolateRight: 'clamp' });
      transform = `scale(1.15) translateX(${panLeft}%)`;
      break;
    case 'right':
      const panRight = interpolate(progress, [0, 1], [0, panDistance], { extrapolateRight: 'clamp' });
      transform = `scale(1.15) translateX(${panRight}%)`;
      break;
    case 'up':
      const panUp = interpolate(progress, [0, 1], [0, -panDistance], { extrapolateRight: 'clamp' });
      transform = `scale(1.15) translateY(${panUp}%)`;
      break;
    case 'down':
      const panDown = interpolate(progress, [0, 1], [0, panDistance], { extrapolateRight: 'clamp' });
      transform = `scale(1.15) translateY(${panDown}%)`;
      break;
    default:
      const defaultScale = interpolate(progress, [0, 1], [1, 1.1], { extrapolateRight: 'clamp' });
      transform = `scale(${defaultScale})`;
  }
  
  return (
    <div style={{ 
      position: 'absolute', 
      inset: 0, 
      overflow: 'hidden',
      opacity 
    }}>
      <Img
        src={imageUrl}
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

// Parallax Effect Component
const ParallaxBackground: React.FC<{
  imageUrl: string;
  layers: number;
  frame: number;
  durationInFrames: number;
}> = ({ imageUrl, layers, frame, durationInFrames }) => {
  // ✅ Validate durationInFrames to prevent division by zero
  const safeDuration = Math.max(1, durationInFrames || 30);
  const progress = frame / safeDuration;
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  
  return (
    <div style={{ 
      position: 'absolute', 
      inset: 0, 
      overflow: 'hidden',
      opacity 
    }}>
      {/* Base layer */}
      <Img
        src={imageUrl}
        style={{
          position: 'absolute',
          width: '110%',
          height: '110%',
          objectFit: 'cover',
          left: '-5%',
          top: '-5%',
          transform: `translateY(${interpolate(progress, [0, 1], [0, -10])}px)`,
        }}
      />
      {/* Overlay gradient for depth */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.3) 100%)',
          transform: `translateY(${interpolate(progress, [0, 1], [0, -5])}px)`,
        }}
      />
      {/* Subtle vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: 'inset 0 0 150px 50px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  );
};

// Animated Text with multiple animation types
const AnimatedText: React.FC<{
  text: string;
  animation: string;
  frame: number;
  durationInFrames: number;
  primaryColor: string;
  fps: number;
}> = ({ text, animation, frame, durationInFrames, primaryColor, fps }) => {
  const words = text.split(' ');
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(30, Number(durationInFrames) || 30);
  
  switch (animation) {
    case 'typewriter':
      const typewriterEnd = Math.max(1, safeDuration * 0.7);
      const charsToShow = Math.floor(interpolate(frame, [0, typewriterEnd], [0, text.length], { extrapolateRight: 'clamp' }));
      return (
        <span style={{ fontFamily: 'monospace' }}>
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
        <span style={{ position: 'relative', display: 'inline-block' }}>
          {words.map((word, i) => {
            const wordDelay = i * 4;
            const revealProgress = spring({
              frame: frame - wordDelay,
              fps,
              config: { damping: 15, stiffness: 100 },
            });
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  overflow: 'hidden',
                  marginRight: '0.25em',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    transform: `translateY(${(1 - revealProgress) * 100}%)`,
                  }}
                >
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
        <span
          style={{
            textShadow: `0 0 ${glowIntensity}px ${primaryColor}, 0 0 ${glowIntensity * 2}px ${primaryColor}`,
          }}
        >
          {text}
        </span>
      );
    
    case 'highlight':
      const highlightWidth = interpolate(frame, [10, 30], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return (
        <span style={{ position: 'relative' }}>
          {text}
          <span
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              height: 4,
              width: `${highlightWidth}%`,
              background: primaryColor,
              borderRadius: 2,
            }}
          />
        </span>
      );
    
    default:
      return <span>{text}</span>;
  }
};

// Subtitle Component with animations
const SubtitleOverlay: React.FC<{
  subtitles: Subtitle[];
  frame: number;
  fps: number;
  config: NonNullable<ExplainerVideoProps['subtitleConfig']>;
}> = ({ subtitles, frame, fps, config }) => {
  const currentTime = frame / fps;
  
  // Find active subtitle
  const activeSubtitle = subtitles.find(
    sub => currentTime >= sub.startTime && currentTime <= sub.endTime
  );
  
  if (!activeSubtitle || !config.enabled) return null;
  
  const subtitleProgress = (currentTime - activeSubtitle.startTime) / (activeSubtitle.endTime - activeSubtitle.startTime);
  const words = activeSubtitle.text.split(' ');
  
  const positionStyles: Record<string, React.CSSProperties> = {
    top: { top: 60, bottom: 'auto' },
    center: { top: '50%', transform: 'translateY(-50%)' },
    bottom: { bottom: 80, top: 'auto' },
  };
  
  const entryOpacity = interpolate(
    currentTime - activeSubtitle.startTime,
    [0, 0.2],
    [0, 1],
    { extrapolateRight: 'clamp' }
  );
  const exitOpacity = interpolate(
    activeSubtitle.endTime - currentTime,
    [0, 0.2],
    [0, 1],
    { extrapolateRight: 'clamp' }
  );
  
  const renderText = () => {
    switch (config.animation) {
      case 'wordByWord':
        const wordsToShow = Math.ceil(subtitleProgress * words.length);
        return (
          <span>
            {words.slice(0, wordsToShow).map((word, i) => (
              <span key={i} style={{ marginRight: '0.25em' }}>{word}</span>
            ))}
          </span>
        );
      
      case 'highlight':
        const highlightIndex = Math.floor(subtitleProgress * words.length);
        return (
          <span>
            {words.map((word, i) => (
              <span
                key={i}
                style={{
                  marginRight: '0.25em',
                  color: i === highlightIndex ? config.fontColor || '#FFD700' : 'white',
                  fontWeight: i === highlightIndex ? 700 : 400,
                  transition: 'all 0.1s',
                }}
              >
                {word}
              </span>
            ))}
          </span>
        );
      
      default:
        return <span>{activeSubtitle.text}</span>;
    }
  };
  
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        right: 60,
        display: 'flex',
        justifyContent: 'center',
        opacity: Math.min(entryOpacity, exitOpacity),
        ...positionStyles[config.position || 'bottom'],
      }}
    >
      <div
        style={{
          padding: '12px 24px',
          backgroundColor: config.backgroundColor || 'rgba(0,0,0,0.75)',
          borderRadius: 8,
          maxWidth: '80%',
        }}
      >
        <p
          style={{
            color: config.fontColor || '#FFFFFF',
            fontSize: config.fontSize || 32,
            fontWeight: 600,
            fontFamily: "'Outfit', 'DM Sans', sans-serif",
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {renderText()}
        </p>
      </div>
    </div>
  );
};

// 🎬 Loft-Film Pop-In Animation
const PopInElement: React.FC<{
  children: React.ReactNode;
  delay: number;
  frame: number;
  fps: number;
}> = ({ children, delay, frame, fps }) => {
  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 8, stiffness: 150 },
  });
  
  const opacity = interpolate(frame - delay, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  return (
    <div style={{ 
      transform: `scale(${Math.max(0, scale)})`, 
      opacity: Math.max(0, opacity),
      transformOrigin: 'center center',
    }}>
      {children}
    </div>
  );
};

// 🎬 Loft-Film Fly-In Animation
const FlyInElement: React.FC<{
  children: React.ReactNode;
  direction: 'left' | 'right' | 'top' | 'bottom';
  delay: number;
  frame: number;
  fps: number;
}> = ({ children, direction, delay, frame, fps }) => {
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 100 },
  });
  
  const directions = {
    left: { x: -200, y: 0 },
    right: { x: 200, y: 0 },
    top: { x: 0, y: -200 },
    bottom: { x: 0, y: 200 },
  };
  
  const { x, y } = directions[direction];
  const translateX = interpolate(progress, [0, 1], [x, 0]);
  const translateY = interpolate(progress, [0, 1], [y, 0]);
  
  return (
    <div style={{ 
      transform: `translate(${translateX}px, ${translateY}px)`,
      opacity: Math.max(0, progress),
    }}>
      {children}
    </div>
  );
};

// 🎬 NEW: Stagger Reveal Animation (Loft-Film Style)
const StaggerReveal: React.FC<{
  elements: React.ReactNode[];
  frame: number;
  fps: number;
  staggerDelay?: number;
}> = ({ elements, frame, fps, staggerDelay = 8 }) => {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {elements.map((element, i) => {
        const elementProgress = spring({
          frame: frame - (i * staggerDelay),
          fps,
          config: { damping: 12, stiffness: 100 },
        });
        
        return (
          <div
            key={i}
            style={{
              opacity: Math.max(0, elementProgress),
              transform: `translateY(${(1 - Math.max(0, elementProgress)) * 40}px) scale(${0.85 + 0.15 * Math.max(0, elementProgress)})`,
            }}
          >
            {element}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// 🎬 NEW: Morph Transition Effect Helper (returns style object)
const useMorphTransition = (
  frame: number,
  durationInFrames: number,
  transitionFrames: number = 15
): React.CSSProperties => {
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(60, Number(durationInFrames) || 60);
  const safeTransitionFrames = Math.min(transitionFrames, Math.floor(safeDuration * 0.3));
  const safeExitStart = Math.max(safeTransitionFrames + 1, safeDuration - safeTransitionFrames);
  
  // Entry morph (first frames)
  const entryProgress = interpolate(
    frame,
    [0, safeTransitionFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  // Exit morph (last frames) - using safe exit range
  const exitProgress = interpolate(
    frame,
    [safeExitStart, safeDuration],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  // ✅ Safe 4-element array for scale interpolation
  const scale = interpolate(
    frame,
    [0, safeTransitionFrames, safeExitStart, safeDuration],
    [1.1, 1, 1, 0.95],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const blur = frame < safeTransitionFrames 
    ? interpolate(frame, [0, safeTransitionFrames], [3, 0], { extrapolateRight: 'clamp' })
    : frame > safeExitStart
      ? interpolate(frame, [safeExitStart, safeDuration], [0, 3], { extrapolateLeft: 'clamp' })
      : 0;
  
  return {
    opacity: Math.min(entryProgress, exitProgress),
    transform: `scale(${scale})`,
    filter: blur > 0 ? `blur(${blur}px)` : 'none',
  };
};

// 🎬 NEW: Hand-Draw Reveal Animation
const HandDrawReveal: React.FC<{
  children: React.ReactNode;
  frame: number;
  durationInFrames: number;
}> = ({ children, frame, durationInFrames }) => {
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(30, Number(durationInFrames) || 30);
  const revealEnd = Math.max(1, safeDuration * 0.4);
  
  const revealProgress = interpolate(
    frame,
    [0, revealEnd],
    [0, 100],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  return (
    <div style={{ 
      position: 'relative',
      clipPath: `inset(0 ${100 - revealProgress}% 0 0)`,
    }}>
      {children}
      {/* Drawing cursor effect */}
      {revealProgress < 100 && revealProgress > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${revealProgress}%`,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#F5C76A',
            boxShadow: '0 0 20px #F5C76A',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </div>
  );
};

// 🎬 Spotlight/Focus Effect
const SpotlightEffect: React.FC<{
  frame: number;
  durationInFrames: number;
  primaryColor: string;
}> = ({ frame, durationInFrames, primaryColor }) => {
  // ✅ Validate durationInFrames to prevent "Invalid array length" error
  const safeDuration = Math.max(30, Number(durationInFrames) || 30);
  
  const pulseIntensity = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.3, 0.6]
  );
  
  const spotlightX = interpolate(frame, [0, safeDuration], [30, 70], {
    extrapolateRight: 'clamp',
  });
  
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse 60% 50% at ${spotlightX}% 50%, transparent 0%, rgba(0,0,0,${pulseIntensity}) 100%)`,
        pointerEvents: 'none',
      }}
    />
  );
};

// 🎬 Pulse Highlight Effect
const PulseHighlight: React.FC<{
  frame: number;
  primaryColor: string;
}> = ({ frame, primaryColor }) => {
  const pulse = interpolate(Math.sin(frame * 0.15), [-1, 1], [0, 1]);
  const scale = 1 + pulse * 0.05;
  
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        boxShadow: `inset 0 0 ${100 + pulse * 50}px ${20 + pulse * 30}px ${primaryColor}20`,
        transform: `scale(${scale})`,
        pointerEvents: 'none',
      }}
    />
  );
};

// 🎬 Floating Icon Effect
const FloatingIcons: React.FC<{
  sceneType: string;
  frame: number;
  primaryColor: string;
}> = ({ sceneType, frame, primaryColor }) => {
  const icons: Record<string, string[]> = {
    hook: ['✨', '💡', '🎯'],
    problem: ['⚠️', '❌', '😰'],
    solution: ['✅', '🎉', '💪'],
    feature: ['⭐', '🔧', '📊'],
    cta: ['🚀', '👉', '🔥'],
    proof: ['📈', '🏆', '💯'],
  };
  
  const sceneIcons = icons[sceneType] || icons.hook;
  
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {sceneIcons.map((icon, i) => {
        const baseX = 10 + i * 35;
        const floatY = Math.sin((frame + i * 20) * 0.05) * 20;
        const opacity = interpolate(frame, [0, 20, 100], [0, 0.7, 0.7], { extrapolateRight: 'clamp' });
        
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${baseX}%`,
              top: 60 + floatY,
              fontSize: 32,
              opacity,
              transform: `rotate(${Math.sin((frame + i * 30) * 0.03) * 15}deg)`,
              filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
            }}
          >
            {icon}
          </div>
        );
      })}
    </div>
  );
};

// 🎬 NEW: Animated SVG Character (Loft-Film Style - breathing, gestures, movement)
const AnimatedCharacter: React.FC<{
  type: 'presenter' | 'user' | 'expert';
  action: 'pointing' | 'thinking' | 'celebrating' | 'explaining' | 'idle';
  frame: number;
  fps: number;
  position: 'left' | 'right' | 'center';
  primaryColor: string;
  visible?: boolean;
}> = ({ type, action, frame, fps, position, primaryColor, visible = true }) => {
  if (!visible) return null;
  
  // Entry animation
  const entryProgress = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80 },
  });
  
  // Breathing animation (subtle up-down)
  const breathe = Math.sin(frame * 0.08) * 3;
  
  // Head tilt (subtle rotation)
  const headTilt = Math.sin(frame * 0.05) * 3;
  
  // Blink animation (every ~3 seconds)
  const blinkCycle = frame % 90;
  const isBlinking = blinkCycle < 3;
  
  // Arm wave for pointing action
  const armWave = action === 'pointing' 
    ? Math.sin(frame * 0.12) * 10 
    : action === 'explaining' 
      ? Math.sin(frame * 0.15) * 15 
      : 0;
  
  // Celebrating bounce
  const celebrateBounce = action === 'celebrating' ? Math.abs(Math.sin(frame * 0.2)) * 15 : 0;
  
  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: '5%', right: 'auto' },
    right: { right: '5%', left: 'auto' },
    center: { left: '50%', transform: 'translateX(-50%)' },
  };
  
  // Character colors based on type
  const characterColors = {
    presenter: { skin: '#FFDAB9', shirt: primaryColor, pants: '#1E3A5F' },
    user: { skin: '#D4A574', shirt: '#3B82F6', pants: '#374151' },
    expert: { skin: '#F5DEB3', shirt: '#059669', pants: '#1F2937' },
  };
  
  const colors = characterColors[type];
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '8%',
        ...positionStyles[position],
        transform: `
          translateY(${breathe - celebrateBounce}px) 
          scale(${0.3 + 0.7 * Math.max(0, entryProgress)})
        `,
        opacity: Math.max(0, entryProgress),
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      <svg 
        width="200" 
        height="350" 
        viewBox="0 0 200 350" 
        style={{ filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.3))' }}
      >
        {/* Head with tilt */}
        <g transform={`rotate(${headTilt}, 100, 60)`}>
          {/* Head shape */}
          <ellipse cx="100" cy="55" rx="40" ry="45" fill={colors.skin} />
          
          {/* Hair (simple) */}
          <path 
            d="M 60 45 Q 70 20 100 15 Q 130 20 140 45" 
            fill="#2D1B0E" 
            stroke="none"
          />
          
          {/* Eyes */}
          <g transform={isBlinking ? 'scaleY(0.1)' : ''} style={{ transformOrigin: '100px 50px' }}>
            <ellipse cx="82" cy="50" rx="6" ry={isBlinking ? 1 : 4} fill="#2D1B0E" />
            <ellipse cx="118" cy="50" rx="6" ry={isBlinking ? 1 : 4} fill="#2D1B0E" />
            {/* Eye highlights */}
            {!isBlinking && (
              <>
                <circle cx="84" cy="48" r="2" fill="white" opacity="0.7" />
                <circle cx="120" cy="48" r="2" fill="white" opacity="0.7" />
              </>
            )}
          </g>
          
          {/* Eyebrows */}
          <path d="M 72 40 Q 82 37 92 40" stroke="#2D1B0E" strokeWidth="2" fill="none" />
          <path d="M 108 40 Q 118 37 128 40" stroke="#2D1B0E" strokeWidth="2" fill="none" />
          
          {/* Mouth - changes based on action */}
          {action === 'celebrating' ? (
            <path d="M 85 72 Q 100 85 115 72" fill="none" stroke="#C0392B" strokeWidth="3" />
          ) : action === 'thinking' ? (
            <ellipse cx="100" cy="75" rx="8" ry="5" fill="#C0392B" />
          ) : (
            <path d="M 88 72 Q 100 78 112 72" fill="none" stroke="#C0392B" strokeWidth="2" />
          )}
        </g>
        
        {/* Neck */}
        <rect x="90" y="95" width="20" height="20" fill={colors.skin} />
        
        {/* Body / Shirt */}
        <path 
          d="M 60 115 L 65 110 L 135 110 L 140 115 L 145 200 L 55 200 Z" 
          fill={colors.shirt} 
        />
        
        {/* Shirt collar */}
        <path d="M 85 110 L 100 130 L 115 110" fill="white" stroke="none" />
        
        {/* Left arm (static) */}
        <g>
          <path 
            d="M 60 120 Q 40 150 45 190" 
            stroke={colors.shirt} 
            strokeWidth="20" 
            fill="none" 
            strokeLinecap="round"
          />
          {/* Hand */}
          <circle cx="45" cy="195" r="12" fill={colors.skin} />
        </g>
        
        {/* Right arm (animated for pointing/explaining) */}
        <g transform={`rotate(${-30 + armWave}, 140, 120)`}>
          <path 
            d="M 140 120 Q 170 100 180 70" 
            stroke={colors.shirt} 
            strokeWidth="20" 
            fill="none" 
            strokeLinecap="round"
          />
          {/* Hand */}
          <circle cx="182" cy="65" r="12" fill={colors.skin} />
          {/* Pointing finger for pointing action */}
          {action === 'pointing' && (
            <path 
              d="M 190 60 L 210 45" 
              stroke={colors.skin} 
              strokeWidth="6" 
              strokeLinecap="round"
            />
          )}
        </g>
        
        {/* Legs */}
        <rect x="70" y="200" width="25" height="80" rx="5" fill={colors.pants} />
        <rect x="105" y="200" width="25" height="80" rx="5" fill={colors.pants} />
        
        {/* Shoes */}
        <ellipse cx="82" cy="285" rx="18" ry="8" fill="#1a1a1a" />
        <ellipse cx="118" cy="285" rx="18" ry="8" fill="#1a1a1a" />
      </svg>
    </div>
  );
};

// 🎬 NEW: Staggered Icon Entry Animation (Loft-Film Style)
const StaggeredIconsDisplay: React.FC<{
  icons: string[];
  frame: number;
  fps: number;
  position: 'left' | 'right' | 'top';
}> = ({ icons, frame, fps, position }) => {
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: 60, top: '20%', flexDirection: 'column' as const },
    right: { right: 60, top: '20%', flexDirection: 'column' as const },
    top: { top: 80, left: '50%', transform: 'translateX(-50%)', flexDirection: 'row' as const },
  };
  
  return (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        gap: 20,
        ...positionStyles[position],
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {icons.map((icon, i) => {
        const delay = i * 12;
        const iconProgress = spring({
          frame: frame - delay,
          fps,
          config: { damping: 10, stiffness: 120 },
        });
        
        const float = Math.sin((frame + i * 25) * 0.06) * 8;
        const rotate = Math.sin((frame + i * 15) * 0.04) * 10;
        
        return (
          <div
            key={i}
            style={{
              fontSize: 48,
              opacity: Math.max(0, iconProgress),
              transform: `
                translateY(${(1 - Math.max(0, iconProgress)) * 60 + float}px) 
                scale(${0.4 + 0.6 * Math.max(0, iconProgress)})
                rotate(${rotate}deg)
              `,
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
            }}
          >
            {icon}
          </div>
        );
      })}
    </div>
  );
};

// 🎬 NEW: Text Highlight Reveal (Loft-Film Style underline animation)
const HighlightTextReveal: React.FC<{
  text: string;
  frame: number;
  durationFrames: number;
  primaryColor: string;
  fps: number;
}> = ({ text, frame, durationFrames, primaryColor, fps }) => {
  const words = text.split(' ');
  
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {words.map((word, i) => {
        const wordDelay = i * 6;
        const wordProgress = spring({
          frame: frame - wordDelay,
          fps,
          config: { damping: 12, stiffness: 100 },
        });
        
        // Underline animation (appears after word)
        const underlineWidth = interpolate(
          frame - wordDelay - 8,
          [0, 12],
          [0, 100],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        
        // Only underline last word and key words
        const shouldUnderline = i === words.length - 1 || word.length > 6;
        
        return (
          <span
            key={i}
            style={{
              position: 'relative',
              display: 'inline-block',
              opacity: Math.max(0, wordProgress),
              transform: `translateY(${(1 - Math.max(0, wordProgress)) * 25}px)`,
            }}
          >
            {word}
            {shouldUnderline && (
              <span
                style={{
                  position: 'absolute',
                  bottom: -4,
                  left: 0,
                  height: 4,
                  width: `${underlineWidth}%`,
                  background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}88)`,
                  borderRadius: 2,
                }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
};

// 🎬 Scene-Type Specific Effects
const SceneTypeEffects: React.FC<{
  sceneType: string;
  frame: number;
  durationInFrames: number;
  primaryColor: string;
}> = ({ sceneType, frame, durationInFrames, primaryColor }) => {
  switch (sceneType) {
    case 'hook':
      // Dramatic zoom effect
      const hookZoom = interpolate(frame, [0, 30], [1.1, 1], { extrapolateRight: 'clamp' });
      return (
        <>
          <SpotlightEffect frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />
          <div style={{ 
            position: 'absolute', 
            inset: 0, 
            transform: `scale(${hookZoom})`,
            pointerEvents: 'none',
          }} />
        </>
      );
    
    case 'problem':
      // Shake effect + red vignette
      const shakeX = Math.sin(frame * 0.5) * (frame < 30 ? 3 : 0);
      const shakeY = Math.cos(frame * 0.7) * (frame < 30 ? 2 : 0);
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate(${shakeX}px, ${shakeY}px)`,
            boxShadow: 'inset 0 0 150px 50px rgba(239,68,68,0.15)',
            pointerEvents: 'none',
          }}
        />
      );
    
    case 'solution':
      // Green glow + particles rising
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            boxShadow: 'inset 0 0 150px 50px rgba(16,185,129,0.15)',
            pointerEvents: 'none',
          }}
        >
          {/* Rising particles */}
          {[...Array(5)].map((_, i) => {
            // ✅ Safe duration validation to prevent "Invalid array length" error
            const safeDuration = Math.max(60, durationInFrames);
            const safeIn = Math.min(20, safeDuration * 0.25);
            const safeOut = Math.max(safeIn + 2, safeDuration - 20);
            const particleY = interpolate(frame, [0, safeDuration], [100, -20], { extrapolateRight: 'clamp' });
            const particleX = 20 + i * 15;
            const particleOpacity = interpolate(frame, [0, safeIn, safeOut, safeDuration], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${particleX}%`,
                  bottom: `${particleY}%`,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#10B981',
                  opacity: particleOpacity * 0.6,
                  filter: 'blur(2px)',
                }}
              />
            );
          })}
        </div>
      );
    
    case 'cta':
      // Urgent pulsing effect
      return <PulseHighlight frame={frame} primaryColor={primaryColor} />;
    
    default:
      return null;
  }
};

// Animated background layer for each scene
const SceneBackground: React.FC<{
  imageUrl?: string;
  animatedVideoUrl?: string;  // 🎬 NEW: Hailuo 2.3 animated video
  useAnimation?: boolean;     // 🎬 NEW: Enable video animation
  animation: string;
  kenBurnsDirection: string;
  parallaxLayers: number;
  frame: number;
  durationInFrames: number;
  style: string;
  fps: number;
  sceneType?: string;
  primaryColor?: string;
}> = ({ imageUrl, animatedVideoUrl, useAnimation, animation, kenBurnsDirection, parallaxLayers, frame, durationInFrames, style, fps, sceneType = 'hook', primaryColor = '#F5C76A' }) => {
  
  // 🎬 NEW: If animated video exists, render Video component instead of static image
  if (animatedVideoUrl && useAnimation) {
    const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
    
    return (
      <AbsoluteFill style={{ opacity }}>
        <Video
          src={animatedVideoUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        <SceneTypeEffects sceneType={sceneType} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />
        <FloatingIcons sceneType={sceneType} frame={frame} primaryColor={primaryColor} />
      </AbsoluteFill>
    );
  }
  
  // ✅ Use fallback image if imageUrl is missing or empty - prevents black scenes
  const safeImageUrl = imageUrl && imageUrl.length > 10 ? imageUrl : FALLBACK_IMAGE;
  
  // Entry animation (first 15 frames)
  const entryProgress = Math.min(frame / 15, 1);
  
  let transform = 'scale(1)';
  let opacity = 1;
  
  // Handle special animations
  if (animation === 'kenBurns') {
    return (
      <>
        <KenBurnsImage
          imageUrl={safeImageUrl}
          direction={kenBurnsDirection}
          frame={frame}
          durationInFrames={durationInFrames}
          fps={fps}
        />
        <SceneTypeEffects sceneType={sceneType} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />
        <FloatingIcons sceneType={sceneType} frame={frame} primaryColor={primaryColor} />
      </>
    );
  }
  
  if (animation === 'parallax') {
    return (
      <>
        <ParallaxBackground
          imageUrl={safeImageUrl}
          layers={parallaxLayers}
          frame={frame}
          durationInFrames={durationInFrames}
        />
        <SceneTypeEffects sceneType={sceneType} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />
        <FloatingIcons sceneType={sceneType} frame={frame} primaryColor={primaryColor} />
      </>
    );
  }
  
  // 🎬 NEW: Pop-In Animation
  if (animation === 'popIn') {
    return (
      <PopInElement delay={0} frame={frame} fps={fps}>
        <AbsoluteFill>
          <Img
            src={safeImageUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <SceneTypeEffects sceneType={sceneType} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />
          <FloatingIcons sceneType={sceneType} frame={frame} primaryColor={primaryColor} />
        </AbsoluteFill>
      </PopInElement>
    );
  }
  
  // 🎬 NEW: Fly-In Animation
  if (animation === 'flyIn') {
    return (
      <FlyInElement direction="right" delay={0} frame={frame} fps={fps}>
        <AbsoluteFill>
          <Img
            src={safeImageUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <SceneTypeEffects sceneType={sceneType} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />
          <FloatingIcons sceneType={sceneType} frame={frame} primaryColor={primaryColor} />
        </AbsoluteFill>
      </FlyInElement>
    );
  }
  
  // Standard animations
  // ✅ Validate durationInFrames to prevent division by zero
  const safeDuration = Math.max(1, durationInFrames || 30);
  const progress = frame / safeDuration;
  
  switch (animation) {
    case 'fadeIn':
      opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
      break;
    case 'zoomIn':
      const scale = interpolate(progress, [0, 1], [1, 1.15], { extrapolateRight: 'clamp' });
      opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
      transform = `scale(${scale})`;
      break;
    case 'slideUp':
      const slideY = interpolate(frame, [0, 20], [50, 0], { extrapolateRight: 'clamp' });
      opacity = entryProgress;
      transform = `translateY(${slideY}px)`;
      break;
    case 'slideLeft':
      const slideX = interpolate(frame, [0, 20], [100, 0], { extrapolateRight: 'clamp' });
      opacity = entryProgress;
      transform = `translateX(${slideX}px)`;
      break;
    case 'bounce':
      const bounceScale = spring({
        frame,
        fps,
        config: { damping: 10, stiffness: 100 },
      });
      transform = `scale(${0.8 + 0.2 * bounceScale})`;
      opacity = bounceScale;
      break;
    default:
      opacity = 1;
  }
  
  // Style-specific overlay gradients
  const styleOverlays: Record<string, string> = {
    'flat-design': 'linear-gradient(135deg, rgba(79,70,229,0.1) 0%, rgba(16,185,129,0.1) 100%)',
    'isometric': 'linear-gradient(180deg, rgba(59,130,246,0.1) 0%, rgba(139,92,246,0.1) 100%)',
    'whiteboard': 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(243,244,246,0.9) 100%)',
    'comic': 'linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(251,191,36,0.05) 100%)',
    'corporate': 'linear-gradient(180deg, rgba(30,58,95,0.2) 0%, rgba(100,116,139,0.1) 100%)',
    'modern-3d': 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(236,72,153,0.1) 100%)',
  };
  
  return (
    <AbsoluteFill style={{ opacity }}>
      <Img
        src={safeImageUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform,
        }}
      />
      {/* Style overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: styleOverlays[style] || 'transparent',
          pointerEvents: 'none',
        }}
      />
      {/* Scene type effects */}
      <SceneTypeEffects sceneType={sceneType} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />
      <FloatingIcons sceneType={sceneType} frame={frame} primaryColor={primaryColor} />
    </AbsoluteFill>
  );
};

// Animated text overlay with enhanced animations
const SceneText: React.FC<{
  title: string;
  showTitle: boolean;
  sceneType: string;
  textAnimation: string;
  frame: number;
  durationInFrames: number;
  primaryColor: string;
  fps: number;
}> = ({ title, showTitle, sceneType, textAnimation, frame, durationInFrames, primaryColor, fps }) => {
  if (!showTitle) return null;
  
  // ✅ Safe duration validation to prevent "Invalid array length" error
  const safeDuration = Math.max(60, durationInFrames);
  const safeIn = Math.min(15, safeDuration * 0.25);
  const safeOut = Math.max(safeIn + 2, safeDuration - 15);
  
  const opacity = interpolate(
    frame,
    [0, safeIn, safeOut, safeDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const slideY = interpolate(
    frame,
    [0, 20],
    [30, 0],
    { extrapolateRight: 'clamp' }
  );
  
  const typeLabels: Record<string, string> = {
    hook: 'HOOK',
    problem: 'PROBLEM',
    solution: 'LÖSUNG',
    feature: 'FEATURE',
    proof: 'BEWEIS',
    cta: 'CALL TO ACTION',
  };
  
  const typeColors: Record<string, string> = {
    hook: '#F59E0B',
    problem: '#EF4444',
    solution: '#10B981',
    feature: '#3B82F6',
    proof: '#8B5CF6',
    cta: primaryColor,
  };
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: 60,
        right: 60,
        opacity,
        transform: `translateY(${slideY}px)`,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          padding: '8px 16px',
          backgroundColor: typeColors[sceneType] || primaryColor,
          borderRadius: 6,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            color: '#FFFFFF',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 2,
            fontFamily: "'Poppins', 'DM Sans', sans-serif",
          }}
        >
          {typeLabels[sceneType] || sceneType.toUpperCase()}
        </span>
      </div>
      <h2
        style={{
          color: '#FFFFFF',
          fontSize: 42,
          fontWeight: 700,
          fontFamily: "'Poppins', 'DM Sans', sans-serif",
          textShadow: '0 4px 20px rgba(0,0,0,0.5)',
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        <AnimatedText
          text={title}
          animation={textAnimation}
          frame={frame}
          durationInFrames={durationInFrames}
          primaryColor={primaryColor}
          fps={fps}
        />
      </h2>
    </div>
  );
};

// ✅ PHASE 5: Progress bar component with brand colors support
const ProgressBar: React.FC<{
  progress: number;
  primaryColor: string;
  secondaryColor?: string;
}> = ({ progress, primaryColor, secondaryColor }) => {
  // Use secondaryColor for background if provided, otherwise use white with opacity
  const bgColor = secondaryColor ? `${secondaryColor}40` : 'rgba(255,255,255,0.2)';
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 6,
        backgroundColor: bgColor,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress * 100}%`,
          background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}CC)`,
          boxShadow: `0 0 12px ${primaryColor}60`,
          transition: 'width 0.1s linear',
        }}
      />
    </div>
  );
};

// Scene transition wrapper with professional transitions
// ✅ PHASE 4: Enhanced with beat-sync support
const SceneTransition: React.FC<{
  children: React.ReactNode;
  frame: number;
  durationInFrames: number;
  transitionType?: 'morph' | 'wipe' | 'zoom' | 'dissolve' | 'fade';
  fps: number;
  beatAligned?: boolean;
  bpm?: number;
}> = ({ children, frame, durationInFrames, transitionType = 'fade', fps, beatAligned = false, bpm }) => {
  // ✅ PHASE 4: Calculate transition frames based on BPM if beat-aligned
  const baseTransitionFrames = 15;
  const transitionFrames = beatAligned && bpm 
    ? Math.min(Math.round((60 / bpm) * fps * 0.5), 20) // Half a beat for transition
    : baseTransitionFrames;
  
  // ✅ PHASE 4: Add beat pulse effect for beat-aligned transitions
  const beatPulse = beatAligned && bpm
    ? 1 + Math.sin(frame * (bpm / 60) * Math.PI * 2 / fps) * 0.02 // Subtle 2% pulse on beat
    : 1;
  
  // Entry animation based on transition type
  let entryStyle: React.CSSProperties = {};
  let exitStyle: React.CSSProperties = {};
  
  // ✅ Safe duration and exit start calculation to prevent "Invalid array length" error
  const safeDuration = Math.max(transitionFrames * 2 + 4, durationInFrames);
  const safeExitStart = Math.max(transitionFrames + 1, safeDuration - transitionFrames);

  switch (transitionType) {
    case 'wipe':
      // Horizontal wipe effect
      const wipeProgress = interpolate(frame, [0, transitionFrames], [0, 100], { extrapolateRight: 'clamp' });
      const wipeExit = interpolate(frame, [safeExitStart, safeDuration], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      entryStyle = { clipPath: `inset(0 ${100 - wipeProgress}% 0 0)` };
      exitStyle = { clipPath: `inset(0 0 0 ${100 - wipeExit}%)` };
      break;
      
    case 'zoom':
      // Zoom in/out effect - ✅ PHASE 4: Enhanced with beat pulse
      const zoomScale = interpolate(frame, [0, transitionFrames], [1.3, 1], { extrapolateRight: 'clamp' }) * beatPulse;
      const zoomOpacity = interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateRight: 'clamp' });
      const zoomExitScale = interpolate(frame, [safeExitStart, safeDuration], [1, 0.8], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const zoomExitOpacity = interpolate(frame, [safeExitStart, safeDuration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      entryStyle = { transform: `scale(${zoomScale})`, opacity: zoomOpacity };
      exitStyle = { transform: `scale(${zoomExitScale})`, opacity: zoomExitOpacity };
      break;
      
    case 'dissolve':
      // Elegant dissolve with blur
      const dissolveOpacity = interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateRight: 'clamp' });
      const dissolveBlur = interpolate(frame, [0, transitionFrames], [5, 0], { extrapolateRight: 'clamp' });
      const dissolveExitOpacity = interpolate(frame, [safeExitStart, safeDuration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const dissolveExitBlur = interpolate(frame, [safeExitStart, safeDuration], [0, 5], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      entryStyle = { opacity: dissolveOpacity, filter: `blur(${dissolveBlur}px)` };
      exitStyle = { opacity: dissolveExitOpacity, filter: `blur(${dissolveExitBlur}px)` };
      break;
      
    case 'morph':
      // Morph with scale and opacity - ✅ PHASE 4: Enhanced with beat pulse
      const morphScale = spring({ frame, fps, config: { damping: 15, stiffness: 100 } }) * beatPulse;
      const morphExitOpacity = interpolate(frame, [safeExitStart, safeDuration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      entryStyle = { transform: `scale(${0.9 + 0.1 * morphScale})`, opacity: Math.min(1, morphScale) };
      exitStyle = { opacity: morphExitOpacity };
      break;
      
    case 'fade':
    default:
      // Standard fade - ✅ PHASE 4: Enhanced with beat pulse scale
      const fadeEntry = interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateRight: 'clamp' });
      const fadeExit = interpolate(frame, [safeExitStart, safeDuration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      entryStyle = { opacity: fadeEntry, transform: `scale(${beatPulse})` };
      exitStyle = { opacity: fadeExit };
      break;
  }
  
  // Combine entry and exit styles
  const combinedStyle: React.CSSProperties = frame < transitionFrames ? entryStyle : 
                                              frame > durationInFrames - transitionFrames ? exitStyle : 
                                              { transform: `scale(${beatPulse})` }; // ✅ PHASE 4: Apply beat pulse during scene
  
  return (
    <AbsoluteFill style={combinedStyle}>
      {children}
    </AbsoluteFill>
  );
};

// ✅ PHASE 5: Animated Stats Overlay Component
const StatsOverlay: React.FC<{
  stats: string[];
  frame: number;
  durationInFrames: number;
  primaryColor: string;
  fps: number;
}> = ({ stats, frame, durationInFrames, primaryColor, fps }) => {
  if (!stats || stats.length === 0) return null;
  
  return (
    <div
      style={{
        position: 'absolute',
        top: '15%',
        right: '8%',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        pointerEvents: 'none',
      }}
    >
      {stats.map((stat, i) => {
        const delay = i * 15;
        const progress = spring({
          frame: frame - delay - 20,
          fps,
          config: { damping: 12, stiffness: 100 },
        });
        
        const scale = 0.5 + 0.5 * Math.max(0, progress);
        const opacity = Math.max(0, progress);
        const translateY = (1 - Math.max(0, progress)) * 40;
        
        // Pulse effect for numbers
        const pulse = interpolate(Math.sin((frame - delay) * 0.1), [-1, 1], [1, 1.05]);
        
        return (
          <div
            key={i}
            style={{
              transform: `translateY(${translateY}px) scale(${scale * pulse})`,
              opacity,
              background: `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}40)`,
              backdropFilter: 'blur(10px)',
              borderRadius: 16,
              padding: '16px 24px',
              border: `2px solid ${primaryColor}60`,
              boxShadow: `0 8px 32px ${primaryColor}30`,
            }}
          >
            <span
              style={{
                fontSize: 36,
                fontWeight: 800,
                fontFamily: "'Poppins', sans-serif",
                color: '#FFFFFF',
                textShadow: `0 0 20px ${primaryColor}`,
              }}
            >
              {stat}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ✅ PHASE 3: Sound Effect URLs with Robust Fallbacks
const SOUND_EFFECTS: Record<string, string[]> = {
  whoosh: [
    'https://cdn.pixabay.com/audio/2022/03/24/audio_d4a3e4b5f0.mp3',
    'https://cdn.pixabay.com/audio/2022/10/29/audio_fbebf89f18.mp3',
  ],
  pop: [
    'https://cdn.pixabay.com/audio/2022/03/15/audio_115b9c4f8a.mp3',
    'https://cdn.pixabay.com/audio/2021/08/04/audio_12b0c7443c.mp3',
  ],
  success: [
    'https://cdn.pixabay.com/audio/2021/08/04/audio_0625c1539c.mp3',
    'https://cdn.pixabay.com/audio/2022/03/15/audio_9c7e3d2fab.mp3',
  ],
  alert: [
    'https://cdn.pixabay.com/audio/2022/03/10/audio_bf8e5a2a1a.mp3',
    'https://cdn.pixabay.com/audio/2021/08/04/audio_c6cca54be7.mp3',
  ],
};

// Helper to get first available sound URL
const getSoundUrl = (effectType: string): string | null => {
  const urls = SOUND_EFFECTS[effectType];
  return urls && urls.length > 0 ? urls[0] : null;
};

// ✅ PHASE 2: Font Map for preferred fonts
const FONT_MAP: Record<string, string> = {
  'poppins': "'Poppins', 'DM Sans', sans-serif",
  'outfit': "'Outfit', 'DM Sans', sans-serif",
  'dm-sans': "'DM Sans', sans-serif",
  'auto': "'Poppins', 'DM Sans', sans-serif",
};

// Main Explainer Video component
export const ExplainerVideo: React.FC<ExplainerVideoProps> = ({
  scenes = [],
  voiceoverUrl,
  backgroundMusicUrl,
  backgroundMusicVolume = 0.15,
  masterVolume = 1.0,
  soundEffects = [],
  subtitles = [],
  subtitleConfig = { enabled: false, position: 'bottom', fontSize: 32 },
  style = 'flat-design',
  primaryColor = '#F5C76A',
  secondaryColor = '#8B5CF6',
  showSceneTitles = true,
  showProgressBar = true,
  // 🎬 NEW: Lip-sync data from ElevenLabs
  phonemeTimestamps,
  useRiveCharacter = false,
  // ✅ PHASE 2: Use brand colors if provided
  brandColors,
  // ✅ PHASE 2: Use preferred font from consultation
  preferredFont = 'poppins',
  // ✅ PHASE 4: Beat-sync data for music-synchronized transitions
  beatSyncData,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  
  // ✅ PHASE 2: Get font family based on preference
  const fontFamily = FONT_MAP[preferredFont || 'poppins'] || FONT_MAP.poppins;
  
  // Use brand colors if provided, otherwise fallback to primaryColor
  const effectivePrimaryColor = brandColors?.primary || primaryColor;
  const effectiveSecondaryColor = brandColors?.secondary || secondaryColor;
  const effectiveAccentColor = brandColors?.accent || primaryColor;
  
  // Calculate total progress
  // ✅ Validate durationInFrames to prevent division by zero
  const safeTotalDuration = Math.max(1, durationInFrames || 30);
  const totalProgress = frame / safeTotalDuration;
  
  // ✅ PHASE 3: Collect sound effects from scenes with INTELLIGENT TIMING
  const sceneSoundEffects = scenes.flatMap((scene, index) => {
    if (scene.soundEffectType && scene.soundEffectType !== 'none') {
      const soundUrl = getSoundUrl(scene.soundEffectType);
      if (soundUrl) {
        let startTime = 0;
        for (let i = 0; i < index; i++) {
          startTime += scenes[i].durationSeconds;
        }
        
        // ✅ PHASE 3: Calculate intelligent sound timing based on scene type and effect
        let soundEffectDelay = 0.5; // Default
        
        // Scene-type-based timing
        if (scene.type === 'hook') {
          soundEffectDelay = 0.2; // Quick impact for hooks
        } else if (scene.type === 'problem') {
          soundEffectDelay = 0.8; // Delayed warning for problems
        } else if (scene.type === 'solution') {
          soundEffectDelay = 1.0; // Reveal timing for solutions
        } else if (scene.type === 'proof' && scene.statsOverlay?.length) {
          soundEffectDelay = 1.2; // Sync with stats reveal
        } else if (scene.type === 'cta') {
          soundEffectDelay = 0.3; // Quick call-to-action
        }
        
        // Effect-type-based timing adjustments
        if (scene.soundEffectType === 'whoosh') {
          soundEffectDelay = 0.1; // Whoosh at transition start
        } else if (scene.soundEffectType === 'pop') {
          soundEffectDelay = Math.max(soundEffectDelay, 0.5); // Pop when icons appear
        } else if (scene.soundEffectType === 'success') {
          soundEffectDelay = Math.max(soundEffectDelay, 1.0); // Success for reveals
        }
        
        return [{
          sceneId: scene.id || `scene-${index}`,
          soundUrl,
          volume: scene.type === 'cta' ? 0.4 : 0.3, // Louder for CTA
          startTime: startTime + soundEffectDelay,
        }];
      }
    }
    return [];
  });
  
  // Combine provided sound effects with scene-based ones
  const allSoundEffects = [...soundEffects, ...sceneSoundEffects];
  
  // Render each scene as a Sequence
  let currentFrame = 0;
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Scene Sequences */}
      {scenes.map((scene, index) => {
        // ✅ Validate sceneDurationFrames to prevent "Invalid array length" - minimum 30 frames (1 second)
        const sceneDurationFrames = Math.max(30, Math.ceil((scene.durationSeconds || 5) * fps));
        const sceneStartFrame = currentFrame;
        currentFrame += sceneDurationFrames;
        
        // 🎬 Loft-Film: Determine character action based on scene type
        // ✅ KONTEXTBEZOGEN: Charakter NUR bei Problem, Solution, CTA
        const characterActions: Record<string, 'pointing' | 'thinking' | 'celebrating' | 'explaining' | 'idle'> = {
          problem: 'thinking',      // Charakter denkt nach (Problem visualisieren)
          solution: 'celebrating',   // Charakter feiert (Lösung gefunden)
          cta: 'pointing',          // Charakter zeigt auf CTA
        };
        
        // 🎬 Loft-Film: Scene-specific icons - ✅ NUR passende Icons pro Szene
        const sceneIcons: Record<string, string[]> = {
          hook: [],                  // ❌ Keine Icons bei Hook (soll Aufmerksamkeit auf Bild lenken)
          problem: ['❌', '⚠️'],     // ✅ Nur Warn-Icons bei Problem
          solution: ['✅', '🎉'],    // ✅ Nur Erfolgs-Icons bei Lösung
          feature: ['⭐', '📊', '🔧'], // ✅ Feature-Icons
          proof: ['📈', '💯'],       // ✅ Beweis-Icons
          cta: [],                   // ❌ Keine Icons bei CTA (soll auf Button fokussieren)
        };
        
        const action = characterActions[scene.type] || 'idle';
        const icons = sceneIcons[scene.type] || [];
        
        // ✅ KONTEXTBEZOGEN: Charakter NICHT bei Hook/Feature (nur Problem/Solution/CTA)
        const showCharacter = ['problem', 'solution', 'cta'].includes(scene.type);
        
        // ✅ KONTEXTBEZOGEN: Icons NICHT bei Hook/CTA (ablenkend)
        const showIcons = icons.length > 0;
        
        // ✅ KONTEXTBEZOGEN: Charakter-Position basierend auf Szene
        const characterPosition = scene.type === 'problem' ? 'left' : 'right';
        
        return (
          <Sequence
            key={scene.id || index}
            from={sceneStartFrame}
            durationInFrames={sceneDurationFrames}
          >
            <SceneTransition
              frame={frame - sceneStartFrame}
              durationInFrames={sceneDurationFrames}
              transitionType={scene.transitionType || 'fade'}
              fps={fps}
              beatAligned={scene.beatAligned}
              bpm={beatSyncData?.bpm}
            >
              <SceneBackground
                imageUrl={scene.imageUrl}
                animatedVideoUrl={scene.animatedVideoUrl}
                useAnimation={scene.useAnimation}
                animation={scene.animation || 'fadeIn'}
                kenBurnsDirection={scene.kenBurnsDirection || 'in'}
                parallaxLayers={scene.parallaxLayers || 3}
                frame={frame - sceneStartFrame}
                durationInFrames={sceneDurationFrames}
                style={style}
                fps={fps}
                sceneType={scene.type}
                primaryColor={primaryColor}
              />
              
              {/* 🎬 Character Animation - Rive (with lip-sync) or Lottie (fallback) */}
              {/* ✅ PHASE 5.1: Pass sceneStartTimeSeconds for correct global lip-sync timing */}
              {showCharacter && useRiveCharacter ? (
                <RiveCharacter
                  phonemeTimestamps={phonemeTimestamps as PhonemeTimestamp[] | undefined}
                  emotion={scene.emotionalTone as any || 'neutral'}
                  gesture={action === 'thinking' ? 'shrugging' : 
                           action === 'celebrating' ? 'celebrating' : 
                           action === 'pointing' ? 'pointing' : 'explaining'}
                  position={characterPosition}
                  skinTone="#FFDAB9"
                  shirtColor={primaryColor}
                  scale={0.9}
                  sceneStartTimeSeconds={scene.startTime || (sceneStartFrame / fps)}
                />
              ) : showCharacter ? (
                <ProfessionalLottieCharacter
                  sceneType={scene.type as 'hook' | 'problem' | 'solution' | 'feature' | 'proof' | 'cta'}
                  action={action as 'idle' | 'pointing' | 'thinking' | 'celebrating' | 'explaining' | 'waving' | 'talking'}
                  position={characterPosition}
                  primaryColor={effectivePrimaryColor}
                  scale={1.0}
                  visible={true}
                  phonemeTimestamps={phonemeTimestamps as CharacterPhonemeTimestamp[] | undefined}
                  brandColors={brandColors}
                  sceneStartTimeSeconds={scene.startTime || (sceneStartFrame / fps)}
                />
              ) : null}
              
              {/* 🎬 Loft-Film: Professional Lottie Icon Animations */}
              {showIcons && (
                <LottieIcons
                  sceneType={scene.type as 'hook' | 'problem' | 'solution' | 'feature' | 'proof' | 'cta'}
                  position={characterPosition === 'left' ? 'right' : 'left'}
                  size={70}
                  staggerDelay={10}
                />
              )}
              
              {/* 🎬 Loft-Film: Scene-specific Transition Effects */}
              {(scene.type === 'solution' || scene.type === 'cta') && (
                <MorphTransition
                  type={scene.type === 'solution' ? 'confetti' : 'sparkle'}
                  transitionFrames={25}
                  position="entry"
                />
              )}
              
              {/* 🎬 LOFT-FILM: DrawOn-Effects basierend auf Szenentyp */}
              {scene.type === 'hook' && (
                <DrawOnEffect
                  type="highlight"
                  x={100}
                  y={200}
                  width={400}
                  height={60}
                  color={primaryColor}
                  delay={20}
                  drawDuration={25}
                />
              )}
              {scene.type === 'solution' && (
                <DrawOnEffect
                  type="checkmark"
                  x={80}
                  y={150}
                  width={80}
                  height={80}
                  color="#10B981"
                  strokeWidth={6}
                  delay={15}
                  drawDuration={20}
                />
              )}
              {scene.type === 'cta' && (
                <DrawOnEffect
                  type="arrow"
                  x={150}
                  y={300}
                  width={200}
                  height={60}
                  color={primaryColor}
                  strokeWidth={5}
                  delay={25}
                  drawDuration={30}
                />
              )}
              {scene.type === 'problem' && (
                <DrawOnEffect
                  type="circle"
                  x={100}
                  y={180}
                  width={120}
                  height={120}
                  color="#EF4444"
                  strokeWidth={4}
                  delay={20}
                  drawDuration={35}
                />
              )}
              
              {/* ✅ PHASE 5: Animated Stats Overlay */}
              {scene.statsOverlay && scene.statsOverlay.length > 0 && (
                <StatsOverlay
                  stats={scene.statsOverlay}
                  frame={frame - sceneStartFrame}
                  durationInFrames={sceneDurationFrames}
                  primaryColor={effectivePrimaryColor}
                  fps={fps}
                />
              )}
              
              <SceneText
                title={scene.title}
                showTitle={showSceneTitles}
                sceneType={scene.type}
                textAnimation={scene.textAnimation || 'fadeWords'}
                frame={frame - sceneStartFrame}
                durationInFrames={sceneDurationFrames}
                primaryColor={effectivePrimaryColor}
                fps={fps}
              />
            </SceneTransition>
          </Sequence>
        );
      })}
      
      {/* ✅ PHASE 2: Precision Subtitles with Word-Level Karaoke Timing */}
      {subtitles.length > 0 && (
        <PrecisionSubtitleOverlay
          subtitles={subtitles.map(s => ({
            text: s.text,
            startTime: s.startTime,
            endTime: s.endTime
          }))}
          phonemeTimestamps={phonemeTimestamps?.filter((p): p is { character: string; start_time: number; end_time: number } => 
            typeof p.character === 'string' && typeof p.start_time === 'number' && typeof p.end_time === 'number'
          )}
          config={{
            animationStyle: 'karaoke',
            fontSize: subtitleConfig.fontSize || 32,
            textColor: subtitleConfig.fontColor || '#FFFFFF',
            backgroundColor: subtitleConfig.backgroundColor || 'rgba(0,0,0,0.75)',
            position: subtitleConfig.position || 'bottom',
            highlightColor: effectivePrimaryColor,
          }}
        />
      )}
      
      {/* ✅ PHASE 5: Progress bar with brand colors */}
      {showProgressBar && (
        <ProgressBar 
          progress={totalProgress} 
          primaryColor={effectivePrimaryColor}
          secondaryColor={effectiveSecondaryColor}
        />
      )}
      
      {/* ✅ PHASE 3: Scene Audio Manager with Dynamic Ducking & Crossfades */}
      {backgroundMusicUrl && backgroundMusicUrl.startsWith('http') && (
        <SceneAudioManager
          backgroundMusicUrl={backgroundMusicUrl}
          voiceoverUrl={voiceoverUrl}
          scenes={scenes.map((scene, index) => {
            const sceneStartTime = scenes.slice(0, index).reduce((acc, s) => acc + (s.durationSeconds || 5), 0);
            const sceneEndTime = sceneStartTime + (scene.durationSeconds || 5);
            return {
              sceneType: scene.type || 'hook',
              startTime: sceneStartTime,
              endTime: sceneEndTime,
              hasVoiceover: !!voiceoverUrl,
            } as SceneAudioConfig;
          })}
          baseMusicVolume={backgroundMusicVolume}
          masterVolume={masterVolume}
          enableDucking={true}
          enableCrossfade={true}
        />
      )}
      
      {/* ✅ PHASE 4: Sound effects with EmbeddedSoundLibrary fallback chain */}
      {allSoundEffects.map((effect, index) => {
        // Use fallback chain: provided URL → embedded Base64
        const soundUrl = effect.soundUrl?.startsWith('http') 
          ? effect.soundUrl 
          : getSoundUrlSync(effect.soundUrl as SoundEffectType);
        
        if (!soundUrl) return null;
        
        return (
          <Sequence
            key={`sfx-${index}`}
            from={Math.floor(effect.startTime * fps)}
          >
            <Audio 
              src={soundUrl} 
              volume={masterVolume * effect.volume}
              pauseWhenBuffering
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
