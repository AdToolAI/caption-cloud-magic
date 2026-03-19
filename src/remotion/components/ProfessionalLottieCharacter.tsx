import React, { useEffect, useState, useMemo, useCallback } from 'react';
import type { LottieAnimationData } from '@remotion/lottie';
import { 
  useCurrentFrame, 
  useVideoConfig, 
  delayRender,
  continueRender,
} from 'remotion';
import { safeInterpolate, safeDuration, safeSpring as spring } from '../utils/safeInterpolate';
import { getCurrentViseme, getVisemeIntensity, type Viseme } from '../utils/phonemeMapping';
import { loadPremiumLottie, isValidLottieData, sanitizeForLottiePlayer, type LottieLoadResult } from '../utils/premiumLottieLoader';

// r44: Lazy-load Lottie to prevent top-level delayRender in Lambda
let CharLottieComponent: React.ComponentType<any> | null = null;
let charLottiePromise: Promise<void> | null = null;
const loadCharLottie = (): Promise<void> => {
  if (CharLottieComponent) return Promise.resolve();
  if (charLottiePromise) return charLottiePromise;
  charLottiePromise = import('@remotion/lottie').then(mod => {
    CharLottieComponent = mod.Lottie;
  }).catch(() => { CharLottieComponent = null; });
  return charLottiePromise;
};

// ✅ PHASE 1: Import professional embedded Lottie animations
import {
  createEmbeddedIdleAnimation,
  createEmbeddedWavingAnimation,
  createEmbeddedThinkingAnimation,
  createEmbeddedCelebratingAnimation,
  createEmbeddedPointingAnimation,
  createEmbeddedExplainingAnimation,
  createEmbeddedMouthShapesAnimation,
  VISEME_FRAME_MAP,
} from './EmbeddedLottieAnimations';

// ============================================
// 🎬 PROFESSIONAL LOTTIE CHARACTER COMPONENT
// Phase 5.2: Premium Lottie Integration
// 95%+ Loft-Film Quality with:
// - Premium local Lottie JSON files (highest priority)
// - Memory-cached CDN loading
// - Inline Lottie fallbacks (100% reliable)
// - True Lottie mouth animation for lip-sync
// - Brand color integration
// - Enhanced scene-based character intelligence
// ============================================

export interface PhonemeTimestamp {
  character: string;
  start_time: number;
  end_time: number;
}

export interface ProfessionalLottieCharacterProps {
  action?: 'idle' | 'pointing' | 'thinking' | 'celebrating' | 'explaining' | 'waving' | 'talking';
  position: 'left' | 'right' | 'center';
  sceneType: 'hook' | 'problem' | 'solution' | 'feature' | 'proof' | 'cta';
  primaryColor?: string;
  skinTone?: string;
  shirtColor?: string;
  scale?: number;
  visible?: boolean;
  phonemeTimestamps?: PhonemeTimestamp[];
  playbackRate?: number;
  sceneStartTimeSeconds?: number;
  forceEmbeddedLottie?: boolean; // ← Force embedded-only, skip CDN/local
  brandColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
}

// ============================================
// VISEME TO MOUTH ANIMATION MAPPING
// ============================================
const VISEME_TO_MOUTH_CONFIG: Record<Viseme, { width: number; height: number; openness: number; round: boolean }> = {
  'neutral': { width: 20, height: 4, openness: 0.1, round: false },
  'wide': { width: 32, height: 18, openness: 0.9, round: false },      // A, I
  'medium': { width: 26, height: 14, openness: 0.6, round: false },    // E
  'round': { width: 18, height: 16, openness: 0.7, round: true },      // O
  'small_round': { width: 14, height: 12, openness: 0.5, round: true }, // U
  'closed': { width: 24, height: 2, openness: 0, round: false },       // M, B, P
  'teeth_lip': { width: 20, height: 10, openness: 0.4, round: false }, // F, V, W
  'teeth': { width: 24, height: 12, openness: 0.5, round: false },     // T, D, S, Z
  'tongue_up': { width: 22, height: 10, openness: 0.4, round: false }, // L, N
  'back': { width: 20, height: 14, openness: 0.6, round: true },       // R
  'back_open': { width: 22, height: 16, openness: 0.7, round: true },  // K, G
};

