import React, { useEffect, useState, useMemo } from 'react';
import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { 
  useCurrentFrame, 
  useVideoConfig, 
  interpolate, 
  spring,
  delayRender,
  continueRender,
  staticFile,
} from 'remotion';
import { getCurrentViseme, getVisemeIntensity, type Viseme } from '@/utils/phonemeMapping';

// Phoneme timestamp interface
export interface PhonemeTimestamp {
  character: string;
  start_time: number;
  end_time: number;
}

// Component props
export interface ProfessionalLottieCharacterProps {
  action: 'idle' | 'pointing' | 'thinking' | 'celebrating' | 'explaining' | 'waving' | 'talking';
  position: 'left' | 'right' | 'center';
  sceneType: 'hook' | 'problem' | 'solution' | 'feature' | 'proof' | 'cta';
  primaryColor?: string;
  skinTone?: string;
  shirtColor?: string;
  scale?: number;
  visible?: boolean;
  phonemeTimestamps?: PhonemeTimestamp[];
  playbackRate?: number;
}

// Viseme to mouth shape index mapping for Lottie mouth animation
const VISEME_TO_MOUTH_INDEX: Record<Viseme, number> = {
  'neutral': 0,
  'wide': 1,      // A, I
  'medium': 2,    // E
  'round': 3,     // O
  'small_round': 4, // U
  'closed': 5,    // M, B, P
  'teeth_lip': 6, // F, V, W
  'teeth': 7,     // T, D, S, Z
  'tongue_up': 8, // L, N
  'back': 9,      // R
  'back_open': 10, // K, G
};

// Reliable Lottie URLs (tested and working CDN links)
const LOTTIE_URLS: Record<string, string> = {
  // Character animations from LottieFiles CDN
  idle: 'https://assets1.lottiefiles.com/packages/lf20_v92spkya.json',
  waving: 'https://assets2.lottiefiles.com/packages/lf20_gq4ni7gw.json',
  thinking: 'https://assets5.lottiefiles.com/packages/lf20_xyadoh9h.json',
  celebrating: 'https://assets3.lottiefiles.com/packages/lf20_aKAfIn.json',
  explaining: 'https://assets7.lottiefiles.com/packages/lf20_v1yudlrx.json',
  pointing: 'https://assets9.lottiefiles.com/packages/lf20_yvbfj8j4.json',
  talking: 'https://assets6.lottiefiles.com/packages/lf20_uk3jnmkq.json',
};

// Scene type to default action mapping
const SCENE_TYPE_ACTIONS: Record<string, string> = {
  hook: 'waving',
  problem: 'thinking',
  solution: 'celebrating',
  feature: 'explaining',
  proof: 'pointing',
  cta: 'pointing',
};

