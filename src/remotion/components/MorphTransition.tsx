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
import { FALLBACK_ANIMATIONS } from '../data/lottie-library';

interface MorphTransitionProps {
  type: 'wipe' | 'morph' | 'zoom' | 'fade' | 'slide' | 'confetti' | 'sparkle' | 'radial' | 'blinds';
  transitionFrames?: number;
  position?: 'entry' | 'exit' | 'both';
  color?: string;
}

// Enhanced SVG-based transitions
const SVGTransitions: Record<string, React.FC<{ progress: number; primaryColor: string }>> = {
  wipe: ({ progress, primaryColor }) => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(90deg, 
          ${primaryColor}88 0%, 
          ${primaryColor}44 ${progress * 100 - 5}%, 
          transparent ${progress * 100}%)`,
        pointerEvents: 'none',
        opacity: Math.sin(progress * Math.PI),
      }}
    />
  ),
  
  morph: ({ progress, primaryColor }) => {
    const blobScale = 1 + Math.sin(progress * Math.PI) * 0.5;
    const blobOpacity = Math.sin(progress * Math.PI) * 0.6;
    
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
            <stop offset="0%" stopColor={primaryColor} stopOpacity={0.5} />
            <stop offset="70%" stopColor={primaryColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
          </radialGradient>
          <filter id="morphBlur">
            <feGaussianBlur stdDeviation="40" />
          </filter>
        </defs>
        <ellipse
          cx="960"
          cy="540"
          rx={600 * blobScale}
          ry={500 * blobScale}
          fill="url(#morphGradient)"
          filter="url(#morphBlur)"
          opacity={blobOpacity}
        />
      </svg>
    );
  },
  
  zoom: ({ progress }) => {
    const scale = 1 + progress * 0.15;
    const vignette = Math.sin(progress * Math.PI) * 0.3;
    
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${scale})`,
          boxShadow: `inset 0 0 ${200 * vignette}px ${100 * vignette}px rgba(0,0,0,${vignette})`,
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
        opacity: Math.sin(progress * Math.PI) * 0.4,
        pointerEvents: 'none',
      }}
    />
  ),
  
  slide: ({ progress, primaryColor }) => {
    const translateX = interpolate(progress, [0, 0.5, 1], [-100, 0, 100]);
    
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(90deg, transparent 0%, ${primaryColor}30 50%, transparent 100%)`,
          transform: `translateX(${translateX}%)`,
          pointerEvents: 'none',
          opacity: Math.sin(progress * Math.PI),
        }}
      />
    );
  },
  
  radial: ({ progress, primaryColor }) => {
    const radius = progress * 150;
    
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 50%, 
            transparent ${radius - 10}%, 
            ${primaryColor}40 ${radius}%, 
            ${primaryColor}20 ${radius + 10}%, 
            transparent ${radius + 20}%)`,
          pointerEvents: 'none',
          opacity: Math.sin(progress * Math.PI),
        }}
      />
    );
  },
  
  blinds: ({ progress, primaryColor }) => {
    const blinds = Array.from({ length: 8 }, (_, i) => ({
      delay: i * 0.05,
      y: i * 12.5,
    }));
    
    return (
      <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
        {blinds.map((blind, i) => {
          const blindProgress = Math.max(0, Math.min(1, (progress - blind.delay) * 2));
          const height = blindProgress * 12.5;
          
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: `${blind.y}%`,
                left: 0,
                right: 0,
                height: `${height}%`,
                background: `linear-gradient(180deg, ${primaryColor}40 0%, transparent 100%)`,
                opacity: Math.sin(blindProgress * Math.PI),
              }}
            />
          );
        })}
      </AbsoluteFill>
    );
  },
  
  confetti: ({ progress, primaryColor }) => {
    const particles = Array.from({ length: 25 }, (_, i) => ({
      x: 10 + Math.random() * 80,
      startY: -10,
      endY: 110,
      size: 6 + Math.random() * 14,
      rotation: Math.random() * 720,
      speed: 0.8 + Math.random() * 0.4,
      color: i % 4 === 0 ? primaryColor 
        : i % 4 === 1 ? '#10B981' 
        : i % 4 === 2 ? '#8B5CF6' 
        : '#EC4899',
      shape: i % 3,
    }));
    
    return (
      <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
        {particles.map((p, i) => {
          const y = p.startY + (p.endY - p.startY) * progress * p.speed;
          const wobbleX = Math.sin(progress * 10 + i) * 20;
          
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${p.x + wobbleX * 0.1}%`,
                top: `${y}%`,
                width: p.size,
                height: p.shape === 0 ? p.size : p.size * 0.6,
                backgroundColor: p.color,
                borderRadius: p.shape === 0 ? '50%' : p.shape === 1 ? '2px' : '0',
                transform: `rotate(${p.rotation * progress}deg)`,
                opacity: Math.sin(progress * Math.PI) * 0.9,
              }}
            />
          );
        })}
      </AbsoluteFill>
    );
  },
  
  sparkle: ({ progress, primaryColor }) => {
    const sparkles = Array.from({ length: 15 }, (_, i) => ({
      x: 15 + (i % 5) * 18 + Math.random() * 8,
      y: 10 + Math.floor(i / 5) * 30 + Math.random() * 15,
      delay: i * 0.04,
      size: 3 + Math.random() * 6,
    }));
    
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        {sparkles.map((s, i) => {
          const sparkleProgress = Math.max(0, Math.min(1, (progress - s.delay) * 2.5));
          const scale = Math.sin(sparkleProgress * Math.PI);
          const rotation = sparkleProgress * 180;
          
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: s.size,
                height: s.size,
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                opacity: scale,
              }}
            >
              {/* 4-point star shape */}
              <svg width={s.size * 2} height={s.size * 2} viewBox="0 0 20 20">
                <polygon
                  points="10,0 12,8 20,10 12,12 10,20 8,12 0,10 8,8"
                  fill={primaryColor}
                  style={{
                    filter: `drop-shadow(0 0 ${s.size}px ${primaryColor})`,
                  }}
                />
              </svg>
            </div>
          );
        })}
      </AbsoluteFill>
    );
  },
};

export const MorphTransition: React.FC<MorphTransitionProps> = ({
  type = 'morph',
  transitionFrames = 25,
  position = 'both',
  color = '#F5C76A',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender('Loading transition'));
  const [useFallback, setUseFallback] = useState(false);

  // Get Lottie URL for particle effects
  const getLottieUrl = (transitionType: string): string | null => {
    if (transitionType === 'confetti') return FALLBACK_ANIMATIONS.icons.confetti;
    if (transitionType === 'sparkle') return FALLBACK_ANIMATIONS.transitions.sparkle;
    return null;
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
        console.warn('Transition Lottie failed, using SVG:', err);
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

  if (progress <= 0) return null;

  // Use Lottie animation if available for confetti/sparkle
  if (animationData && !useFallback && (type === 'confetti' || type === 'sparkle')) {
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
            style={{ width: '100%', height: '100%' }}
            loop
            playbackRate={1.2}
          />
        </div>
      </AbsoluteFill>
    );
  }

  // Use enhanced SVG transitions
  const SVGTransition = SVGTransitions[type] || SVGTransitions.morph;
  
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 1000 }}>
      <SVGTransition progress={progress} primaryColor={color} />
    </AbsoluteFill>
  );
};

export default MorphTransition;
