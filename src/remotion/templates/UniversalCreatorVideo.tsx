import React, { useMemo } from 'react';
import { 
  AbsoluteFill, 
  Audio,
  Video,
  Img, 
  Sequence, 
  useCurrentFrame, 
  useVideoConfig,
  staticFile,
  Html5Audio,
} from 'remotion';
import { safeInterpolate as interpolate, safeDuration, safeSpring as spring, logRemotionDebug } from '../utils/safeInterpolate';
import { z } from 'zod';

// 🎬 Professional imports from Explainer Video
import { LottieIcons } from '../components/LottieIcons';
import { MorphTransition } from '../components/MorphTransition';
import { ProfessionalLottieCharacter, type PhonemeTimestamp as CharacterPhonemeTimestamp } from '../components/ProfessionalLottieCharacter';
import { DrawOnEffect } from '../components/DrawOnEffect';
import { PrecisionSubtitleOverlay } from '../components/PrecisionSubtitleOverlay';
import { SceneAudioManager, type SceneAudioConfig } from '../components/SceneAudioManager';
import { getSoundUrlSync, type SoundEffectType } from '../components/EmbeddedSoundLibrary';

// 🎬 Phase 5: Import RiveCharacter for advanced lip-sync
import { RiveCharacter, type PhonemeTimestamp } from '../components/RiveCharacter';
import { getGestureForSceneType, detectEmotionFromText } from '@/utils/phonemeMapping';

// ✅ r22: CSS gradient fallback instead of data-URI (Remotion Lambda can't load data: URIs)
const FALLBACK_GRADIENT = 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)';

/** Returns true if url is a valid remote URL (not a data-URI or empty) */
function isValidRemoteUrl(url?: string): boolean {
  if (!url || url.length < 10) return false;
  if (url.startsWith('data:')) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

/** CSS gradient fallback div — replaces <Img> when no valid URL is available */
const GradientFallback: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <AbsoluteFill style={{ background: FALLBACK_GRADIENT, ...style }} />
);

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
  // Extended animations
  animation: z.enum(['fadeIn', 'slideUp', 'slideLeft', 'slideRight', 'zoomIn', 'zoomOut', 'bounce', 'none', 'kenBurns', 'parallax', 'popIn', 'flyIn', 'morphIn']).default('fadeIn'),
  kenBurnsDirection: z.enum(['in', 'out', 'left', 'right', 'up', 'down']).default('in'),
  transition: z.object({
    type: z.enum(['none', 'fade', 'crossfade', 'slide', 'zoom', 'wipe', 'blur', 'push', 'morph', 'dissolve']),
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
  // Sound effects
  soundEffectType: z.enum(['whoosh', 'pop', 'success', 'alert', 'none']).optional().default('none'),
  // Hailuo animated video
  animatedVideoUrl: z.string().optional(),
  useAnimation: z.boolean().optional().default(false),
  // Beat sync
  beatAligned: z.boolean().optional().default(false),
  // Phase 2: Stats overlay
  statsOverlay: z.array(z.string()).optional(),
  // Phase 3: Sound effect delay (in seconds)
  soundEffectDelay: z.number().optional(),
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

// Phoneme schema for lip-sync
const PhonemeTimestampSchema = z.object({
  character: z.string(),
  start_time: z.number(),
  end_time: z.number(),
});

// Main schema for Universal Creator Video
// ============================================================
// 🎬 PHASE 3: FONT MAP SYSTEM (Loft-Film Style)
// ============================================================

const FONT_MAP: Record<string, string> = {
  'poppins': "'Poppins', 'DM Sans', sans-serif",
  'outfit': "'Outfit', 'DM Sans', sans-serif",
  'dm-sans': "'DM Sans', 'Inter', sans-serif",
  'inter': "'Inter', 'DM Sans', sans-serif",
  'playfair': "'Playfair Display', 'Georgia', serif",
  'montserrat': "'Montserrat', 'Inter', sans-serif",
  'roboto': "'Roboto', 'Inter', sans-serif",
  'open-sans': "'Open Sans', 'Inter', sans-serif",
};

// ✅ Diagnostic toggle schema — passed through from Edge Function to Lambda
const DiagToggleSchema = z.object({
  disableMorphTransitions: z.boolean().optional().default(false),
  disableLottieIcons: z.boolean().optional().default(false),
  forceEmbeddedCharacterLottie: z.boolean().optional().default(false),
  disablePrecisionSubtitles: z.boolean().optional().default(false),
  disableCharacter: z.boolean().optional().default(false),
  disableAllLottie: z.boolean().optional().default(false), // ← Profile G: kills ALL Lottie
  disableSceneFx: z.boolean().optional().default(false),   // ← Profile I: kills SceneTypeEffects + FloatingIcons
  disableAnimatedText: z.boolean().optional().default(false), // ← Profile J: kills AnimatedText, plain string render
  silentRender: z.boolean().optional().default(false), // ← r41: skip all audio components (mux later)
  r33_audioStripped: z.boolean().optional().default(false),
  sanitizerVersion: z.string().optional(),
  diagnosticProfile: z.string().optional(),
}).optional();

export const UniversalCreatorVideoSchema = z.object({
  // Content
  scenes: z.array(UniversalCreatorSceneSchema).default([]),
  subtitles: z.array(SubtitleSchema).optional(),
  
  // ✅ Diagnostic toggles (schema-valid, not stripped by Zod)
  diag: DiagToggleSchema,
  
  // Audio
  voiceoverUrl: z.string().optional(),
  voiceoverDuration: z.number().optional(),
  backgroundMusicUrl: z.string().optional(),
  backgroundMusicVolume: z.number().default(0.2),
  masterVolume: z.number().default(1.0),
  soundEffects: z.array(z.object({
    sceneId: z.string(),
    soundUrl: z.string(),
    volume: z.number(),
    startTime: z.number(),
  })).optional(),
  
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
  style: z.enum(['flat-design', 'isometric', 'whiteboard', 'comic', 'corporate', 'modern-3d']).optional().default('flat-design'),
  primaryColor: z.string().default('#F5C76A'),
  secondaryColor: z.string().default('#22d3ee'),
  fontFamily: z.string().default('Inter'),
  // Phase 3: Font preference system
  preferredFont: z.enum(['poppins', 'outfit', 'dm-sans', 'inter', 'playfair', 'montserrat', 'roboto', 'open-sans']).optional().default('inter'),
  
  // Brand colors
  brandColors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
  }).optional(),
  
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
  showSceneTitles: z.boolean().optional().default(false),
  
  // Character & Lip-sync
  useCharacter: z.boolean().optional().default(false),
  characterPosition: z.enum(['left', 'right', 'center']).optional().default('right'),
  phonemeTimestamps: z.array(PhonemeTimestampSchema).optional(),
  // Phase 5: Character type for lip-sync
  characterType: z.enum(['svg', 'lottie', 'rive']).optional().default('svg'),
  
  // Beat sync data
  beatSyncData: z.object({
    bpm: z.number(),
    transitionPoints: z.array(z.number()),
    downbeats: z.array(z.number()),
  }).optional(),
});

