import React from 'react';
import { 
  AbsoluteFill, 
  Audio,
  Img, 
  Sequence, 
  useCurrentFrame, 
  useVideoConfig,
  interpolate,
  spring,
  getRemotionEnvironment,
} from 'remotion';
import { z } from 'zod';

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
  animation: z.enum(['fadeIn', 'slideUp', 'slideLeft', 'zoomIn', 'bounce', 'none', 'kenBurns', 'parallax', 'popIn', 'flyIn', 'morphIn']).optional().default('fadeIn'),
  textAnimation: z.enum(['typewriter', 'fadeWords', 'highlight', 'none', 'splitReveal', 'glowPulse', 'bounceIn', 'waveIn']).optional().default('fadeWords'),
  kenBurnsDirection: z.enum(['in', 'out', 'left', 'right', 'up', 'down']).optional().default('in'),
  parallaxLayers: z.number().optional().default(3),
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
  const progress = frame / durationInFrames;
  
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
  const progress = frame / durationInFrames;
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
  
  switch (animation) {
    case 'typewriter':
      const charsToShow = Math.floor(interpolate(frame, [0, durationInFrames * 0.7], [0, text.length], { extrapolateRight: 'clamp' }));
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
            fontFamily: 'Inter, Arial, sans-serif',
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

// 🎬 Spotlight/Focus Effect
const SpotlightEffect: React.FC<{
  frame: number;
  durationInFrames: number;
  primaryColor: string;
}> = ({ frame, durationInFrames, primaryColor }) => {
  const pulseIntensity = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.3, 0.6]
  );
  
  const spotlightX = interpolate(frame, [0, durationInFrames], [30, 70], {
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
            const particleY = interpolate(frame, [0, durationInFrames], [100, -20], { extrapolateRight: 'clamp' });
            const particleX = 20 + i * 15;
            const particleOpacity = interpolate(frame, [0, 20, durationInFrames - 20, durationInFrames], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
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
  animation: string;
  kenBurnsDirection: string;
  parallaxLayers: number;
  frame: number;
  durationInFrames: number;
  style: string;
  fps: number;
  sceneType?: string;
  primaryColor?: string;
}> = ({ imageUrl, animation, kenBurnsDirection, parallaxLayers, frame, durationInFrames, style, fps, sceneType = 'hook', primaryColor = '#F5C76A' }) => {
  // Entry animation (first 15 frames)
  const entryProgress = Math.min(frame / 15, 1);
  
  let transform = 'scale(1)';
  let opacity = 1;
  
  // Handle special animations
  if (animation === 'kenBurns' && imageUrl) {
    return (
      <>
        <KenBurnsImage
          imageUrl={imageUrl}
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
  
  if (animation === 'parallax' && imageUrl) {
    return (
      <>
        <ParallaxBackground
          imageUrl={imageUrl}
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
  if (animation === 'popIn' && imageUrl) {
    return (
      <PopInElement delay={0} frame={frame} fps={fps}>
        <AbsoluteFill>
          <Img
            src={imageUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <SceneTypeEffects sceneType={sceneType} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />
          <FloatingIcons sceneType={sceneType} frame={frame} primaryColor={primaryColor} />
        </AbsoluteFill>
      </PopInElement>
    );
  }
  
  // 🎬 NEW: Fly-In Animation
  if (animation === 'flyIn' && imageUrl) {
    const directions: Array<'left' | 'right' | 'top' | 'bottom'> = ['left', 'right', 'top', 'bottom'];
    const direction = directions[Math.floor(frame / 100) % 4];
    return (
      <FlyInElement direction="right" delay={0} frame={frame} fps={fps}>
        <AbsoluteFill>
          <Img
            src={imageUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <SceneTypeEffects sceneType={sceneType} frame={frame} durationInFrames={durationInFrames} primaryColor={primaryColor} />
          <FloatingIcons sceneType={sceneType} frame={frame} primaryColor={primaryColor} />
        </AbsoluteFill>
      </FlyInElement>
    );
  }
  
  // Standard animations
  const progress = frame / durationInFrames;
  
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
      {imageUrl ? (
        <Img
          src={imageUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform,
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: styleOverlays[style] || styleOverlays['flat-design'],
          }}
        />
      )}
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
  
  const opacity = interpolate(
    frame,
    [0, 15, durationInFrames - 15, durationInFrames],
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
            fontFamily: 'Inter, Arial, sans-serif',
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
          fontFamily: 'Inter, Arial, sans-serif',
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

// Progress bar component
const ProgressBar: React.FC<{
  progress: number;
  primaryColor: string;
}> = ({ progress, primaryColor }) => {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.2)',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress * 100}%`,
          backgroundColor: primaryColor,
          transition: 'width 0.1s linear',
        }}
      />
    </div>
  );
};

// Scene transition wrapper
const SceneTransition: React.FC<{
  children: React.ReactNode;
  frame: number;
  durationInFrames: number;
}> = ({ children, frame, durationInFrames }) => {
  // Fade out at end
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  return (
    <AbsoluteFill style={{ opacity: exitOpacity }}>
      {children}
    </AbsoluteFill>
  );
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
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  
  // Calculate total progress
  const totalProgress = frame / durationInFrames;
  
  // Render each scene as a Sequence
  let currentFrame = 0;
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Scene Sequences */}
      {scenes.map((scene, index) => {
        const sceneDurationFrames = Math.ceil(scene.durationSeconds * fps);
        const sceneStartFrame = currentFrame;
        currentFrame += sceneDurationFrames;
        
        return (
          <Sequence
            key={scene.id || index}
            from={sceneStartFrame}
            durationInFrames={sceneDurationFrames}
          >
            <SceneTransition
              frame={frame - sceneStartFrame}
              durationInFrames={sceneDurationFrames}
            >
              <SceneBackground
                imageUrl={scene.imageUrl}
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
              <SceneText
                title={scene.title}
                showTitle={showSceneTitles}
                sceneType={scene.type}
                textAnimation={scene.textAnimation || 'fadeWords'}
                frame={frame - sceneStartFrame}
                durationInFrames={sceneDurationFrames}
                primaryColor={primaryColor}
                fps={fps}
              />
            </SceneTransition>
          </Sequence>
        );
      })}
      
      {/* Subtitles overlay */}
      {subtitles.length > 0 && (
        <SubtitleOverlay
          subtitles={subtitles}
          frame={frame}
          fps={fps}
          config={subtitleConfig}
        />
      )}
      
      {/* Progress bar */}
      {showProgressBar && (
        <ProgressBar progress={totalProgress} primaryColor={primaryColor} />
      )}
      
      {/* Audio layers - controlled by masterVolume from Player */}
      {voiceoverUrl && (
        <Audio 
          src={voiceoverUrl} 
          volume={masterVolume * 1.0}
          pauseWhenBuffering
        />
      )}
      {backgroundMusicUrl && (
        <Audio 
          src={backgroundMusicUrl} 
          volume={masterVolume * backgroundMusicVolume}
          pauseWhenBuffering
        />
      )}
      
      {/* Sound effects */}
      {soundEffects.map((effect, index) => (
        <Sequence
          key={`sfx-${index}`}
          from={Math.floor(effect.startTime * fps)}
        >
          <Audio 
            src={effect.soundUrl} 
            volume={masterVolume * effect.volume}
            pauseWhenBuffering
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