// ============================================
// SCENE-BASED CHARACTER CONFIGURATION
// Intelligent character behavior per scene type
// ============================================
interface CharacterConfig {
  visible: boolean;
  action: 'idle' | 'waving' | 'thinking' | 'celebrating' | 'explaining' | 'pointing' | 'talking';
  position: 'left' | 'right' | 'center';
  emotionalTone: 'excited' | 'concerned' | 'happy' | 'neutral' | 'confident' | 'urgent';
  entryDelay: number;
  scale: number;
}

const getCharacterConfigForScene = (sceneType: string): CharacterConfig => {
  const configs: Record<string, CharacterConfig> = {
    hook: { 
      visible: true, 
      action: 'waving', 
      position: 'right',
      emotionalTone: 'excited',
      entryDelay: 0.3,
      scale: 1.0 
    },
    problem: { 
      visible: true, 
      action: 'thinking', 
      position: 'left',
      emotionalTone: 'concerned',
      entryDelay: 0.5,
      scale: 0.95 
    },
    solution: { 
      visible: true, 
      action: 'celebrating', 
      position: 'right',
      emotionalTone: 'happy',
      entryDelay: 0.2,
      scale: 1.05 
    },
    feature: { 
      visible: false,  // Icons only for features
      action: 'explaining', 
      position: 'center',
      emotionalTone: 'neutral',
      entryDelay: 0,
      scale: 0.9 
    },
    proof: { 
      visible: false,  // Stats only for proof
      action: 'pointing', 
      position: 'right',
      emotionalTone: 'confident',
      entryDelay: 0,
      scale: 0.9 
    },
    cta: { 
      visible: true, 
      action: 'pointing', 
      position: 'right',
      emotionalTone: 'urgent',
      entryDelay: 0.1,
      scale: 1.1 
    },
  };
  return configs[sceneType] || configs.hook;
};

// ============================================
// INLINE LOTTIE JSON FALLBACKS
// Guaranteed to work - embedded animations
// ============================================
// ✅ PHASE 1: Use professional embedded Lottie animations
const getEmbeddedAnimation = (action: string, primaryColor: string, skinTone: string): LottieAnimationData => {
  switch (action) {
    case 'idle':
      return createEmbeddedIdleAnimation(primaryColor, skinTone);
    case 'waving':
      return createEmbeddedWavingAnimation(primaryColor, skinTone);
    case 'thinking':
      return createEmbeddedThinkingAnimation(primaryColor, skinTone);
    case 'celebrating':
      return createEmbeddedCelebratingAnimation(primaryColor, skinTone);
    case 'pointing':
      return createEmbeddedPointingAnimation(primaryColor, skinTone);
    case 'explaining':
    case 'talking':
    default:
      return createEmbeddedExplainingAnimation(primaryColor, skinTone);
  }
};

// Legacy fallback for backwards compatibility
const createInlinePresenterLottie = (action: string, primaryColor: string, skinTone: string = '#FFDAB9'): LottieAnimationData => {
  return getEmbeddedAnimation(action, primaryColor, skinTone);
};

// ✅ PHASE 5.2: CDN URLs now managed by premiumLottieLoader.ts