export const ProfessionalLottieCharacter: React.FC<ProfessionalLottieCharacterProps> = ({
  action,
  position,
  sceneType,
  primaryColor = '#F5C76A',
  skinTone = '#FFDAB9',
  shirtColor,
  scale = 1,
  visible = true,
  phonemeTimestamps,
  playbackRate = 0.8,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender('Loading Professional Lottie character'));
  const [loadError, setLoadError] = useState(false);

  // Get the effective action - use scene type default if action is idle
  const effectiveAction = action === 'idle' ? (SCENE_TYPE_ACTIONS[sceneType] || 'explaining') : action;
  
  // Get animation URL for the action
  const animationUrl = useMemo(() => {
    return LOTTIE_URLS[effectiveAction] || LOTTIE_URLS.explaining;
  }, [effectiveAction]);

  // Effective shirt color
  const effectiveShirtColor = shirtColor || primaryColor;

  // Load Lottie animation
  useEffect(() => {
    let cancelled = false;

    const loadAnimation = async () => {
      try {
        const response = await fetch(animationUrl);
        if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
        const data = await response.json();
        
        if (!cancelled) {
          setAnimationData(data);
          setLoadError(false);
          continueRender(handle);
        }
      } catch (err) {
        console.warn('Professional Lottie character load failed, using SVG fallback:', err);
        if (!cancelled) {
          setLoadError(true);
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

  // Calculate current time in seconds
  const currentTimeSeconds = frame / fps;

  // Get current lip-sync viseme if phoneme timestamps provided
  const currentViseme = phonemeTimestamps ? getCurrentViseme(phonemeTimestamps, currentTimeSeconds) : 'neutral';
  const visemeIntensity = phonemeTimestamps ? getVisemeIntensity(phonemeTimestamps, currentTimeSeconds) : 0;
  const mouthShapeIndex = VISEME_TO_MOUTH_INDEX[currentViseme] || 0;

  // Enhanced entry animation with spring physics
  const entryProgress = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  });

  // Exit animation
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 25, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Subtle breathing animation
  const breathe = Math.sin(frame * 0.06) * 4;
  
  // Head bob for talking/explaining
  const headBob = (effectiveAction === 'talking' || effectiveAction === 'explaining') 
    ? Math.sin(frame * 0.15) * 3 + (visemeIntensity * 2)
    : Math.sin(frame * 0.08) * 2;
  
  // Arm gesture animation
  const armGesture = Math.sin(frame * 0.04) * 5;
  
  // Celebrating bounce
  const celebrateBounce = effectiveAction === 'celebrating' 
    ? Math.abs(Math.sin(frame * 0.2)) * 12 
    : 0;

  // Position styles with smooth positioning
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: '5%', right: 'auto' },
    right: { right: '5%', left: 'auto' },
    center: { left: '50%', transform: 'translateX(-50%)' },
  };

  // Scale entry effect
  const scaleValue = interpolate(
    Math.max(0, entryProgress),
    [0, 1],
    [0.3, scale],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '6%',
    ...positionStyles[position],
    width: 260 * scale,
    height: 340 * scale,
    transform: `
      translateY(${breathe + headBob - celebrateBounce}px) 
      scale(${scaleValue})
    `,
    opacity: Math.max(0, entryProgress) * exitOpacity,
    pointerEvents: 'none',
    zIndex: 100,
    filter: 'drop-shadow(0 15px 40px rgba(0,0,0,0.4))',
  };

  // If Lottie loaded successfully, render it with lip-sync overlay
  if (animationData && !loadError) {
    return (
      <div style={containerStyle}>
        {/* Main Lottie character animation */}
        <Lottie
          animationData={animationData}
          style={{
            width: '100%',
            height: '100%',
          }}
          loop
          playbackRate={playbackRate}
        />
        
        {/* Lip-sync mouth overlay (when phoneme data available) */}
        {phonemeTimestamps && phonemeTimestamps.length > 0 && (
          <LipSyncOverlay
            viseme={currentViseme}
            intensity={visemeIntensity}
            frame={frame}
            primaryColor={effectiveShirtColor}
            skinTone={skinTone}
          />
        )}
      </div>
    );
  }

  // Professional SVG fallback character with enhanced animations
  return (
    <div style={containerStyle}>
      <ProfessionalSVGCharacter
        action={effectiveAction}
        frame={frame}
        fps={fps}
        primaryColor={effectiveShirtColor}
        skinTone={skinTone}
        armGesture={armGesture}
        headBob={headBob}
        visemeIntensity={visemeIntensity}
        currentViseme={currentViseme}
      />
    </div>
  );
};

// Lip-sync mouth overlay component
const LipSyncOverlay: React.FC<{
  viseme: Viseme;
  intensity: number;
  frame: number;
  primaryColor: string;
  skinTone: string;
}> = ({ viseme, intensity, frame, primaryColor, skinTone }) => {
  // Mouth shape parameters based on viseme
  const mouthParams: Record<Viseme, { width: number; height: number; round: boolean }> = {
    'neutral': { width: 20, height: 4, round: false },
    'wide': { width: 28, height: 16, round: false },
    'medium': { width: 24, height: 12, round: false },
    'round': { width: 16, height: 14, round: true },
    'small_round': { width: 12, height: 10, round: true },
    'closed': { width: 22, height: 2, round: false },
    'teeth_lip': { width: 18, height: 8, round: false },
    'teeth': { width: 22, height: 10, round: false },
    'tongue_up': { width: 20, height: 10, round: false },
    'back': { width: 18, height: 12, round: true },
    'back_open': { width: 20, height: 14, round: true },
  };

  const params = mouthParams[viseme];
  const smoothIntensity = Math.sin(intensity * Math.PI);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '40%',
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        opacity: 0.95,
      }}
    >
      <svg width="60" height="40" viewBox="0 0 60 40">
        {/* Mouth shape */}
        {params.round ? (
          <ellipse
            cx="30"
            cy="20"
            rx={params.width / 2 * (0.5 + smoothIntensity * 0.5)}
            ry={params.height / 2 * (0.5 + smoothIntensity * 0.5)}
            fill="#C0392B"
            stroke="#8B2323"
            strokeWidth="1"
          />
        ) : (
          <path
            d={`M ${30 - params.width / 2 * (0.7 + smoothIntensity * 0.3)} 20 
                Q 30 ${20 + params.height * (0.5 + smoothIntensity * 0.5)} 
                ${30 + params.width / 2 * (0.7 + smoothIntensity * 0.3)} 20`}
            fill="#C0392B"
            stroke="#8B2323"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}
        
        {/* Teeth for certain visemes */}
        {(viseme === 'teeth' || viseme === 'teeth_lip' || viseme === 'wide') && (
          <rect
            x={30 - params.width / 4}
            y={18}
            width={params.width / 2}
            height={4}
            fill="white"
            rx="1"
          />
        )}
      </svg>
    </div>
  );
};

