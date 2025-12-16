import React, { useEffect, useState } from 'react';
import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { 
  useCurrentFrame, 
  useVideoConfig, 
  interpolate,
  AbsoluteFill,
  delayRender,
  continueRender,
} from 'remotion';
import { FALLBACK_ANIMATIONS } from '@/data/lottie-library';

interface MorphTransitionProps {
  type: 'wipe' | 'morph' | 'zoom' | 'fade' | 'slide' | 'confetti' | 'sparkle';
  transitionFrames?: number;
  position?: 'entry' | 'exit' | 'both';
}

// SVG-based transitions as fallback
const SVGTransitions: Record<string, React.FC<{ progress: number; primaryColor: string }>> = {
  wipe: ({ progress, primaryColor }) => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(90deg, ${primaryColor} ${progress * 100}%, transparent ${progress * 100}%)`,
        pointerEvents: 'none',
        mixBlendMode: 'overlay',
        opacity: progress < 0.5 ? progress * 2 : (1 - progress) * 2,
      }}
    />
  ),
  
  morph: ({ progress, primaryColor }) => {
    const blobScale = 1 + Math.sin(progress * Math.PI) * 0.3;
    const blobOpacity = Math.sin(progress * Math.PI);
    
    return (
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
        viewBox="0 0 1920 1080"
        preserveAspectRatio="none"
      >
        <defs>
          <radialGradient id="morphGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={primaryColor} stopOpacity={0.4} />
            <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
          </radialGradient>
        </defs>
        <ellipse
          cx="960"
          cy="540"
          rx={500 * blobScale}
          ry={400 * blobScale}
          fill="url(#morphGradient)"
          opacity={blobOpacity}
        />
      </svg>
    );
  },
  
  zoom: ({ progress, primaryColor }) => {
    const scale = 1 + progress * 0.2;
    const blur = progress < 0.5 ? progress * 4 : (1 - progress) * 4;
    
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${scale})`,
          filter: blur > 0 ? `blur(${blur}px)` : 'none',
          pointerEvents: 'none',
        }}
      />
    );
  },
  
  fade: ({ progress }) => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#000',
        opacity: progress < 0.5 ? progress : 1 - progress,
        pointerEvents: 'none',
      }}
    />
  ),
  
  slide: ({ progress, primaryColor }) => {
    const translateX = interpolate(progress, [0, 1], [-100, 0]);
    
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(90deg, ${primaryColor}40 0%, transparent 100%)`,
          transform: `translateX(${translateX}%)`,
          pointerEvents: 'none',
          opacity: Math.sin(progress * Math.PI),
        }}
      />
    );
  },
  
  confetti: ({ progress, primaryColor }) => {
    const particles = Array.from({ length: 20 }, (_, i) => ({
      x: Math.random() * 100,
      y: 100 - progress * 150 + Math.random() * 50,
      size: 8 + Math.random() * 12,
      rotation: progress * 360 + i * 30,
      color: i % 3 === 0 ? primaryColor : i % 3 === 1 ? '#10B981' : '#8B5CF6',
    }));
    
    return (
      <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
        {particles.map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: i % 2 === 0 ? '50%' : '2px',
              transform: `rotate(${p.rotation}deg)`,
              opacity: Math.sin(progress * Math.PI) * 0.8,
            }}
          />
        ))}
      </AbsoluteFill>
    );
  },
  
  sparkle: ({ progress, primaryColor }) => {
    const sparkles = Array.from({ length: 12 }, (_, i) => ({
      x: 30 + (i % 4) * 15 + Math.random() * 10,
      y: 20 + Math.floor(i / 4) * 25 + Math.random() * 10,
      delay: i * 0.05,
      size: 4 + Math.random() * 8,
    }));
    
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        {sparkles.map((s, i) => {
          const sparkleProgress = Math.max(0, Math.min(1, (progress - s.delay) * 2));
          const scale = Math.sin(sparkleProgress * Math.PI);
          
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: s.size,
                height: s.size,
                background: primaryColor,
                borderRadius: '50%',
                transform: `scale(${scale})`,
                boxShadow: `0 0 ${s.size * 2}px ${primaryColor}`,
                opacity: scale,
              }}
            />
          );
        })}
      </AbsoluteFill>
    );
  },
};

export const MorphTransition: React.FC<MorphTransitionProps> = ({
  type = 'morph',
  transitionFrames = 20,
  position = 'both',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender('Loading transition'));
  const [useFallback, setUseFallback] = useState(false);
  
  const primaryColor = '#F5C76A';

  // Get Lottie URL for transition type
  const getLottieUrl = (transitionType: string): string | null => {
    switch (transitionType) {
      case 'confetti':
        return FALLBACK_ANIMATIONS.icons.confetti;
      case 'sparkle':
        return FALLBACK_ANIMATIONS.transitions.sparkle;
      default:
        return null;
    }
  };

  const lottieUrl = getLottieUrl(type);

  useEffect(() => {
    let cancelled = false;

    const loadAnimation = async () => {
      if (!lottieUrl) {
        setUseFallback(true);
        continueRender(handle);
        return;
      }

      try {
        const response = await fetch(lottieUrl);
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        
        if (!cancelled) {
          setAnimationData(data);
          continueRender(handle);
        }
      } catch (err) {
        console.warn('Failed to load Lottie transition, using fallback:', err);
        if (!cancelled) {
          setUseFallback(true);
          continueRender(handle);
        }
      }
    };

    loadAnimation();

    return () => {
      cancelled = true;
    };
  }, [lottieUrl, handle]);

  // Calculate transition progress
  let progress = 0;
  
  if (position === 'entry' || position === 'both') {
    const entryProgress = interpolate(
      frame,
      [0, transitionFrames],
      [0, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
    progress = entryProgress;
  }
  
  if (position === 'exit' || position === 'both') {
    const exitProgress = interpolate(
      frame,
      [durationInFrames - transitionFrames, durationInFrames],
      [0, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
    
    if (frame > durationInFrames - transitionFrames) {
      progress = exitProgress;
    }
  }

  // Render nothing if progress is 0
  if (progress <= 0) return null;

  // Use Lottie animation if available
  if (animationData && !useFallback) {
    return (
      <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 1000 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: Math.sin(progress * Math.PI),
          }}
        >
          <Lottie
            animationData={animationData}
            style={{
              width: '100%',
              height: '100%',
            }}
            loop
            playbackRate={1.5}
          />
        </div>
      </AbsoluteFill>
    );
  }

  // Use SVG fallback
  const SVGTransition = SVGTransitions[type] || SVGTransitions.morph;
  
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 1000 }}>
      <SVGTransition progress={progress} primaryColor={primaryColor} />
    </AbsoluteFill>
  );
};

export default MorphTransition;