// ============================================
// MAIN COMPONENT
// ============================================
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
  sceneStartTimeSeconds = 0,
  forceEmbeddedLottie = false,
  brandColors,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender('Loading Professional Lottie character'));
  const [loadSource, setLoadSource] = useState<'local' | 'cdn' | 'inline' | 'svg'>('local');

  // Get scene-based character configuration
  const sceneConfig = useMemo(() => getCharacterConfigForScene(sceneType), [sceneType]);
  
  // Determine effective action based on scene type
  const effectiveAction = action || sceneConfig.action;
  
  // Effective colors with brand color integration
  const effectivePrimaryColor = brandColors?.primary || shirtColor || primaryColor;
  const effectiveScale = scale * sceneConfig.scale;

  // ✅ PHASE 5.2: Premium Lottie Loader with memory caching
  // Fallback chain: Local Premium → CDN → Embedded (100% reliable)
  const getEmbeddedFallback = useCallback(() => {
    return getEmbeddedAnimation(effectiveAction, effectivePrimaryColor, skinTone);
  }, [effectiveAction, effectivePrimaryColor, skinTone]);

  useEffect(() => {
    let cancelled = false;

    const loadAnimation = async () => {
      try {
        // ✅ r35: Lambda environment → force SVG fallback, never mount <Lottie>
        // The <Lottie> component's internal delayRender hangs in Lambda even with embedded data
        const isLambda = (() => {
          try {
            return typeof process !== 'undefined' && (
              !!(process.env?.AWS_LAMBDA_FUNCTION_NAME) ||
              !!(process.env?.LAMBDA_TASK_ROOT) ||
              !!(process.env?.AWS_EXECUTION_ENV)
            );
          } catch { return false; }
        })();
        
        if (isLambda) {
          console.log(`[ProfessionalLottieCharacter] ⚡ r35 Lambda detected — forcing SVG fallback (no <Lottie> mount)`);
          if (!cancelled) {
            setAnimationData(null);
            setLoadSource('svg');
            continueRender(handle);
          }
          return;
        }

        // r44: Load Lottie component dynamically for non-Lambda environments
        try { await loadCharLottie(); } catch {}

        // ✅ FORCE EMBEDDED: Skip CDN/local entirely when flag is set
        if (forceEmbeddedLottie) {
          console.log(`⚡ forceEmbeddedLottie active — using embedded directly: ${effectiveAction}`);
          const embedded = getEmbeddedFallback();
          const sanitized = sanitizeForLottiePlayer(embedded);
          if (!cancelled) {
            setAnimationData(sanitized || embedded);
            setLoadSource(CharLottieComponent ? 'inline' : 'svg');
            continueRender(handle);
          }
          return;
        }

        // Use premium loader with automatic caching and fallback
        const result = await loadPremiumLottie(effectiveAction, getEmbeddedFallback);
        
        if (!cancelled) {
          setAnimationData(result.data);
          setLoadSource(result.source === 'embedded' ? 'inline' : result.source === 'local' ? 'local' : 'cdn');
          continueRender(handle);
        }
      } catch (error) {
        // Ultimate fallback - should never reach here
        if (!cancelled) {
          console.log('Using ultimate embedded fallback');
          const inlineData = getEmbeddedFallback();
          setAnimationData(inlineData);
          setLoadSource('inline');
          continueRender(handle);
        }
      }
    };

    loadAnimation();

    return () => {
      cancelled = true;
    };
  }, [effectiveAction, effectivePrimaryColor, handle, getEmbeddedFallback, forceEmbeddedLottie]);

  // Don't render if not visible or scene config says hide
  if (!visible || !sceneConfig.visible) return null;

  // ✅ PHASE 5.1: Calculate GLOBAL time for lip-sync lookup
  // Local frame is relative to scene start, add sceneStartTimeSeconds for global time
  const localTimeSeconds = frame / fps;
  const globalTimeSeconds = sceneStartTimeSeconds + localTimeSeconds;

  // Get current lip-sync viseme using GLOBAL time
  const currentViseme = phonemeTimestamps ? getCurrentViseme(phonemeTimestamps, globalTimeSeconds) : 'neutral';
  const visemeIntensity = phonemeTimestamps ? getVisemeIntensity(phonemeTimestamps, globalTimeSeconds) : 0;
  const mouthConfig = VISEME_TO_MOUTH_CONFIG[currentViseme] || VISEME_TO_MOUTH_CONFIG.neutral;

  // Enhanced entry animation with spring physics
  const entryDelayFrames = Math.floor(sceneConfig.entryDelay * fps);
  const entryProgress = spring({
    frame: Math.max(0, frame - entryDelayFrames),
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  });

  // Exit animation - ✅ Safe duration validation to prevent "Invalid array length" error
  const safeDur = safeDuration(durationInFrames, 60);
  const exitStart = Math.min(Math.max(1, safeDur - 25), safeDur - 1);
  const exitOpacity = safeInterpolate(
    frame,
    [exitStart, safeDur],
    [1, 0]
  );

  // Breathing animation
  const breathe = Math.sin(frame * 0.06) * 4;
  
  // Head bob for talking/explaining with lip-sync boost
  const headBob = (effectiveAction === 'talking' || effectiveAction === 'explaining') 
    ? Math.sin(frame * 0.15) * 3 + (visemeIntensity * 3)
    : Math.sin(frame * 0.08) * 2;
  
  // Celebrating bounce
  const celebrateBounce = effectiveAction === 'celebrating' 
    ? Math.abs(Math.sin(frame * 0.2)) * 12 
    : 0;

  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: '5%', right: 'auto' },
    right: { right: '5%', left: 'auto' },
    center: { left: '50%', transform: 'translateX(-50%)' },
  };

  // Scale entry effect
  const scaleValue = safeInterpolate(
    Math.max(0, entryProgress),
    [0, 1],
    [0.3, effectiveScale]
  );

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '6%',
    ...positionStyles[position],
    width: 260 * effectiveScale,
    height: 340 * effectiveScale,
    transform: `
      translateY(${breathe + headBob - celebrateBounce}px) 
      scale(${scaleValue})
    `,
    opacity: Math.max(0, entryProgress) * exitOpacity,
    pointerEvents: 'none',
    zIndex: 100,
    filter: 'drop-shadow(0 15px 40px rgba(0,0,0,0.4))',
  };

  // Render Lottie animation if available AND valid — use strict sanitizer as final gate
  const sanitizedAnimationData = animationData ? sanitizeForLottiePlayer(animationData) : null;
  if (frame === 0) {
    console.log(`[ProfessionalLottieCharacter] RenderGuard: action=${effectiveAction}, source=${loadSource}, sanitized=${!!sanitizedAnimationData}`);
  }
  if (sanitizedAnimationData && loadSource !== 'svg' && CharLottieComponent) {
    return (
      <div style={containerStyle}>
        {/* Main Lottie character animation — r44: uses dynamically loaded component */}
        <CharLottieComponent
          animationData={sanitizedAnimationData}
          style={{
            width: '100%',
            height: '100%',
          }}
          loop
          playbackRate={playbackRate}
        />
        
        {/* Lip-sync mouth overlay — ✅ defensive .length guard */}
        {phonemeTimestamps && Array.isArray(phonemeTimestamps) && phonemeTimestamps.length > 0 && (
          <LottieLipSyncMouth
            viseme={currentViseme}
            intensity={visemeIntensity}
            config={mouthConfig}
            frame={frame}
            primaryColor={effectivePrimaryColor}
            skinTone={skinTone}
          />
        )}
      </div>
    );
  }

  // Ultimate SVG fallback with enhanced animations
  return (
    <div style={containerStyle}>
      <ProfessionalSVGCharacter
        action={effectiveAction}
        frame={frame}
        fps={fps}
        primaryColor={effectivePrimaryColor}
        skinTone={skinTone}
        visemeIntensity={visemeIntensity}
        currentViseme={currentViseme}
        mouthConfig={mouthConfig}
      />
    </div>
  );
};