export type UniversalCreatorVideoProps = z.infer<typeof UniversalCreatorVideoSchema>;
type UniversalCreatorScene = z.infer<typeof UniversalCreatorSceneSchema>;
type Subtitle = z.infer<typeof SubtitleSchema>;

// ============================================================
// 🎬 PROFESSIONAL ANIMATION COMPONENTS (Phase 1)
// ============================================================

// Pop-In Animation (Loft-Film Style)
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

// Fly-In Animation (Loft-Film Style)
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

// Stagger Reveal Animation (Loft-Film Style)
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

// Hand-Draw Reveal Animation
const HandDrawReveal: React.FC<{
  children: React.ReactNode;
  frame: number;
  durationInFrames: number;
}> = ({ children, frame, durationInFrames }) => {
  // ✅ CRITICAL FIX: Use imported safeDuration function
  const safeDur = safeDuration(durationInFrames, 30);
  const revealEnd = Math.max(1, safeDur * 0.4);
  
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

// ============================================================
// 🎬 PHASE 2: STATS OVERLAY (Loft-Film Style)
// ============================================================

const StatsOverlay: React.FC<{
  stats: string[];
  frame: number;
  fps: number;
  primaryColor: string;
}> = ({ stats, frame, fps, primaryColor }) => {
  if (!stats || stats.length === 0) return null;
  
  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        right: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {stats.map((stat, i) => {
        const delay = i * 15;
        const entryProgress = spring({
          frame: frame - delay,
          fps,
          config: { damping: 12, stiffness: 100 },
        });
        
        const countUp = interpolate(
          frame - delay,
          [0, 40],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        
        // Parse stat to extract number (e.g., "+150%" -> 150)
        const numberMatch = stat.match(/([\d.]+)/);
        const displayNumber = numberMatch
          ? Math.floor(parseFloat(numberMatch[1]) * countUp)
          : null;
        const displayStat = displayNumber !== null
          ? stat.replace(numberMatch[1], displayNumber.toString())
          : stat;
        
        return (
          <div
            key={i}
            style={{
              opacity: Math.max(0, entryProgress),
              transform: `translateX(${(1 - Math.max(0, entryProgress)) * 50}px) scale(${0.8 + 0.2 * Math.max(0, entryProgress)})`,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(10px)',
              padding: '12px 24px',
              borderRadius: 12,
              borderLeft: `4px solid ${primaryColor}`,
            }}
          >
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: primaryColor,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {displayStat}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================
// 🎬 PHASE 3: SMART SOUND TIMING LOGIC
// ============================================================

const getSmartSoundDelay = (sceneType: string, soundEffectType: string): number => {
  // Scene type based delays (in seconds)
  const sceneDelays: Record<string, number> = {
    hook: 0.1,      // Immediate impact
    problem: 0.3,   // Slight delay for emphasis
    solution: 0.5,  // Build-up before success sound
    feature: 0.2,   // Quick reveal
    cta: 0.4,       // Anticipation before call-to-action
    proof: 0.3,     // Pause before validation
    intro: 0.0,     // Start immediately
    outro: 0.2,     // Gentle exit
  };
  
  // Sound type based adjustments
  const soundAdjustments: Record<string, number> = {
    whoosh: 0.0,    // Transition sounds play immediately
    pop: 0.3,       // Pop sounds after element appears
    success: 0.8,   // Success sounds after content settles
    alert: 0.1,     // Alert sounds need quick attention
    none: 0,
  };
  
  const baseDelay = sceneDelays[sceneType] || 0.2;
  const soundAdjustment = soundAdjustments[soundEffectType] || 0;
  
  return baseDelay + soundAdjustment;
};

// Scene sound effect component
const SceneSoundEffect: React.FC<{
  scene: UniversalCreatorScene;
  frame: number;
  fps: number;
  masterVolume: number;
}> = ({ scene, frame, fps, masterVolume }) => {
  const soundEffectType = scene.soundEffectType || 'none';
  if (soundEffectType === 'none') return null;
  
  const soundUrl = getSoundUrlSync(soundEffectType as SoundEffectType);
  if (!soundUrl) return null;
  
  const delay = scene.soundEffectDelay ?? getSmartSoundDelay(scene.type, soundEffectType);
  const delayFrames = Math.floor(delay * fps);
  
  if (frame < delayFrames) return null;
  
  return (
    <Audio
      src={soundUrl}
      volume={masterVolume * 0.6}
      startFrom={0}
    />
  );
};

// ============================================================
// 🎬 SCENE TYPE EFFECTS (Phase 3)
// ============================================================

// Spotlight Effect
const SpotlightEffect: React.FC<{
  frame: number;
  durationInFrames: number;
  primaryColor: string;
}> = ({ frame, durationInFrames, primaryColor }) => {
  // ✅ CRITICAL FIX: Use imported safeDuration function
  const safeDur = safeDuration(durationInFrames, 30);
  
  const pulseIntensity = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.3, 0.6]
  );
  
  const spotlightX = interpolate(frame, [0, safeDur], [30, 70], {
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

// Pulse Highlight Effect
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

// Floating Icons Effect
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
    intro: ['👋', '🌟', '✨'],
    outro: ['🙏', '💫', '🎬'],
    transition: [],
  };
  
  const sceneIcons = icons[sceneType] || icons.hook;
  if (sceneIcons.length === 0) return null;
  
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

// Scene Type Effects (Hook-Zoom, Problem-Shake, Solution-Glow, CTA-Pulse)
const SceneTypeEffects: React.FC<{
  sceneType: string;
  frame: number;
  durationInFrames: number;
  primaryColor: string;
}> = ({ sceneType, frame, durationInFrames, primaryColor }) => {
  // ✅ CRITICAL FIX: Use imported safeDuration function
  const safeDur = safeDuration(durationInFrames, 60);
  const fadeInFrames = Math.min(20, Math.floor(safeDur * 0.2));
  const fadeOutStart = Math.min(Math.max(fadeInFrames + 2, safeDur - fadeInFrames), safeDur - 2);
  
  switch (sceneType) {
    case 'hook':
      const hookZoom = interpolate(frame, [0, 30], [1.1, 1], { extrapolateRight: 'clamp' });
      return (
        <>
          <SpotlightEffect frame={frame} durationInFrames={safeDur} primaryColor={primaryColor} />
          <div style={{ 
            position: 'absolute', 
            inset: 0, 
            transform: `scale(${hookZoom})`,
            pointerEvents: 'none',
          }} />
        </>
      );
    
    case 'problem':
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
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            boxShadow: 'inset 0 0 150px 50px rgba(16,185,129,0.15)',
            pointerEvents: 'none',
          }}
        >
          {[...Array(5)].map((_, i) => {
            // ✅ Use validated safeDuration for all interpolate calls
            const particleY = interpolate(frame, [0, safeDur], [100, -20], { extrapolateRight: 'clamp' });
            const particleX = 20 + i * 15;
            // ✅ Use calculated fadeInFrames and fadeOutStart to ensure ascending array
            const particleOpacity = interpolate(frame, [0, fadeInFrames, fadeOutStart, safeDur], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
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
      return <PulseHighlight frame={frame} primaryColor={primaryColor} />;
    
    default:
      return null;
  }
};

// ============================================================
// 🎬 CHARACTER ANIMATION (Phase 2)
// ============================================================

// Animated SVG Character (Loft-Film Style)
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
  
  const entryProgress = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80 },
  });
  
  const breathe = Math.sin(frame * 0.08) * 3;
  const headTilt = Math.sin(frame * 0.05) * 3;
  const blinkCycle = frame % 90;
  const isBlinking = blinkCycle < 3;
  
  const armWave = action === 'pointing' 
    ? Math.sin(frame * 0.12) * 10 
    : action === 'explaining' 
      ? Math.sin(frame * 0.15) * 15 
      : 0;
  
  const celebrateBounce = action === 'celebrating' ? Math.abs(Math.sin(frame * 0.2)) * 15 : 0;
  
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: '5%', right: 'auto' },
    right: { right: '5%', left: 'auto' },
    center: { left: '50%', transform: 'translateX(-50%)' },
  };
  
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
        transform: `translateY(${breathe - celebrateBounce}px) scale(${0.3 + 0.7 * Math.max(0, entryProgress)})`,
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
        <g transform={`rotate(${headTilt}, 100, 60)`}>
          <ellipse cx="100" cy="55" rx="40" ry="45" fill={colors.skin} />
          <path d="M 60 45 Q 70 20 100 15 Q 130 20 140 45" fill="#2D1B0E" stroke="none" />
          <g transform={isBlinking ? 'scaleY(0.1)' : ''} style={{ transformOrigin: '100px 50px' }}>
            <ellipse cx="82" cy="50" rx="6" ry={isBlinking ? 1 : 4} fill="#2D1B0E" />
            <ellipse cx="118" cy="50" rx="6" ry={isBlinking ? 1 : 4} fill="#2D1B0E" />
            {!isBlinking && (
              <>
                <circle cx="84" cy="48" r="2" fill="white" opacity="0.7" />
                <circle cx="120" cy="48" r="2" fill="white" opacity="0.7" />
              </>
            )}
          </g>
          <path d="M 72 40 Q 82 37 92 40" stroke="#2D1B0E" strokeWidth="2" fill="none" />
          <path d="M 108 40 Q 118 37 128 40" stroke="#2D1B0E" strokeWidth="2" fill="none" />
          {action === 'celebrating' ? (
            <path d="M 85 72 Q 100 85 115 72" fill="none" stroke="#C0392B" strokeWidth="3" />
          ) : action === 'thinking' ? (
            <ellipse cx="100" cy="75" rx="8" ry="5" fill="#C0392B" />
          ) : (
            <path d="M 88 72 Q 100 78 112 72" fill="none" stroke="#C0392B" strokeWidth="2" />
          )}
        </g>
        <rect x="90" y="95" width="20" height="20" fill={colors.skin} />
        <path d="M 60 115 L 65 110 L 135 110 L 140 115 L 145 200 L 55 200 Z" fill={colors.shirt} />
        <path d="M 85 110 L 100 130 L 115 110" fill="white" stroke="none" />
        <g>
          <path d="M 60 120 Q 40 150 45 190" stroke={colors.shirt} strokeWidth="20" fill="none" strokeLinecap="round" />
          <circle cx="45" cy="195" r="12" fill={colors.skin} />
        </g>
        <g transform={`rotate(${-30 + armWave}, 140, 120)`}>
          <path d="M 140 120 Q 170 100 180 70" stroke={colors.shirt} strokeWidth="20" fill="none" strokeLinecap="round" />
          <circle cx="182" cy="65" r="12" fill={colors.skin} />
          {action === 'pointing' && (
            <path d="M 190 60 L 210 45" stroke={colors.skin} strokeWidth="6" strokeLinecap="round" />
          )}
        </g>
        <rect x="70" y="200" width="25" height="80" rx="5" fill={colors.pants} />
        <rect x="105" y="200" width="25" height="80" rx="5" fill={colors.pants} />
        <ellipse cx="82" cy="285" rx="18" ry="8" fill="#1a1a1a" />
        <ellipse cx="118" cy="285" rx="18" ry="8" fill="#1a1a1a" />
      </svg>
    </div>
  );
};

// Staggered Icons Display
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
              transform: `translateY(${(1 - Math.max(0, iconProgress)) * 60 + float}px) scale(${0.4 + 0.6 * Math.max(0, iconProgress)}) rotate(${rotate}deg)`,
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

// ============================================================
// 🎬 TEXT ANIMATIONS (Enhanced)
// ============================================================

// Highlight Text Reveal (Loft-Film Style underline animation)
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
        
        const underlineWidth = interpolate(
          frame - wordDelay - 8,
          [0, 12],
          [0, 100],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        
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
  // ✅ CRITICAL FIX: Use imported safeDuration function
  const safeDur = safeDuration(durationInFrames, 30);
  
  switch (animation) {
    case 'typewriter':
      const typewriterEnd = Math.max(1, safeDur * 0.7);
      const charsToShow = Math.floor(interpolate(frame, [0, typewriterEnd], [0, text.length], { extrapolateRight: 'clamp' }));
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
    
    case 'waveIn':
      return (
        <span>
          {words.map((word, i) => {
            const wordDelay = i * 4;
            const waveProgress = spring({
              frame: frame - wordDelay,
              fps,
              config: { damping: 10, stiffness: 120 },
            });
            const waveOffset = Math.sin((frame - wordDelay) * 0.15) * 5;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  transform: `translateY(${waveOffset * (1 - waveProgress)}px)`,
                  opacity: waveProgress,
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

// ============================================================
// 🎬 KEN BURNS & PARALLAX (Phase 5)
// ============================================================

// Ken Burns Effect
const KenBurnsImage: React.FC<{
  imageUrl?: string;
  direction: string;
  frame: number;
  durationInFrames: number;
}> = ({ imageUrl, direction, frame, durationInFrames }) => {
  // ✅ CRITICAL FIX: Use imported safeDuration function
  const safeDur = safeDuration(durationInFrames, 30);
  const progress = frame / safeDur;
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
      {isValidRemoteUrl(imageUrl) ? (
        <Img
          src={imageUrl!}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform,
            transformOrigin: 'center center',
          }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', background: FALLBACK_GRADIENT, transform, transformOrigin: 'center center' }} />
      )}
    </div>
  );
};

// Parallax Background
const ParallaxBackground: React.FC<{
  imageUrl?: string;
  layers: number;
  frame: number;
  durationInFrames: number;
}> = ({ imageUrl, layers, frame, durationInFrames }) => {
  // ✅ CRITICAL FIX: Use imported safeDuration function
  const safeDur = safeDuration(durationInFrames, 30);
  const progress = frame / safeDur;
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity }}>
      {isValidRemoteUrl(imageUrl) ? (
        <Img
          src={imageUrl!}
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
      ) : (
        <div style={{ position: 'absolute', width: '110%', height: '110%', left: '-5%', top: '-5%', background: FALLBACK_GRADIENT }} />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.3) 100%)',
          transform: `translateY(${interpolate(progress, [0, 1], [0, -5])}px)`,
        }}
      />
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

// ============================================================
// 🎬 TRANSITIONS (Phase 6)
// ============================================================

// Scene Transition with Beat Sync
const SceneTransition: React.FC<{
  children: React.ReactNode;
  frame: number;
  durationInFrames: number;
  transitionType: 'morph' | 'wipe' | 'zoom' | 'dissolve' | 'fade' | 'none';
  fps: number;
  beatAligned?: boolean;
  bpm?: number;
}> = ({ children, frame, durationInFrames, transitionType = 'fade', fps, beatAligned = false, bpm }) => {
  // ✅ CRITICAL FIX: Use imported safeDuration function
  const safeDur = safeDuration(durationInFrames, 60);
  
  const baseTransitionFrames = 15;
  const transitionFrames = beatAligned && bpm 
    ? Math.min(Math.round((60 / bpm) * fps * 0.5), 20)
    : baseTransitionFrames;
  
  // ✅ Ensure exit start is always valid (ascending array)
  const safeExitStart = Math.min(Math.max(transitionFrames + 2, safeDur - transitionFrames), safeDur - 2);
  
  const beatPulse = beatAligned && bpm
    ? 1 + Math.sin(frame * (bpm / 60) * Math.PI * 2 / fps) * 0.02
    : 1;
  
  let style: React.CSSProperties = {};
  
  switch (transitionType) {
    case 'wipe':
      const wipeProgress = interpolate(frame, [0, transitionFrames], [0, 100], { extrapolateRight: 'clamp' });
      const wipeExit = interpolate(frame, [safeExitStart, safeDur], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      style = { clipPath: frame < transitionFrames ? `inset(0 ${100 - wipeProgress}% 0 0)` : `inset(0 0 0 ${100 - wipeExit}%)` };
      break;
      
    case 'zoom':
      const zoomScale = interpolate(frame, [0, transitionFrames], [1.3, 1], { extrapolateRight: 'clamp' }) * beatPulse;
      const zoomOpacity = interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateRight: 'clamp' });
      const zoomExitScale = interpolate(frame, [safeExitStart, safeDur], [1, 0.8], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const zoomExitOpacity = interpolate(frame, [safeExitStart, safeDur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const finalScale = frame > safeExitStart ? zoomExitScale : zoomScale;
      const finalOpacity = frame > safeExitStart ? zoomExitOpacity : zoomOpacity;
      style = { transform: `scale(${finalScale})`, opacity: finalOpacity };
      break;
      
    case 'dissolve':
      const dissolveIn = interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateRight: 'clamp' });
      const dissolveOut = interpolate(frame, [safeExitStart, safeDur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      style = { opacity: Math.min(dissolveIn, dissolveOut), filter: `blur(${(1 - Math.min(dissolveIn, dissolveOut)) * 5}px)` };
      break;
      
    case 'morph':
      const morphIn = interpolate(frame, [0, transitionFrames], [0.9, 1], { extrapolateRight: 'clamp' });
      const morphOpacityIn = interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateRight: 'clamp' });
      const morphBlur = frame < transitionFrames ? interpolate(frame, [0, transitionFrames], [3, 0], { extrapolateRight: 'clamp' }) : 0;
      style = { transform: `scale(${morphIn})`, opacity: morphOpacityIn, filter: morphBlur > 0 ? `blur(${morphBlur}px)` : 'none' };
      break;
      
    case 'fade':
    default:
      const fadeIn = interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateRight: 'clamp' });
      const fadeOut = interpolate(frame, [safeExitStart, safeDur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      style = { opacity: Math.min(fadeIn, fadeOut) };
      break;
  }
  
  return <div style={{ ...style, width: '100%', height: '100%' }}>{children}</div>;
};

// ============================================================
// 🎬 SCENE COMPONENTS
// ============================================================

// Style overlays
const styleOverlays: Record<string, string> = {
  'flat-design': 'linear-gradient(135deg, rgba(79,70,229,0.1) 0%, rgba(16,185,129,0.1) 100%)',
  'isometric': 'linear-gradient(180deg, rgba(59,130,246,0.1) 0%, rgba(139,92,246,0.1) 100%)',
  'whiteboard': 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(243,244,246,0.9) 100%)',
  'comic': 'linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(251,191,36,0.05) 100%)',
  'corporate': 'linear-gradient(180deg, rgba(30,58,95,0.2) 0%, rgba(100,116,139,0.1) 100%)',
  'modern-3d': 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(236,72,153,0.1) 100%)',
};

// ============================================================
// 🎬 CATEGORY-AWARE CONTRAST OVERLAY
// ============================================================

type ContrastOverlayType = 'cinematic' | 'bold' | 'subtle' | 'clean' | 'dramatic';

const CategoryContrastOverlay: React.FC<{
  overlayType: ContrastOverlayType;
  sceneType: string;
  primaryColor: string;
}> = ({ overlayType, sceneType, primaryColor }) => {
  const getOverlayStyle = (): React.CSSProperties => {
    switch (overlayType) {
      case 'cinematic':
        // Storytelling/Testimonial: warm vignette with soft gradient
        return {
          background: `
            radial-gradient(ellipse 80% 70% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%),
            linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.65) 100%)
          `,
        };
      case 'bold':
        // Ads/Social/Event: strong contrast, text always readable
        return {
          background: `
            linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.7) 85%, rgba(0,0,0,0.85) 100%)
          `,
        };
      case 'dramatic':
        // Product/Promo: spotlight center, dark edges
        return {
          background: `
            radial-gradient(ellipse 50% 50% at 50% 45%, transparent 0%, rgba(0,0,0,0.6) 100%),
            linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 25%, transparent 65%, rgba(0,0,0,0.75) 100%)
          `,
        };
      case 'clean':
        // Tutorial/Explainer/Presentation: light, professional
        return {
          background: `
            linear-gradient(180deg, rgba(0,0,0,0.1) 0%, transparent 20%, transparent 65%, rgba(0,0,0,0.5) 100%)
          `,
        };
      case 'subtle':
      default:
        // Corporate: minimal, formal
        return {
          background: `
            linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 25%, transparent 70%, rgba(0,0,0,0.45) 100%)
          `,
        };
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
        ...getOverlayStyle(),
      }}
    />
  );
};