// Professional SVG Character with enhanced animations
const ProfessionalSVGCharacter: React.FC<{
  action: string;
  frame: number;
  fps: number;
  primaryColor: string;
  skinTone: string;
  armGesture: number;
  headBob: number;
  visemeIntensity: number;
  currentViseme: Viseme;
}> = ({ action, frame, fps, primaryColor, skinTone, armGesture, headBob, visemeIntensity, currentViseme }) => {
  // Blink animation (every ~3 seconds)
  const blinkCycle = frame % 90;
  const isBlinking = blinkCycle < 3;

  // Eyebrow animation based on action
  const eyebrowRaise = action === 'thinking' ? 3 : action === 'celebrating' ? -2 : 0;
  const eyebrowTilt = action === 'thinking' ? 3 : 0;

  // Arm positions based on action
  const getArmPath = (side: 'left' | 'right') => {
    const isRight = side === 'right';
    const base = isRight ? 145 : 55;
    const wave = armGesture;
    
    switch (action) {
      case 'waving':
        return isRight 
          ? `M ${base} 120 Q ${base + 30 + Math.sin(frame * 0.15) * 10} 80 ${base + 35} ${50 + Math.sin(frame * 0.2) * 15}`
          : `M ${base} 120 Q ${base - 15} 150 ${base - 10} 180`;
      case 'pointing':
        return isRight
          ? `M ${base} 120 Q ${base + 40} 90 ${base + 60} 70`
          : `M ${base} 120 Q ${base - 15} 150 ${base - 10} 180`;
      case 'celebrating':
        const celebrateY = 40 + Math.sin(frame * 0.2) * 10;
        return isRight
          ? `M ${base} 120 Q ${base + 25} 70 ${base + 30} ${celebrateY}`
          : `M ${base} 120 Q ${base - 25} 70 ${base - 30} ${celebrateY}`;
      case 'thinking':
        return isRight
          ? `M ${base} 120 Q ${base + 20} 100 ${base + 15} 85`
          : `M ${base} 120 Q ${base - 15} 150 ${base - 10} 180`;
      case 'explaining':
        return isRight
          ? `M ${base} 120 Q ${base + 25 + wave} 100 ${base + 30 + wave} 90`
          : `M ${base} 120 Q ${base - 20 - wave} 100 ${base - 25 - wave} 95`;
      default:
        return isRight
          ? `M ${base} 120 Q ${base + 20} 150 ${base + 15} 185`
          : `M ${base} 120 Q ${base - 20} 150 ${base - 15} 185`;
    }
  };

  // Get hand position for pointing finger
  const getHandPosition = (side: 'left' | 'right') => {
    const isRight = side === 'right';
    switch (action) {
      case 'waving':
        return isRight 
          ? { x: 180 + Math.sin(frame * 0.15) * 10, y: 50 + Math.sin(frame * 0.2) * 15 }
          : { x: 45, y: 185 };
      case 'pointing':
        return isRight ? { x: 205, y: 70 } : { x: 45, y: 185 };
      case 'celebrating':
        return isRight 
          ? { x: 175, y: 40 + Math.sin(frame * 0.2) * 10 }
          : { x: 25, y: 40 + Math.sin(frame * 0.2) * 10 };
      case 'thinking':
        return isRight ? { x: 160, y: 85 } : { x: 45, y: 185 };
      case 'explaining':
        return isRight 
          ? { x: 175 + armGesture, y: 90 }
          : { x: 30 - armGesture, y: 95 };
      default:
        return isRight ? { x: 160, y: 185 } : { x: 40, y: 185 };
    }
  };

  // Mouth shape based on viseme
  const getMouthPath = () => {
    const baseY = 78;
    const mouthWidth = 14;
    const mouthOpen = visemeIntensity * 8;
    
    switch (currentViseme) {
      case 'wide':
        return `M ${100 - mouthWidth} ${baseY} Q 100 ${baseY + 12 + mouthOpen} ${100 + mouthWidth} ${baseY}`;
      case 'round':
      case 'small_round':
        return `M ${100 - 8} ${baseY - 2} Q 100 ${baseY + 8 + mouthOpen} ${100 + 8} ${baseY - 2} Q 100 ${baseY - 6} ${100 - 8} ${baseY - 2}`;
      case 'closed':
        return `M ${100 - mouthWidth} ${baseY} L ${100 + mouthWidth} ${baseY}`;
      case 'teeth':
      case 'teeth_lip':
        return `M ${100 - mouthWidth} ${baseY - 2} Q 100 ${baseY + 6 + mouthOpen} ${100 + mouthWidth} ${baseY - 2}`;
      default:
        return `M ${100 - 10} ${baseY} Q 100 ${baseY + 4 + mouthOpen * 0.5} ${100 + 10} ${baseY}`;
    }
  };

  const rightHandPos = getHandPosition('right');
  const leftHandPos = getHandPosition('left');

  return (
    <svg 
      width="200" 
      height="280" 
      viewBox="0 0 200 280" 
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="proShirtGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={primaryColor} />
          <stop offset="100%" stopColor={`${primaryColor}CC`} />
        </linearGradient>
        <linearGradient id="proSkinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={skinTone} />
          <stop offset="100%" stopColor={`${skinTone}EE`} />
        </linearGradient>
        <filter id="proShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.25"/>
        </filter>
        <filter id="proGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>
      
      {/* Body / Shirt */}
      <path 
        d="M 55 115 Q 60 108 100 105 Q 140 108 145 115 L 152 195 L 48 195 Z" 
        fill="url(#proShirtGradient)" 
        filter="url(#proShadow)"
      />
      
      {/* Shirt collar */}
      <path d="M 82 108 L 100 125 L 118 108" fill="white" stroke="#E5E5E5" strokeWidth="1" />
      
      {/* Tie */}
      <path d="M 100 125 L 94 142 L 100 180 L 106 142 Z" fill="#1E3A5F" />
      
      {/* Left arm */}
      <g>
        <path 
          d={getArmPath('left')}
          stroke="url(#proShirtGradient)" 
          strokeWidth="22" 
          fill="none" 
          strokeLinecap="round"
        />
        <circle cx={leftHandPos.x} cy={leftHandPos.y} r="14" fill="url(#proSkinGradient)" />
      </g>
      
      {/* Right arm */}
      <g>
        <path 
          d={getArmPath('right')}
          stroke="url(#proShirtGradient)" 
          strokeWidth="22" 
          fill="none" 
          strokeLinecap="round"
        />
        <circle cx={rightHandPos.x} cy={rightHandPos.y} r="14" fill="url(#proSkinGradient)" />
        
        {/* Pointing finger for pointing action */}
        {action === 'pointing' && (
          <path 
            d={`M ${rightHandPos.x} ${rightHandPos.y} L ${rightHandPos.x + 20} ${rightHandPos.y - 15}`}
            stroke="url(#proSkinGradient)" 
            strokeWidth="7" 
            strokeLinecap="round"
          />
        )}
      </g>
      
      {/* Neck */}
      <rect x="90" y="95" width="20" height="18" fill="url(#proSkinGradient)" />
      
      {/* Head with subtle movement */}
      <g transform={`translate(0, ${headBob * 0.3})`}>
        {/* Head shape */}
        <ellipse cx="100" cy="55" rx="40" ry="45" fill="url(#proSkinGradient)" filter="url(#proShadow)" />
        
        {/* Hair */}
        <path 
          d="M 60 48 Q 70 18 100 12 Q 130 18 140 48 Q 135 30 100 28 Q 65 30 60 48" 
          fill="#2D1B0E" 
        />
        
        {/* Eyebrows */}
        <path 
          d={`M 72 ${40 - eyebrowRaise} Q 82 ${36 - eyebrowRaise - eyebrowTilt} 92 ${40 - eyebrowRaise}`} 
          stroke="#2D1B0E" 
          strokeWidth="2.5" 
          fill="none" 
        />
        <path 
          d={`M 108 ${40 - eyebrowRaise} Q 118 ${36 - eyebrowRaise + eyebrowTilt} 128 ${40 - eyebrowRaise}`} 
          stroke="#2D1B0E" 
          strokeWidth="2.5" 
          fill="none" 
        />
        
        {/* Eyes */}
        <g opacity={isBlinking ? 0.1 : 1}>
          <ellipse cx="82" cy="52" rx="7" ry={isBlinking ? 1 : 5} fill="#2D1B0E" />
          <ellipse cx="118" cy="52" rx="7" ry={isBlinking ? 1 : 5} fill="#2D1B0E" />
          {/* Eye highlights */}
          {!isBlinking && (
            <>
              <circle cx="84" cy="50" r="2" fill="white" opacity="0.8" />
              <circle cx="120" cy="50" r="2" fill="white" opacity="0.8" />
            </>
          )}
        </g>
        
        {/* Nose */}
        <path d="M 100 58 Q 95 66 100 72 Q 105 66 100 58" fill={`${skinTone}DD`} />
        
        {/* Animated mouth with lip-sync */}
        <path 
          d={getMouthPath()}
          fill={currentViseme === 'round' || currentViseme === 'small_round' || currentViseme === 'wide' ? '#C0392B' : 'none'}
          stroke="#C0392B" 
          strokeWidth="2.5" 
          strokeLinecap="round"
        />
        
        {/* Teeth for certain visemes */}
        {(currentViseme === 'teeth' || currentViseme === 'teeth_lip') && (
          <rect x="92" y="76" width="16" height="4" fill="white" rx="1" />
        )}
      </g>
      
      {/* Legs */}
      <rect x="68" y="195" width="28" height="60" rx="6" fill="#1E3A5F" />
      <rect x="104" y="195" width="28" height="60" rx="6" fill="#1E3A5F" />
      
      {/* Shoes */}
      <ellipse cx="82" cy="260" rx="20" ry="10" fill="#1a1a1a" />
      <ellipse cx="118" cy="260" rx="20" ry="10" fill="#1a1a1a" />
    </svg>
  );
};

export default ProfessionalLottieCharacter;