// ============================================
// LOTTIE LIP-SYNC MOUTH COMPONENT
// True animated mouth overlay for lip-sync
// ============================================
const LottieLipSyncMouth: React.FC<{
  viseme: Viseme;
  intensity: number;
  config: { width: number; height: number; openness: number; round: boolean };
  frame: number;
  primaryColor: string;
  skinTone: string;
}> = ({ viseme, intensity, config, frame, primaryColor, skinTone }) => {
  const smoothIntensity = Math.sin(intensity * Math.PI);
  const wobble = Math.sin(frame * 0.2) * 0.5; // Subtle animation
  
  // Adjust mouth based on viseme
  const mouthWidth = config.width * (0.7 + smoothIntensity * 0.3);
  const mouthHeight = config.height * (0.5 + smoothIntensity * 0.5);
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '42%',
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        opacity: 0.95,
      }}
    >
      <svg width="80" height="50" viewBox="0 0 80 50">
        <defs>
          <radialGradient id="mouthGradient" cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#8B2323" />
            <stop offset="100%" stopColor="#C0392B" />
          </radialGradient>
          <linearGradient id="teethGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E8E8E8" />
          </linearGradient>
        </defs>
        
        {/* Mouth base */}
        {config.round ? (
          <ellipse
            cx="40"
            cy="25"
            rx={mouthWidth / 2 + wobble}
            ry={mouthHeight / 2}
            fill="url(#mouthGradient)"
            stroke="#8B2323"
            strokeWidth="1.5"
          />
        ) : (
          <path
            d={`M ${40 - mouthWidth / 2} 25 
                Q 40 ${25 + mouthHeight} 
                ${40 + mouthWidth / 2} 25`}
            fill="url(#mouthGradient)"
            stroke="#8B2323"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}
        
        {/* Teeth for certain visemes */}
        {(viseme === 'teeth' || viseme === 'teeth_lip' || viseme === 'wide') && config.openness > 0.3 && (
          <rect
            x={40 - mouthWidth / 4}
            y={23}
            width={mouthWidth / 2}
            height={5}
            fill="url(#teethGradient)"
            rx="1"
          />
        )}
        
        {/* Tongue hint for certain sounds */}
        {(viseme === 'tongue_up' || viseme === 'back') && (
          <ellipse
            cx="40"
            cy={28 + mouthHeight * 0.3}
            rx={mouthWidth * 0.25}
            ry={3}
            fill="#CC6666"
            opacity="0.7"
          />
        )}
      </svg>
    </div>
  );
};

