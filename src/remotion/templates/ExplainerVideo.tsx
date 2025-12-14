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
  Easing
} from 'remotion';
import { z } from 'zod';

// Schema definitions
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
  animation: z.enum(['fadeIn', 'slideUp', 'slideLeft', 'zoomIn', 'bounce', 'none']).optional().default('fadeIn'),
  textAnimation: z.enum(['typewriter', 'fadeWords', 'highlight', 'none']).optional().default('fadeWords'),
});

export const ExplainerVideoSchema = z.object({
  scenes: z.array(ExplainerSceneSchema),
  voiceoverUrl: z.string().optional(),
  backgroundMusicUrl: z.string().optional(),
  backgroundMusicVolume: z.number().optional(),
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

// Animated background layer for each scene
const SceneBackground: React.FC<{
  imageUrl?: string;
  animation: string;
  frame: number;
  durationInFrames: number;
  style: string;
}> = ({ imageUrl, animation, frame, durationInFrames, style }) => {
  const { fps } = useVideoConfig();
  
  // Ken Burns effect calculations
  const progress = frame / durationInFrames;
  
  let transform = 'scale(1)';
  let opacity = 1;
  
  // Entry animation (first 15 frames)
  const entryProgress = Math.min(frame / 15, 1);
  
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
    </AbsoluteFill>
  );
};

// Animated text overlay
const SceneText: React.FC<{
  title: string;
  showTitle: boolean;
  sceneType: string;
  frame: number;
  durationInFrames: number;
  primaryColor: string;
}> = ({ title, showTitle, sceneType, frame, durationInFrames, primaryColor }) => {
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
        {title}
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
            key={scene.id}
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
                frame={frame - sceneStartFrame}
                durationInFrames={sceneDurationFrames}
                style={style}
              />
              <SceneText
                title={scene.title}
                showTitle={showSceneTitles}
                sceneType={scene.type}
                frame={frame - sceneStartFrame}
                durationInFrames={sceneDurationFrames}
                primaryColor={primaryColor}
              />
            </SceneTransition>
          </Sequence>
        );
      })}
      
      {/* Progress bar */}
      {showProgressBar && (
        <ProgressBar progress={totalProgress} primaryColor={primaryColor} />
      )}
      
      {/* Audio layers */}
      {voiceoverUrl && (
        <Audio src={voiceoverUrl} volume={1.0} />
      )}
      {backgroundMusicUrl && (
        <Audio src={backgroundMusicUrl} volume={backgroundMusicVolume} />
      )}
    </AbsoluteFill>
  );
};