// Map category prop to contrast overlay type
function getCategoryContrastType(category?: string): ContrastOverlayType {
  const map: Record<string, ContrastOverlayType> = {
    'product-ad': 'bold',
    'social-reel': 'bold',
    'explainer': 'clean',
    'testimonial': 'cinematic',
    'tutorial': 'clean',
    'event-promo': 'bold',
    'brand-story': 'cinematic',
    'educational': 'clean',
    'announcement': 'dramatic',
    'behind-scenes': 'cinematic',
    'comparison': 'clean',
    'showcase': 'dramatic',
  };
  return map[category || ''] || 'subtle';
}

// Scene Background Component
const SceneBackground: React.FC<{
  scene: UniversalCreatorScene;
  frame: number;
  durationInFrames: number;
  fps: number;
  style?: string;
  primaryColor: string;
  disableSceneFx?: boolean;
  contrastOverlayType?: ContrastOverlayType;
}> = ({ scene, frame, durationInFrames, fps, style = 'flat-design', primaryColor, disableSceneFx = false, contrastOverlayType = 'subtle' }) => {
  const { background, animation, kenBurnsDirection, animatedVideoUrl, useAnimation, type } = scene;
  
  // Hailuo animated video
  if (animatedVideoUrl && useAnimation) {
    const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
    return (
      <AbsoluteFill style={{ opacity }}>
        <Video
          src={animatedVideoUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <CategoryContrastOverlay overlayType={contrastOverlayType} sceneType={type} primaryColor={primaryColor} />
        {!disableSceneFx && <SceneTypeEffects sceneType={type} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />}
        {!disableSceneFx && <FloatingIcons sceneType={type} frame={frame} primaryColor={primaryColor} />}
      </AbsoluteFill>
    );
  }
  
  const imageUrl = background.type === 'image' ? background.imageUrl : undefined;
  const safeImageUrl = isValidRemoteUrl(imageUrl) ? imageUrl! : undefined;
  
  // Ken Burns
  if (animation === 'kenBurns' && (background.type === 'image' || !background.type)) {
    return (
      <>
        <KenBurnsImage
          imageUrl={safeImageUrl}
          direction={kenBurnsDirection}
          frame={frame}
          durationInFrames={durationInFrames}
        />
        <div style={{ position: 'absolute', inset: 0, background: styleOverlays[style] || 'transparent', pointerEvents: 'none' }} />
        {!disableSceneFx && <SceneTypeEffects sceneType={type} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />}
        {!disableSceneFx && <FloatingIcons sceneType={type} frame={frame} primaryColor={primaryColor} />}
      </>
    );
  }
  
  // Parallax
  if (animation === 'parallax') {
    return (
      <>
        <ParallaxBackground imageUrl={safeImageUrl} layers={3} frame={frame} durationInFrames={durationInFrames} />
        <div style={{ position: 'absolute', inset: 0, background: styleOverlays[style] || 'transparent', pointerEvents: 'none' }} />
        {!disableSceneFx && <SceneTypeEffects sceneType={type} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />}
        {!disableSceneFx && <FloatingIcons sceneType={type} frame={frame} primaryColor={primaryColor} />}
      </>
    );
  }
  
  // Pop-In
  if (animation === 'popIn') {
    return (
      <PopInElement delay={0} frame={frame} fps={fps}>
        <AbsoluteFill>
          {renderBackgroundContent(background, safeImageUrl)}
          <div style={{ position: 'absolute', inset: 0, background: styleOverlays[style] || 'transparent', pointerEvents: 'none' }} />
          {!disableSceneFx && <SceneTypeEffects sceneType={type} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />}
          {!disableSceneFx && <FloatingIcons sceneType={type} frame={frame} primaryColor={primaryColor} />}
        </AbsoluteFill>
      </PopInElement>
    );
  }
  
  // Fly-In
  if (animation === 'flyIn') {
    return (
      <FlyInElement direction="right" delay={0} frame={frame} fps={fps}>
        <AbsoluteFill>
          {renderBackgroundContent(background, safeImageUrl)}
          <div style={{ position: 'absolute', inset: 0, background: styleOverlays[style] || 'transparent', pointerEvents: 'none' }} />
          {!disableSceneFx && <SceneTypeEffects sceneType={type} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />}
          {!disableSceneFx && <FloatingIcons sceneType={type} frame={frame} primaryColor={primaryColor} />}
        </AbsoluteFill>
      </FlyInElement>
    );
  }
  
  // Standard animations
  const entryOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  let transform = 'scale(1)';
  let opacity = entryOpacity;
  
  // ✅ CRITICAL FIX: Use imported safeDuration function
  const safeDur = safeDuration(durationInFrames, 30);
  const progress = frame / safeDur;
  
  switch (animation) {
    case 'zoomIn':
      const scale = interpolate(progress, [0, 1], [1, 1.15], { extrapolateRight: 'clamp' });
      transform = `scale(${scale})`;
      break;
    case 'slideUp':
      const slideY = interpolate(frame, [0, 20], [50, 0], { extrapolateRight: 'clamp' });
      transform = `translateY(${slideY}px)`;
      break;
    case 'slideLeft':
      const slideX = interpolate(frame, [0, 20], [100, 0], { extrapolateRight: 'clamp' });
      transform = `translateX(${slideX}px)`;
      break;
    case 'slideRight':
      const slideRX = interpolate(frame, [0, 20], [-100, 0], { extrapolateRight: 'clamp' });
      transform = `translateX(${slideRX}px)`;
      break;
    case 'zoomOut':
      const zoomOutScale = interpolate(frame, [0, 20], [1.2, 1], { extrapolateRight: 'clamp' });
      transform = `scale(${zoomOutScale})`;
      break;
    case 'bounce':
      const bounceScale = spring({ frame, fps, config: { damping: 8, stiffness: 200 } });
      transform = `scale(${0.8 + 0.2 * bounceScale})`;
      opacity = bounceScale;
      break;
    case 'morphIn':
      // Smooth morph transformation with scale + rotation
      const morphProgress = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
      const morphScale = interpolate(morphProgress, [0, 0.5, 1], [0.3, 1.1, 1]);
      const morphRotate = interpolate(morphProgress, [0, 0.5, 1], [-10, 5, 0]);
      const morphBlur = interpolate(morphProgress, [0, 0.5, 1], [10, 2, 0]);
      transform = `scale(${morphScale}) rotate(${morphRotate}deg)`;
      opacity = morphProgress;
      break;
  }
  
  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={{ width: '100%', height: '100%', transform }}>
        {renderBackgroundContent(background, safeImageUrl)}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: styleOverlays[style] || 'transparent', pointerEvents: 'none' }} />
      {!disableSceneFx && <SceneTypeEffects sceneType={type} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />}
      {!disableSceneFx && <FloatingIcons sceneType={type} frame={frame} primaryColor={primaryColor} />}
    </AbsoluteFill>
  );
};