// ============================================
// PROFESSIONAL SVG CHARACTER FALLBACK
// Enhanced with lip-sync and brand colors
// ============================================
const ProfessionalSVGCharacter: React.FC<{
  action: string;
  frame: number;
  fps: number;
  primaryColor: string;
  skinTone: string;
  visemeIntensity: number;
  currentViseme: Viseme;
  mouthConfig: { width: number; height: number; openness: number; round: boolean };
}> = ({ action, frame, fps, primaryColor, skinTone, visemeIntensity, currentViseme, mouthConfig }) => {
  // Blink animation
  const blinkCycle = frame % 90;
  const isBlinking = blinkCycle < 3;

  // Eyebrow animation based on action
  const eyebrowRaise = action === 'thinking' ? 3 : action === 'celebrating' ? -2 : 0;
  const eyebrowTilt = action === 'thinking' ? 3 : 0;

  // Arm animation based on action
  const armWave = Math.sin(frame * 0.04) * 5;
  const headBob = Math.sin(frame * 0.08) * 2 + visemeIntensity * 2;

  // Get arm path based on action
  const getRightArmPath = () => {
    const wave = Math.sin(frame * 0.15) * 10;
    switch (action) {
      case 'waving':
        return `M 145 120 Q ${175 + wave} 80 ${180 + wave} ${50 + Math.sin(frame * 0.2) * 15}`;
      case 'pointing':
        return `M 145 120 Q 185 90 205 70`;
      case 'celebrating':
        const celebrateY = 40 + Math.sin(frame * 0.2) * 10;
        return `M 145 120 Q 170 70 175 ${celebrateY}`;
      case 'thinking':
        return `M 145 120 Q 165 100 160 85`;
      case 'explaining':
        return `M 145 120 Q ${170 + armWave} 100 ${175 + armWave} 90`;
      default:
        return `M 145 120 Q 165 150 160 185`;
    }
  };

  const getLeftArmPath = () => {
    switch (action) {
      case 'celebrating':
        const celebrateY = 40 + Math.sin(frame * 0.2 + 0.5) * 10;
        return `M 55 120 Q 30 70 25 ${celebrateY}`;
      case 'explaining':
        return `M 55 120 Q ${35 - armWave} 100 ${30 - armWave} 95`;
      default:
        return `M 55 120 Q 35 150 40 185`;
    }
  };

  // Get hand positions
  const getRightHandPos = () => {
    const wave = Math.sin(frame * 0.15) * 10;
    switch (action) {
      case 'waving': return { x: 180 + wave, y: 50 + Math.sin(frame * 0.2) * 15 };
      case 'pointing': return { x: 205, y: 70 };
      case 'celebrating': return { x: 175, y: 40 + Math.sin(frame * 0.2) * 10 };
      case 'thinking': return { x: 160, y: 85 };
      case 'explaining': return { x: 175 + armWave, y: 90 };
      default: return { x: 160, y: 185 };
    }
  };

  const getLeftHandPos = () => {
    switch (action) {
      case 'celebrating': return { x: 25, y: 40 + Math.sin(frame * 0.2 + 0.5) * 10 };
      case 'explaining': return { x: 30 - armWave, y: 95 };
      default: return { x: 40, y: 185 };
    }
  };

  // Get animated mouth path
  const getMouthPath = () => {
    const baseY = 78;
    const smoothIntensity = Math.sin(visemeIntensity * Math.PI);
    const width = mouthConfig.width * (0.7 + smoothIntensity * 0.3);
    const height = mouthConfig.height * (0.5 + smoothIntensity * 0.5);
    
    if (mouthConfig.round) {
      return `M ${100 - width / 2} ${baseY} 
              Q ${100 - width / 4} ${baseY + height} ${100} ${baseY + height * 0.8}
              Q ${100 + width / 4} ${baseY + height} ${100 + width / 2} ${baseY}
              Q ${100 + width / 4} ${baseY - height * 0.3} ${100} ${baseY - height * 0.2}
              Q ${100 - width / 4} ${baseY - height * 0.3} ${100 - width / 2} ${baseY}`;
    }
    
    return `M ${100 - width / 2} ${baseY} Q 100 ${baseY + height} ${100 + width / 2} ${baseY}`;
  };

  const rightHandPos = getRightHandPos();
  const leftHandPos = getLeftHandPos();

  return (
    <svg 
      width="240" 
      height="340" 
      viewBox="0 0 240 340" 
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="shirtGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={primaryColor} />
          <stop offset="40%" stopColor={primaryColor} />
          <stop offset="100%" stopColor={`${primaryColor}CC`} />
        </linearGradient>
        <linearGradient id="shirtShadow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.15)" />
        </linearGradient>
        <linearGradient id="skinGradient" x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor={skinTone} />
          <stop offset="50%" stopColor={skinTone} />
          <stop offset="100%" stopColor={`${skinTone}DD`} />
        </linearGradient>
        <linearGradient id="skinHighlight" x1="40%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id="hairGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3D2B1F" />
          <stop offset="50%" stopColor="#2D1B0E" />
          <stop offset="100%" stopColor="#1A0F08" />
        </linearGradient>
        <linearGradient id="pantsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1E3A5F" />
          <stop offset="100%" stopColor="#152A45" />
        </linearGradient>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.2"/>
        </filter>
        <filter id="innerShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="1" dy="2" stdDeviation="3" floodOpacity="0.12"/>
        </filter>
        <linearGradient id="mouthGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8B2323" />
          <stop offset="100%" stopColor="#C0392B" />
        </linearGradient>
        <linearGradient id="shoeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2a2a2a" />
          <stop offset="100%" stopColor="#111111" />
        </linearGradient>
      </defs>
      
      {/* Body / Shirt with shoulder structure */}
      <path 
        d="M 62 138 Q 55 132 55 128 Q 60 118 80 115 Q 100 112 120 112 Q 160 115 165 128 Q 165 132 158 138 L 172 240 L 48 240 Z" 
        fill="url(#shirtGradient)" 
        filter="url(#shadow)"
      />
      {/* Shirt shading overlay */}
      <path 
        d="M 62 138 Q 55 132 55 128 Q 60 118 80 115 Q 100 112 120 112 Q 160 115 165 128 Q 165 132 158 138 L 172 240 L 48 240 Z" 
        fill="url(#shirtShadow)" 
      />
      
      {/* Collar with depth */}
      <path d="M 88 118 L 100 122 L 112 118" fill="none" stroke="white" strokeWidth="2.5" opacity="0.9" />
      <path d="M 93 118 L 100 136 L 107 118" fill="white" opacity="0.85" />
      
      {/* Tie with gradient */}
      <path d="M 100 136 L 93 155 L 100 225 L 107 155 Z" fill="url(#pantsGradient)" />
      <path d="M 100 136 L 96 145 L 100 148 L 104 145 Z" fill="#1E3A5F" stroke="#152A45" strokeWidth="0.5" />
      
      {/* Shirt buttons */}
      <circle cx="100" cy="165" r="2" fill="rgba(255,255,255,0.4)" />
      <circle cx="100" cy="185" r="2" fill="rgba(255,255,255,0.4)" />
      <circle cx="100" cy="205" r="2" fill="rgba(255,255,255,0.35)" />
      
      {/* Left arm */}
      <g>
        <path 
          d={getLeftArmPath().replace(/M 55/g, 'M 62').replace(/Q 35/g, 'Q 38').replace(/Q 30/g, 'Q 32')}
          stroke="url(#shirtGradient)" 
          strokeWidth="26" 
          fill="none" 
          strokeLinecap="round"
          filter="url(#innerShadow)"
        />
        <circle cx={leftHandPos.x} cy={leftHandPos.y} r="16" fill="url(#skinGradient)" />
        <circle cx={leftHandPos.x - 2} cy={leftHandPos.y - 3} r="14" fill="url(#skinHighlight)" />
      </g>
      
      {/* Right arm */}
      <g>
        <path 
          d={getRightArmPath().replace(/M 145/g, 'M 158')}
          stroke="url(#shirtGradient)" 
          strokeWidth="26" 
          fill="none" 
          strokeLinecap="round"
          filter="url(#innerShadow)"
        />
        <circle cx={rightHandPos.x} cy={rightHandPos.y} r="16" fill="url(#skinGradient)" />
        <circle cx={rightHandPos.x - 2} cy={rightHandPos.y - 3} r="14" fill="url(#skinHighlight)" />
        
        {/* Pointing finger */}
        {action === 'pointing' && (
          <path 
            d={`M ${rightHandPos.x} ${rightHandPos.y} L ${rightHandPos.x + 22} ${rightHandPos.y - 16}`}
            stroke="url(#skinGradient)" 
            strokeWidth="8" 
            strokeLinecap="round"
          />
        )}
      </g>
      
      {/* Neck with shadow */}
      <rect x="92" y="103" width="24" height="20" rx="4" fill="url(#skinGradient)" />
      <rect x="92" y="113" width="24" height="8" fill="rgba(0,0,0,0.06)" />
      
      {/* Head with movement */}
      <g transform={`translate(4, ${headBob * 0.3})`}>
        {/* Head shape with subtle highlight */}
        <ellipse cx="116" cy="60" rx="44" ry="48" fill="url(#skinGradient)" filter="url(#shadow)" />
        <ellipse cx="112" cy="52" rx="30" ry="32" fill="url(#skinHighlight)" />
        
        {/* Hair — multiple layers for depth */}
        <path 
          d="M 72 52 Q 80 15 116 8 Q 152 15 160 52 Q 155 28 116 24 Q 77 28 72 52" 
          fill="url(#hairGradient)" 
        />
        {/* Hair strands for texture */}
        <path d="M 82 42 Q 90 22 105 20" stroke="#3D2B1F" strokeWidth="1.5" fill="none" opacity="0.4" />
        <path d="M 130 20 Q 142 22 148 38" stroke="#3D2B1F" strokeWidth="1.5" fill="none" opacity="0.4" />
        <path d="M 95 18 Q 110 10 125 16" stroke="#1A0F08" strokeWidth="1" fill="none" opacity="0.3" />
        
        {/* Ears */}
        <ellipse cx="72" cy="60" rx="7" ry="10" fill="url(#skinGradient)" />
        <ellipse cx="72" cy="60" rx="4" ry="6" fill={`${skinTone}CC`} />
        <ellipse cx="160" cy="60" rx="7" ry="10" fill="url(#skinGradient)" />
        <ellipse cx="160" cy="60" rx="4" ry="6" fill={`${skinTone}CC`} />
        
        {/* Eyebrows — thicker, more expressive */}
        <path 
          d={`M 88 ${44 - eyebrowRaise} Q 98 ${39 - eyebrowRaise - eyebrowTilt} 108 ${44 - eyebrowRaise}`} 
          stroke="url(#hairGradient)" 
          strokeWidth="3" 
          fill="none" 
          strokeLinecap="round"
        />
        <path 
          d={`M 124 ${44 - eyebrowRaise} Q 134 ${39 - eyebrowRaise + eyebrowTilt} 144 ${44 - eyebrowRaise}`} 
          stroke="url(#hairGradient)" 
          strokeWidth="3" 
          fill="none" 
          strokeLinecap="round"
        />
        
        {/* Eyes — more detailed with iris */}
        <g opacity={isBlinking ? 0.1 : 1}>
          {/* Left eye */}
          <ellipse cx="98" cy="56" rx="9" ry={isBlinking ? 1 : 6.5} fill="white" />
          <ellipse cx="98" cy="56" rx="6" ry={isBlinking ? 1 : 5.5} fill="#2D1B0E" />
          <ellipse cx="98" cy="56" rx="4" ry={isBlinking ? 1 : 4} fill="#1a1a1a" />
          {!isBlinking && (
            <>
              <circle cx="100" cy="53" r="2.5" fill="white" opacity="0.85" />
              <circle cx="95" cy="57" r="1" fill="white" opacity="0.4" />
            </>
          )}
          {/* Right eye */}
          <ellipse cx="134" cy="56" rx="9" ry={isBlinking ? 1 : 6.5} fill="white" />
          <ellipse cx="134" cy="56" rx="6" ry={isBlinking ? 1 : 5.5} fill="#2D1B0E" />
          <ellipse cx="134" cy="56" rx="4" ry={isBlinking ? 1 : 4} fill="#1a1a1a" />
          {!isBlinking && (
            <>
              <circle cx="136" cy="53" r="2.5" fill="white" opacity="0.85" />
              <circle cx="131" cy="57" r="1" fill="white" opacity="0.4" />
            </>
          )}
          {/* Eyelashes */}
          <path d="M 89 52 Q 92 49 95 51" stroke="#2D1B0E" strokeWidth="1" fill="none" />
          <path d="M 125 52 Q 128 49 131 51" stroke="#2D1B0E" strokeWidth="1" fill="none" />
        </g>
        
        {/* Nose — more defined */}
        <path d="M 116 62 Q 110 72 114 78 Q 116 80 118 78 Q 122 72 116 62" fill={`${skinTone}CC`} />
        <path d="M 112 77 Q 116 80 120 77" stroke={`${skinTone}AA`} strokeWidth="1.5" fill="none" />
        
        {/* Cheek blush */}
        <circle cx="86" cy="70" r="8" fill="#FFB6C1" opacity="0.12" />
        <circle cx="146" cy="70" r="8" fill="#FFB6C1" opacity="0.12" />
        
        {/* Animated mouth with lip-sync */}
        <path 
          d={getMouthPath().replace(/M (\d+)/g, (_, n) => `M ${parseInt(n) + 16}`).replace(/Q (\d+)/g, (_, n) => `Q ${parseInt(n) + 16}`)}
          fill={mouthConfig.openness > 0.3 ? 'url(#mouthGrad)' : 'none'}
          stroke="#C0392B" 
          strokeWidth="2.5" 
          strokeLinecap="round"
        />
        
        {/* Teeth for certain visemes */}
        {(currentViseme === 'teeth' || currentViseme === 'teeth_lip' || currentViseme === 'wide') && mouthConfig.openness > 0.4 && (
          <rect x="108" y="80" width="16" height="4" fill="white" rx="1" />
        )}
      </g>
      
      {/* Legs with gradient */}
      <rect x="72" y="240" width="32" height="68" rx="8" fill="url(#pantsGradient)" />
      <rect x="118" y="240" width="32" height="68" rx="8" fill="url(#pantsGradient)" />
      {/* Leg crease detail */}
      <path d="M 88 260 Q 86 275 88 290" stroke="rgba(0,0,0,0.08)" strokeWidth="1" fill="none" />
      <path d="M 134 260 Q 132 275 134 290" stroke="rgba(0,0,0,0.08)" strokeWidth="1" fill="none" />
      
      {/* Shoes with gradient */}
      <ellipse cx="88" cy="312" rx="24" ry="12" fill="url(#shoeGradient)" />
      <ellipse cx="88" cy="308" rx="22" ry="4" fill="rgba(255,255,255,0.08)" />
      <ellipse cx="134" cy="312" rx="24" ry="12" fill="url(#shoeGradient)" />
      <ellipse cx="134" cy="308" rx="22" ry="4" fill="rgba(255,255,255,0.08)" />
    </svg>
  );
};

export default ProfessionalLottieCharacter;
