import React, { useEffect, useState, useMemo } from 'react';
import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { 
  useCurrentFrame, 
  useVideoConfig, 
  delayRender,
  continueRender,
} from 'remotion';
import { safeInterpolate, safeDuration, safeSpring as spring } from '../utils/safeInterpolate';
import { FALLBACK_ANIMATIONS } from '../data/lottie-library';
import { isValidLottieData, normalizeLottieData } from '../utils/premiumLottieLoader';

interface LottieCharacterProps {
  sceneType: 'hook' | 'problem' | 'solution' | 'feature' | 'proof' | 'cta';
  action?: 'talking' | 'explaining' | 'pointing' | 'waving' | 'thinking' | 'celebrating' | 'nodding';
  position: 'left' | 'right' | 'center';
  primaryColor?: string;
  size?: number;
  visible?: boolean;
  lipSync?: boolean;
}

// Map scene types to character actions with better defaults
const SCENE_ACTION_MAP: Record<string, keyof typeof FALLBACK_ANIMATIONS.character> = {
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
  size = 280,
  visible = true,
  lipSync = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender('Loading Lottie character'));
  const [error, setError] = useState(false);

  // Determine the action based on scene type if not explicitly provided
  const characterAction = action || SCENE_ACTION_MAP[sceneType] || 'explaining';
  
  // Get validated animation URL from fallbacks
  const animationUrl = useMemo(() => {
    return FALLBACK_ANIMATIONS.character[characterAction as keyof typeof FALLBACK_ANIMATIONS.character]
      || FALLBACK_ANIMATIONS.character.presenter;
  }, [characterAction]);

  useEffect(() => {
    let cancelled = false;

    const loadAnimation = async () => {
      try {
        const response = await fetch(animationUrl);
        if (!response.ok) throw new Error('Failed to fetch animation');
        const data = await response.json();
        
        if (!cancelled) {
          if (isValidLottieData(data)) {
            setAnimationData(normalizeLottieData(data));
          } else {
            console.warn('LottieCharacter: invalid Lottie data, using SVG fallback');
            setError(true);
          }
          continueRender(handle);
        }
      } catch (err) {
        console.warn('Lottie character load failed, using SVG fallback:', err);
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

  // Enhanced entry animation with spring physics
  const entryProgress = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  });

  // Subtle breathing animation
  const breathe = Math.sin(frame * 0.06) * 4;
  
  // Subtle head bob for talking effect
  const headBob = lipSync ? Math.sin(frame * 0.15) * 2 : 0;
  
  // Arm gesture animation
  const armGesture = Math.sin(frame * 0.04) * 3;
  
  // ✅ Validate durationInFrames for exit animation
  const safeDur = safeDuration(durationInFrames, 30);
  const exitStart = Math.min(Math.max(1, safeDur - 25), safeDur - 1);
  
  // Exit animation
  const exitOpacity = safeInterpolate(
    frame,
    [exitStart, safeDur],
    [1, 0]
  );

  // Position styles with smooth positioning
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: '5%', right: 'auto' },
    right: { right: '5%', left: 'auto' },
    center: { left: '50%', marginLeft: -size / 2 },
  };

  // Scale entry effect
  const scale = safeInterpolate(
    Math.max(0, entryProgress),
    [0, 1],
    [0.3, 1]
  );

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '8%',
    ...positionStyles[position],
    width: size,
    height: size * 1.3,
    transform: `
      translateY(${breathe + headBob}px) 
      scale(${scale})
    `,
    opacity: Math.max(0, entryProgress) * exitOpacity,
    pointerEvents: 'none',
    zIndex: 100,
    filter: 'drop-shadow(0 15px 40px rgba(0,0,0,0.4))',
  };

  // If Lottie loaded successfully AND valid, render it
  if (animationData && !error && isValidLottieData(animationData)) {
    return (
      <div style={containerStyle}>
        <Lottie
          animationData={animationData}
          style={{
            width: '100%',
            height: '100%',
          }}
          loop
          playbackRate={0.8}
        />
      </div>
    );
  }

  // Enhanced SVG fallback character
  return (
    <div style={containerStyle}>
      <svg 
        width={size} 
        height={size * 1.3} 
        viewBox="0 0 200 260" 
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="shirtGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={`${primaryColor}99`} />
          </linearGradient>
          <linearGradient id="skinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE4C4" />
            <stop offset="100%" stopColor="#FFDAB9" />
          </linearGradient>
          <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.2"/>
          </filter>
        </defs>
        
        {/* Head with subtle movement */}
        <g transform={`translate(0, ${headBob})`}>
          {/* Head shape */}
          <ellipse cx="100" cy="55" rx="38" ry="42" fill="url(#skinGradient)" filter="url(#softShadow)" />
          
          {/* Hair */}
          <path d="M 62 50 Q 70 20 100 15 Q 130 20 138 50 Q 135 35 100 32 Q 65 35 62 50" fill="#3D2314" />
          
          {/* Eyebrows */}
          <path d="M 75 40 Q 82 37 90 40" stroke="#3D2314" strokeWidth="2" fill="none" />
          <path d="M 110 40 Q 118 37 125 40" stroke="#3D2314" strokeWidth="2" fill="none" />
          
          {/* Eyes with blink animation */}
          <g opacity={Math.abs(Math.sin(frame * 0.02)) > 0.95 ? 0.2 : 1}>
            <ellipse cx="82" cy="50" rx="6" ry="4" fill="#2D1B0E" />
            <ellipse cx="118" cy="50" rx="6" ry="4" fill="#2D1B0E" />
            <circle cx="84" cy="49" r="1.5" fill="white" />
            <circle cx="120" cy="49" r="1.5" fill="white" />
          </g>
          
          {/* Nose */}
          <path d="M 100 55 Q 95 62 100 68 Q 105 62 100 55" fill="#E8C4A8" />
          
          {/* Animated smile */}
          <path 
            d={`M 85 75 Q 100 ${85 + Math.sin(frame * 0.08) * 3} 115 75`} 
            fill="none" 
            stroke="#C0392B" 
            strokeWidth="2.5" 
            strokeLinecap="round"
          />
        </g>
        
        {/* Neck */}
        <rect x="90" y="95" width="20" height="15" fill="url(#skinGradient)" />
        
        {/* Body with shirt */}
        <path 
          d="M 55 110 Q 60 105 100 102 Q 140 105 145 110 L 150 180 L 50 180 Z" 
          fill="url(#shirtGradient)" 
          filter="url(#softShadow)"
        />
        
        {/* Collar */}
        <path d="M 82 105 L 100 120 L 118 105" fill="white" stroke="#E5E5E5" strokeWidth="1" />
        
        {/* Tie */}
        <path d="M 100 120 L 94 135 L 100 170 L 106 135 Z" fill="#1E3A5F" />
        
        {/* Left arm with gesture animation */}
        <g transform={`rotate(${armGesture}, 55, 115)`}>
          <path 
            d="M 50 115 Q 25 140 30 170" 
            stroke="url(#shirtGradient)" 
            strokeWidth="22" 
            fill="none" 
            strokeLinecap="round" 
          />
          <circle cx="30" cy="175" r="14" fill="url(#skinGradient)" />
        </g>
        
        {/* Right arm - waving/pointing based on action */}
        <g transform={`rotate(${characterAction === 'waving' ? -15 + Math.sin(frame * 0.1) * 10 : -5 + armGesture}, 145, 115)`}>
          <path 
            d={characterAction === 'waving' || characterAction === 'pointing'
              ? "M 150 115 Q 175 90 180 60" 
              : "M 150 115 Q 175 140 170 170"
            }
            stroke="url(#shirtGradient)" 
            strokeWidth="22" 
            fill="none" 
            strokeLinecap="round" 
          />
          <circle 
            cx={characterAction === 'waving' || characterAction === 'pointing' ? 182 : 172} 
            cy={characterAction === 'waving' || characterAction === 'pointing' ? 55 : 175} 
            r="14" 
            fill="url(#skinGradient)" 
          />
          
          {/* Pointing finger for pointing action */}
          {characterAction === 'pointing' && (
            <path 
              d="M 182 55 L 195 45" 
              stroke="url(#skinGradient)" 
              strokeWidth="6" 
              strokeLinecap="round"
            />
          )}
        </g>
        
        {/* Legs */}
        <rect x="68" y="180" width="28" height="55" rx="6" fill="#1E3A5F" />
        <rect x="104" y="180" width="28" height="55" rx="6" fill="#1E3A5F" />
        
        {/* Shoes */}
        <ellipse cx="82" cy="240" rx="20" ry="10" fill="#1a1a1a" />
        <ellipse cx="118" cy="240" rx="20" ry="10" fill="#1a1a1a" />
      </svg>
    </div>
  );
};

export default LottieCharacter;
