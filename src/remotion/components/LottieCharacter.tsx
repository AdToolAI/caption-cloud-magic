import React, { useEffect, useState } from 'react';
import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { 
  useCurrentFrame, 
  useVideoConfig, 
  interpolate, 
  spring,
  delayRender,
  continueRender,
} from 'remotion';
import { FALLBACK_ANIMATIONS, getCharacterAnimation } from '@/data/lottie-library';

interface LottieCharacterProps {
  sceneType: 'hook' | 'problem' | 'solution' | 'feature' | 'proof' | 'cta';
  action?: 'talking' | 'explaining' | 'pointing' | 'waving' | 'thinking' | 'celebrating' | 'nodding';
  position: 'left' | 'right' | 'center';
  primaryColor?: string;
  size?: number;
  visible?: boolean;
}

// Map scene types to character actions
const SCENE_ACTION_MAP: Record<string, string> = {
  hook: 'waving',
  problem: 'thinking',
  solution: 'celebrating',
  feature: 'explaining',
  proof: 'pointing',
  cta: 'pointing',
};

export const LottieCharacter: React.FC<LottieCharacterProps> = ({
  sceneType,
  action,
  position,
  primaryColor = '#F5C76A',
  size = 300,
  visible = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender('Loading Lottie character'));
  const [error, setError] = useState(false);

  // Determine the action based on scene type if not explicitly provided
  const characterAction = action || SCENE_ACTION_MAP[sceneType] || 'explaining';
  
  // Get animation URL
  const animationUrl = FALLBACK_ANIMATIONS.character[characterAction as keyof typeof FALLBACK_ANIMATIONS.character]
    || FALLBACK_ANIMATIONS.character.presenter;

  useEffect(() => {
    let cancelled = false;

    const loadAnimation = async () => {
      try {
        const response = await fetch(animationUrl);
        if (!response.ok) throw new Error('Failed to fetch animation');
        const data = await response.json();
        
        if (!cancelled) {
          setAnimationData(data);
          continueRender(handle);
        }
      } catch (err) {
        console.error('Failed to load Lottie character:', err);
        if (!cancelled) {
          setError(true);
          continueRender(handle);
        }
      }
    };

    loadAnimation();

    return () => {
      cancelled = true;
    };
  }, [animationUrl, handle]);

  if (!visible) return null;

  // Entry animation
  const entryProgress = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80 },
  });

  // Subtle breathing/bob animation
  const breathe = Math.sin(frame * 0.08) * 5;
  
  // Exit animation (fade out in last 20 frames)
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: '3%', right: 'auto' },
    right: { right: '3%', left: 'auto' },
    center: { left: '50%', transform: 'translateX(-50%)' },
  };

  // If error or no animation data, render SVG fallback
  if (error || !animationData) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: '5%',
          ...positionStyles[position],
          transform: `
            translateY(${breathe}px) 
            scale(${0.3 + 0.7 * Math.max(0, entryProgress)})
          `,
          opacity: Math.max(0, entryProgress) * exitOpacity,
          pointerEvents: 'none',
          zIndex: 100,
        }}
      >
        {/* Fallback SVG character */}
        <svg width={size} height={size * 1.2} viewBox="0 0 200 240" style={{ filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.3))' }}>
          <defs>
            <linearGradient id="shirtGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={primaryColor} />
              <stop offset="100%" stopColor={`${primaryColor}88`} />
            </linearGradient>
          </defs>
          
          {/* Head */}
          <circle cx="100" cy="50" r="35" fill="#FFDAB9" />
          
          {/* Hair */}
          <path d="M 65 45 Q 75 25 100 20 Q 125 25 135 45" fill="#2D1B0E" />
          
          {/* Eyes */}
          <ellipse cx="85" cy="45" rx="5" ry="3" fill="#2D1B0E" />
          <ellipse cx="115" cy="45" rx="5" ry="3" fill="#2D1B0E" />
          
          {/* Smile */}
          <path d="M 88 62 Q 100 72 112 62" fill="none" stroke="#C0392B" strokeWidth="2" />
          
          {/* Body */}
          <path d="M 60 85 L 65 80 L 135 80 L 140 85 L 145 160 L 55 160 Z" fill="url(#shirtGradient)" />
          
          {/* Collar */}
          <path d="M 85 80 L 100 95 L 115 80" fill="white" />
          
          {/* Arms */}
          <path d="M 55 90 Q 30 120 35 150" stroke="url(#shirtGradient)" strokeWidth="18" fill="none" strokeLinecap="round" />
          <path d="M 145 90 Q 170 100 175 70" stroke="url(#shirtGradient)" strokeWidth="18" fill="none" strokeLinecap="round" />
          
          {/* Hands */}
          <circle cx="35" cy="155" r="12" fill="#FFDAB9" />
          <circle cx="178" cy="65" r="12" fill="#FFDAB9" />
          
          {/* Legs */}
          <rect x="70" y="160" width="25" height="60" rx="5" fill="#1E3A5F" />
          <rect x="105" y="160" width="25" height="60" rx="5" fill="#1E3A5F" />
          
          {/* Shoes */}
          <ellipse cx="82" cy="225" rx="18" ry="8" fill="#1a1a1a" />
          <ellipse cx="118" cy="225" rx="18" ry="8" fill="#1a1a1a" />
        </svg>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '5%',
        ...positionStyles[position],
        width: size,
        height: size * 1.2,
        transform: `
          translateY(${breathe}px) 
          scale(${0.3 + 0.7 * Math.max(0, entryProgress)})
        `,
        opacity: Math.max(0, entryProgress) * exitOpacity,
        pointerEvents: 'none',
        zIndex: 100,
        filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.3))',
      }}
    >
      <Lottie
        animationData={animationData}
        style={{
          width: '100%',
          height: '100%',
        }}
        loop
        playbackRate={1}
      />
    </div>
  );
};

export default LottieCharacter;