// Helper to render background content
function renderBackgroundContent(background: UniversalCreatorScene['background'], safeImageUrl?: string) {
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
  
  if (background.type === 'video' && background.videoUrl) {
    return (
      <AbsoluteFill>
        <Video src={background.videoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loop muted />
      </AbsoluteFill>
    );
  }
  
  // Default: image with gradient fallback for invalid URLs
  if (safeImageUrl) {
    return (
      <AbsoluteFill>
        <Img src={safeImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
    );
  }
  
  return <GradientFallback />;
}

// Text Overlay Component
const TextOverlay: React.FC<{
  scene: UniversalCreatorScene;
  frame: number;
  durationInFrames: number;
  primaryColor: string;
  fps: number;
  showTitle?: boolean;
  disableAnimatedText?: boolean;
}> = ({ scene, frame, durationInFrames, primaryColor, fps, showTitle = false, disableAnimatedText = false }) => {
  const textOverlay = scene.textOverlay;
  const title = scene.title;
  
  // Show scene title if enabled
  if (showTitle && title) {
    // ✅ CRITICAL FIX: Use imported safeDuration function
    const safeDur = safeDuration(durationInFrames, 60);
    const safeIn = Math.min(15, safeDur * 0.25);
    const safeOut = Math.min(Math.max(safeIn + 2, safeDur - 15), safeDur - 2);
    
    const opacity = interpolate(
      frame,
      [0, safeIn, safeOut, safeDur],
      [0, 1, 1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
    
    const slideY = interpolate(frame, [0, 20], [30, 0], { extrapolateRight: 'clamp' });
    
    const typeLabels: Record<string, string> = {
      hook: 'HOOK',
      problem: 'PROBLEM',
      solution: 'LÖSUNG',
      feature: 'FEATURE',
      proof: 'BEWEIS',
      cta: 'CALL TO ACTION',
      intro: 'INTRO',
      outro: 'OUTRO',
    };
    
    const typeColors: Record<string, string> = {
      hook: '#F59E0B',
      problem: '#EF4444',
      solution: '#10B981',
      feature: '#3B82F6',
      proof: '#8B5CF6',
      cta: primaryColor,
      intro: '#6366F1',
      outro: '#EC4899',
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
            backgroundColor: typeColors[scene.type] || primaryColor,
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
            {typeLabels[scene.type] || scene.type.toUpperCase()}
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
          {disableAnimatedText ? (
            <span>{title}</span>
          ) : (
            <AnimatedText
              text={title}
              animation={textOverlay?.animation || 'fadeWords'}
              frame={frame}
              durationInFrames={durationInFrames}
              primaryColor={primaryColor}
              fps={fps}
            />
          )}
        </h2>
      </div>
    );
  }
  
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
        {disableAnimatedText ? (
          <span>{textOverlay.text}</span>
        ) : (
          <AnimatedText
            text={textOverlay.text}
            animation={textOverlay.animation}
            frame={frame}
            durationInFrames={durationInFrames}
            primaryColor={primaryColor}
            fps={fps}
          />
        )}
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
  secondaryColor?: string;
}> = ({ frame, totalFrames, primaryColor, secondaryColor }) => {
  const progress = (frame / totalFrames) * 100;
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
          width: `${progress}%`,
          background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}CC)`,
          boxShadow: `0 0 12px ${primaryColor}60`,
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

// ============================================================
// 🎬 MAIN COMPONENT
// ============================================================

export const UniversalCreatorVideo: React.FC<UniversalCreatorVideoProps> = ({
  scenes = [],
  subtitles,
  voiceoverUrl,
  backgroundMusicUrl,
  backgroundMusicVolume = 0.2,
  masterVolume = 1.0,
  soundEffects,
  style = 'flat-design',
  primaryColor = '#F5C76A',
  secondaryColor = '#22d3ee',
  subtitleStyle,
  showProgressBar = false,
  showWatermark = false,
  watermarkText,
  showSceneTitles = false,
  useCharacter = false,
  characterPosition = 'right',
  characterType = 'svg',
  phonemeTimestamps,
  beatSyncData,
  fps: propsFps,
  preferredFont = 'inter',
  diag,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const effectiveFps = propsFps || fps;
  
  // ✅ BUNDLE CANARY: Proves which bundle version is running in Lambda
  if (frame === 0) {
    console.error('UCV_BUNDLE_CANARY=2026-03-04-r9-profileJ-nonLottieIsolation');
  }
  
  // ✅ DIAGNOSTIC TOGGLES: Read from props (passed via `diag` schema field)
  const rawDiag = diag;
  const disableAllLottie = rawDiag?.disableAllLottie === true;
  const diagToggles = useMemo(() => ({
    disableMorphTransitions: disableAllLottie || rawDiag?.disableMorphTransitions === true,
    disableLottieIcons: disableAllLottie || rawDiag?.disableLottieIcons === true,
    forceEmbeddedCharacterLottie: rawDiag?.forceEmbeddedCharacterLottie === true,
    disablePrecisionSubtitles: rawDiag?.disablePrecisionSubtitles === true,
    disableCharacter: disableAllLottie || rawDiag?.disableCharacter === true,
    disableAllLottie,
    disableSceneFx: rawDiag?.disableSceneFx === true,
    disableAnimatedText: rawDiag?.disableAnimatedText === true,
    silentRender: rawDiag?.silentRender === true, // r41: skip all audio components
    r33_audioStripped: rawDiag?.r33_audioStripped === true, // r33: audio corruption recovery
  }), [rawDiag, disableAllLottie]);
  
  // ✅ Log effective diag toggles on first frame for CloudWatch forensics
  if (frame === 0) {
    console.error('[DIAG_TOGGLES_EFFECTIVE]', JSON.stringify(diagToggles));
    console.error('[DIAG_PROFILE]', rawDiag?.diagnosticProfile || 'unknown');
  }
  
  // ✅ CRITICAL: Always log to CloudWatch for debugging
  if (frame === 0 || frame === 1) {
    console.error('[UniversalCreatorVideo RENDER START]', JSON.stringify({
      fps,
      durationInFrames,
      width,
      height,
      frame,
      scenesCount: scenes?.length,
      sceneDurations: scenes?.map((s: any, i: number) => ({
        idx: i,
        dur: s?.duration,
        type: typeof s?.duration,
        valid: Number.isFinite(Number(s?.duration)) && Number(s?.duration) > 0,
      })),
    }));
  }
  
  // ✅ Debug logging for production troubleshooting
  logRemotionDebug('UniversalCreatorVideo', { 
    fps, 
    durationInFrames, 
    width, 
    height, 
    scenesLength: scenes?.length,
    frame 
  });
  
  // ✅ Early validation - prevent crashes from invalid config
  if (!durationInFrames || durationInFrames <= 0 || isNaN(durationInFrames) || !isFinite(durationInFrames)) {
    console.error('[UniversalCreatorVideo] Invalid config detected:', { fps, durationInFrames, width, height });
    return (
      <AbsoluteFill style={{ 
        backgroundColor: '#0f172a', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 20,
      }}>
        <div style={{ 
          color: primaryColor, 
          fontSize: 32, 
          fontWeight: 700,
          fontFamily: "'Inter', sans-serif",
        }}>
          Configuration Error
        </div>
        <div style={{ 
          color: 'rgba(255,255,255,0.6)', 
          fontSize: 18,
          fontFamily: "'Inter', sans-serif",
        }}>
          Invalid video duration: {String(durationInFrames)}
        </div>
      </AbsoluteFill>
    );
  }
  
  // Validate and filter scenes to prevent crashes from invalid duration values
  const validScenes = useMemo(() => {
    return scenes.filter(scene => {
      const dur = Number(scene?.duration);
      const isValid = !isNaN(dur) && isFinite(dur) && dur > 0;
      if (!isValid) {
        console.warn('[UniversalCreatorVideo] Skipping invalid scene:', { 
          id: scene?.id, 
          duration: scene?.duration 
        });
      }
      return isValid;
    }).map(scene => ({
      ...scene,
      // Ensure duration is at least 0.1 seconds
      duration: Math.max(0.1, Number(scene.duration) || 1),
    }));
  }, [scenes]);

  // Calculate scene timings with validated scenes
  const sceneTimings = useMemo(() => {
    let cumulativeFrames = 0;
    return validScenes.map((scene, index) => {
      // Additional safeguard for frame calculation
      const rawFrames = Number(scene.duration) * effectiveFps;
      const sceneDurationFrames = Math.max(1, isFinite(rawFrames) ? Math.ceil(rawFrames) : 30);
      const startFrame = cumulativeFrames;
      cumulativeFrames += sceneDurationFrames;
      return {
        ...scene,
        startFrame,
        endFrame: cumulativeFrames,
        durationInFrames: sceneDurationFrames,
      };
    });
  }, [validScenes, effectiveFps]);

  // Fallback if no valid scenes
  if (validScenes.length === 0) {
    console.error('[UniversalCreatorVideo] No valid scenes found after filtering');
    return (
      <AbsoluteFill style={{ 
        backgroundColor: '#0f172a', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ 
          color: primaryColor, 
          fontSize: 24, 
          textAlign: 'center',
          fontFamily: "'Inter', sans-serif",
        }}>
          No valid scenes available
        </div>
      </AbsoluteFill>
    );
  }
  
  // Get current scene for character action
  const currentSceneIndex = useMemo(() => {
    return sceneTimings.findIndex(s => frame >= s.startFrame && frame < s.endFrame);
  }, [sceneTimings, frame]);
  
  const currentScene = currentSceneIndex >= 0 ? sceneTimings[currentSceneIndex] : null;
  
  // Phase 4: Context-based character visibility (extended for hook + intro)
  const shouldShowCharacter = useMemo(() => {
    if (!useCharacter || !currentScene) return false;
    // Show character in hook, intro, problem, solution, and cta scenes
    return ['hook', 'intro', 'problem', 'solution', 'cta'].includes(currentScene.type);
  }, [useCharacter, currentScene]);
  
  // Phase 4: Context-based character position
  const getContextBasedPosition = (sceneType: string): 'left' | 'right' | 'center' => {
    // Problem scenes: character on left (showing concern)
    // Solution/CTA: character on right (presenting)
    if (sceneType === 'problem') return 'left';
    return 'right';
  };
  
  // Map scene type to character action
  const getCharacterAction = (sceneType: string): 'pointing' | 'thinking' | 'celebrating' | 'explaining' | 'idle' => {
    switch (sceneType) {
      case 'hook': return 'pointing';
      case 'problem': return 'thinking';
      case 'solution': return 'celebrating';
      case 'feature': return 'explaining';
      case 'cta': return 'pointing';
      default: return 'idle';
    }
  };
  
  // Phase 1: Get DrawOnEffect type for scene
  const getDrawOnEffectType = (sceneType: string): 'highlight' | 'checkmark' | 'arrow' | 'circle' | 'underline' | null => {
    switch (sceneType) {
      case 'hook': return 'highlight';
      case 'problem': return 'circle';
      case 'solution': return 'checkmark';
      case 'cta': return 'arrow';
      default: return null;
    }
  };
  
  // Phase 5: Get emotion from scene
  const getEmotionFromScene = (sceneType: string): 'neutral' | 'happy' | 'thinking' | 'concerned' | 'excited' | 'surprised' => {
    switch (sceneType) {
      case 'hook': return 'excited';
      case 'problem': return 'concerned';
      case 'solution': return 'happy';
      case 'feature': return 'neutral';
      case 'cta': return 'excited';
      case 'proof': return 'happy';
      default: return 'neutral';
    }
  };
  
  // Calculate current time in seconds for lip-sync
  const currentTimeSeconds = frame / effectiveFps;
  
  // Phase 3: Get font family based on preference
  const effectiveFontFamily = FONT_MAP[preferredFont || 'inter'] || FONT_MAP.inter;
  
  // Fallback: single scene if no scenes provided
  if (scenes.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#0f172a' }}>
      {!diagToggles.silentRender && !diagToggles.r33_audioStripped && voiceoverUrl && (
          <Html5Audio src={voiceoverUrl} volume={masterVolume} pauseWhenBuffering />
        )}
        {!diagToggles.silentRender && !diagToggles.r33_audioStripped && backgroundMusicUrl && (
          <Html5Audio src={backgroundMusicUrl} volume={backgroundMusicVolume * masterVolume} pauseWhenBuffering />
        )}
        
        <AbsoluteFill style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            fontSize: 48,
            color: primaryColor,
            fontFamily: effectiveFontFamily,
            fontWeight: 700,
          }}>
            Universal Video Creator
          </div>
        </AbsoluteFill>
        
        {/* Phase 1: PrecisionSubtitleOverlay with karaoke */}
        {subtitles && subtitles.length > 0 && (
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
              fontSize: subtitleStyle?.fontSize || 48,
              textColor: subtitleStyle?.fontColor || '#FFFFFF',
              backgroundColor: subtitleStyle?.backgroundColor || 'rgba(0,0,0,0.75)',
              position: subtitleStyle?.position || 'bottom',
              highlightColor: primaryColor,
            }}
          />
        )}
      </AbsoluteFill>
    );
  }
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Voiceover audio - plays linearly (r41: skip in silentRender mode) */}
      {!diagToggles.silentRender && !diagToggles.r33_audioStripped && voiceoverUrl && (
        <Html5Audio src={voiceoverUrl} volume={masterVolume} startFrom={0} pauseWhenBuffering />
      )}
      
      {/* Phase 2: SceneAudioManager with dynamic ducking & crossfades (r41: skip in silentRender mode) */}
      {!diagToggles.silentRender && !diagToggles.r33_audioStripped && backgroundMusicUrl && backgroundMusicUrl.startsWith('http') && (
        <SceneAudioManager
          backgroundMusicUrl={backgroundMusicUrl}
          voiceoverUrl={voiceoverUrl}
          scenes={sceneTimings.map((scene, index) => {
            const sceneStartTime = sceneTimings.slice(0, index).reduce((acc, s) => acc + s.duration, 0);
            const sceneEndTime = sceneStartTime + scene.duration;
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
      
      {/* Render scenes as sequences */}
      {sceneTimings.map((scene, index) => {
        const transitionType = (scene.transition?.type === 'morph' || scene.transition?.type === 'wipe' || 
          scene.transition?.type === 'zoom' || scene.transition?.type === 'blur') 
          ? scene.transition.type as 'morph' | 'wipe' | 'zoom' | 'dissolve'
          : 'fade';
        
        // Phase 1: Get DrawOnEffect type for this scene
        const drawOnType = getDrawOnEffectType(scene.type);
        
        // Phase 1: Check if should show MorphTransition
        const showMorphTransition = ['solution', 'cta'].includes(scene.type);
        
        return (
          <Sequence
            key={scene.id || index}
            from={scene.startFrame}
            durationInFrames={scene.durationInFrames}
          >
            <SceneTransition
              frame={frame - scene.startFrame}
              durationInFrames={scene.durationInFrames}
              transitionType={transitionType}
              fps={effectiveFps}
              beatAligned={scene.beatAligned}
              bpm={beatSyncData?.bpm}
            >
              <AbsoluteFill>
                <SceneBackground
                  scene={(() => {
                    if (frame === scene.startFrame) console.error(`[FORENSIC] ENTER_SCENE idx=${index} type=${scene.type} profile=${rawDiag?.diagnosticProfile || '?'}`);
                    return scene;
                  })()}
                  frame={frame - scene.startFrame}
                  durationInFrames={scene.durationInFrames}
                  fps={effectiveFps}
                  style={style}
                  primaryColor={primaryColor}
                  disableSceneFx={diagToggles.disableSceneFx}
                />
                <TextOverlay
                  scene={(() => {
                    if (frame === scene.startFrame) console.error(`[FORENSIC] ENTER_TEXT_ANIM idx=${index} disableAnimatedText=${diagToggles.disableAnimatedText}`);
                    return scene;
                  })()}
                  frame={frame - scene.startFrame}
                  durationInFrames={scene.durationInFrames}
                  primaryColor={primaryColor}
                  fps={effectiveFps}
                  showTitle={showSceneTitles}
                  disableAnimatedText={diagToggles.disableAnimatedText}
                />
                
                {/* Phase 1: DrawOnEffect per scene type */}
                {drawOnType && (
                  <DrawOnEffect
                    type={drawOnType}
                    x={scene.type === 'cta' ? 70 : 50}
                    y={scene.type === 'problem' ? 40 : 60}
                    width={drawOnType === 'arrow' ? 120 : 200}
                    height={drawOnType === 'checkmark' ? 80 : 100}
                    color={scene.type === 'problem' ? '#EF4444' : primaryColor}
                    strokeWidth={4}
                    delay={20}
                    drawDuration={30}
                  />
                )}
                
                {/* Phase 1: MorphTransition for Solution/CTA */}
                {!diagToggles.disableMorphTransitions && showMorphTransition && (
                  <MorphTransition
                    type={scene.type === 'solution' ? 'sparkle' : 'confetti'}
                    color={primaryColor}
                  />
                )}
                
                {/* Phase 2: StatsOverlay */}
                {scene.statsOverlay && scene.statsOverlay.length > 0 && (
                  <StatsOverlay
                    stats={scene.statsOverlay}
                    frame={frame - scene.startFrame}
                    fps={effectiveFps}
                    primaryColor={primaryColor}
                  />
                )}
                
                {/* Phase 3: Smart Sound Effect (r41: skip in silentRender mode) */}
                {!diagToggles.silentRender && !diagToggles.r33_audioStripped && (
                  <SceneSoundEffect
                    scene={scene}
                    frame={frame - scene.startFrame}
                    fps={effectiveFps}
                    masterVolume={masterVolume}
                  />
                )}
              </AbsoluteFill>
            </SceneTransition>
          </Sequence>
        );
      })}
      
      {/* Phase 4 & 5: Context-based Animated Character with multiple types */}
      {shouldShowCharacter && currentScene && (
        <>
          {/* SVG Character (default) */}
          {characterType === 'svg' && (
            <AnimatedCharacter
              type="presenter"
              action={getCharacterAction(currentScene.type)}
              frame={frame - currentScene.startFrame}
              fps={effectiveFps}
              position={getContextBasedPosition(currentScene.type)}
              primaryColor={primaryColor}
              visible={true}
            />
          )}
          
          {/* Phase 5: Professional Lottie Character with lip-sync */}
          {!diagToggles.disableCharacter && characterType === 'lottie' && phonemeTimestamps && (
            <ProfessionalLottieCharacter
              action={getCharacterAction(currentScene.type)}
              position={getContextBasedPosition(currentScene.type)}
              sceneType={currentScene.type as 'hook' | 'problem' | 'solution' | 'feature' | 'proof' | 'cta'}
              visible={true}
              primaryColor={primaryColor}
              phonemeTimestamps={phonemeTimestamps as CharacterPhonemeTimestamp[]}
              sceneStartTimeSeconds={currentScene.startTime ?? (currentScene.startFrame / effectiveFps)}
              forceEmbeddedLottie={diagToggles.forceEmbeddedCharacterLottie}
            />
          )}
          
          {/* Phase 5: Rive Character with advanced lip-sync */}
          {characterType === 'rive' && phonemeTimestamps && (
            <RiveCharacter
              emotion={getEmotionFromScene(currentScene.type)}
              gesture={getCharacterAction(currentScene.type) === 'celebrating' ? 'celebrating' 
                : getCharacterAction(currentScene.type) === 'pointing' ? 'pointing'
                : getCharacterAction(currentScene.type) === 'thinking' ? 'idle'
                : 'explaining'}
              position={getContextBasedPosition(currentScene.type)}
              phonemeTimestamps={phonemeTimestamps as PhonemeTimestamp[]}
              sceneStartTimeSeconds={currentScene.startTime ?? (currentScene.startFrame / effectiveFps)}
              scale={0.9}
            />
          )}
        </>
      )}
      
      {/* Lottie Icons for current scene - context-based visibility */}
      {!diagToggles.disableLottieIcons && currentScene && ['solution', 'feature', 'proof'].includes(currentScene.type) && (() => {
        if (frame === 0) console.error(`[FORENSIC] ENTER_LOTTIE_ICONS disabled=${diagToggles.disableLottieIcons}`);
        return (
        <LottieIcons
          sceneType={currentScene.type as 'solution' | 'feature' | 'proof' | 'hook' | 'problem' | 'cta'}
          position={getContextBasedPosition(currentScene.type) === 'right' ? 'left' : 'right'}
          size={80}
          staggerDelay={10}
        />
        );
      })()}
      
      {/* Phase 1: PrecisionSubtitleOverlay with word-level karaoke */}
      {!diagToggles.disablePrecisionSubtitles && subtitles && Array.isArray(subtitles) && subtitles.length > 0 && (() => {
        if (frame === 0) console.error(`[FORENSIC] ENTER_SUBTITLE_OVERLAY count=${subtitles?.length || 0}`);
        return (
        <PrecisionSubtitleOverlay
          subtitles={subtitles.map(s => ({
            text: s?.text || '',
            startTime: s?.startTime || 0,
            endTime: s?.endTime || 0
          }))}
          phonemeTimestamps={Array.isArray(phonemeTimestamps) ? phonemeTimestamps.filter((p): p is { character: string; start_time: number; end_time: number } => 
            typeof p?.character === 'string' && typeof p?.start_time === 'number' && typeof p?.end_time === 'number'
          ) : undefined}
          config={{
            animationStyle: 'karaoke',
            fontSize: subtitleStyle?.fontSize || 48,
            textColor: subtitleStyle?.fontColor || '#FFFFFF',
            backgroundColor: subtitleStyle?.backgroundColor || 'rgba(0,0,0,0.75)',
            position: subtitleStyle?.position || 'bottom',
            highlightColor: primaryColor,
          }}
        />
        );
      })()}
      
      {/* Progress bar */}
      {showProgressBar && (
        <ProgressBar
          frame={frame}
          totalFrames={durationInFrames}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
        />
      )}
      
      {/* Watermark */}
      {showWatermark && <Watermark text={watermarkText} />}
    </AbsoluteFill>
  );
};

export default UniversalCreatorVideo;
