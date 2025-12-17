import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

// Types for phoneme timestamps from ElevenLabs
export interface PhonemeTimestamp {
  character: string;
  start_time: number; // in seconds
  end_time: number;
}

export interface RiveCharacterProps {
  // Phoneme data from ElevenLabs with-timestamps API
  phonemeTimestamps?: PhonemeTimestamp[];
  
  // Character configuration
  emotion?: 'neutral' | 'happy' | 'thinking' | 'concerned' | 'excited' | 'surprised';
  gesture?: 'idle' | 'pointing' | 'waving' | 'shrugging' | 'explaining' | 'celebrating';
  
  // Appearance
  skinTone?: string;
  shirtColor?: string;
  hairColor?: string;
  
  // Position & Style
  position?: 'left' | 'right' | 'center';
  scale?: number;
  
  // Animation delays
  entryDelay?: number;
  
  // 🎬 NEW: Optional Rive file URL for real Rive animations
  riveUrl?: string;
  
  // 🎬 NEW: State machine name in the .riv file
  stateMachineName?: string;
  
  // ✅ PHASE 5.1: Scene timing offset for correct lip-sync alignment
  sceneStartTimeSeconds?: number;
}

// Viseme mapping: Characters to mouth shapes
// Based on Preston Blair phoneme chart
const VISEME_MAP: Record<string, string> = {
  // Silence
  ' ': 'neutral',
  '.': 'neutral',
  ',': 'neutral',
  '!': 'neutral',
  '?': 'neutral',
  
  // A, I - Wide open
  'a': 'wide',
  'A': 'wide',
  'i': 'wide',
  'I': 'wide',
  'ä': 'wide',
  'Ä': 'wide',
  
  // E - Medium open
  'e': 'medium',
  'E': 'medium',
  
  // O - Round
  'o': 'round',
  'O': 'round',
  'ö': 'round',
  'Ö': 'round',
  
  // U - Small round
  'u': 'small_round',
  'U': 'small_round',
  'ü': 'small_round',
  'Ü': 'small_round',
  
  // M, B, P - Closed lips
  'm': 'closed',
  'M': 'closed',
  'b': 'closed',
  'B': 'closed',
  'p': 'closed',
  'P': 'closed',
  
  // F, V - Teeth on lip
  'f': 'teeth_lip',
  'F': 'teeth_lip',
  'v': 'teeth_lip',
  'V': 'teeth_lip',
  'w': 'teeth_lip',
  'W': 'teeth_lip',
  
  // TH - Tongue out
  't': 'teeth',
  'T': 'teeth',
  'd': 'teeth',
  'D': 'teeth',
  's': 'teeth',
  'S': 'teeth',
  'z': 'teeth',
  'Z': 'teeth',
  'ß': 'teeth',
  
  // L, N - Tongue up
  'l': 'tongue_up',
  'L': 'tongue_up',
  'n': 'tongue_up',
  'N': 'tongue_up',
  
  // R - Back
  'r': 'back',
  'R': 'back',
  
  // K, G - Back open
  'k': 'back_open',
  'K': 'back_open',
  'g': 'back_open',
  'G': 'back_open',
  'ch': 'back_open',
};

// Get viseme for current time
function getVisemeForTime(
  phonemes: PhonemeTimestamp[] | undefined,
  currentTimeSeconds: number
): string {
  if (!phonemes || phonemes.length === 0) return 'neutral';
  
  const currentPhoneme = phonemes.find(
    p => currentTimeSeconds >= p.start_time && currentTimeSeconds <= p.end_time
  );
  
  if (!currentPhoneme) return 'neutral';
  
  return VISEME_MAP[currentPhoneme.character] || 'medium';
}

// SVG Mouth shapes based on viseme
const MouthShape: React.FC<{ viseme: string; color?: string }> = ({ viseme, color = '#CC6666' }) => {
  const mouthPaths: Record<string, JSX.Element> = {
    neutral: (
      <ellipse cx="100" cy="95" rx="15" ry="3" fill={color} />
    ),
    wide: (
      <ellipse cx="100" cy="95" rx="20" ry="12" fill={color} />
    ),
    medium: (
      <ellipse cx="100" cy="95" rx="15" ry="8" fill={color} />
    ),
    round: (
      <ellipse cx="100" cy="95" rx="10" ry="12" fill={color} />
    ),
    small_round: (
      <ellipse cx="100" cy="95" rx="8" ry="10" fill={color} />
    ),
    closed: (
      <line x1="85" y1="95" x2="115" y2="95" stroke={color} strokeWidth="3" strokeLinecap="round" />
    ),
    teeth_lip: (
      <g>
        <ellipse cx="100" cy="95" rx="12" ry="6" fill={color} />
        <rect x="90" y="89" width="20" height="4" fill="white" rx="1" />
      </g>
    ),
    teeth: (
      <g>
        <ellipse cx="100" cy="95" rx="14" ry="8" fill={color} />
        <rect x="88" y="88" width="24" height="5" fill="white" rx="1" />
      </g>
    ),
    tongue_up: (
      <g>
        <ellipse cx="100" cy="95" rx="14" ry="8" fill={color} />
        <ellipse cx="100" cy="93" rx="8" ry="4" fill="#E88888" />
      </g>
    ),
    back: (
      <ellipse cx="100" cy="95" rx="12" ry="6" fill={color} />
    ),
    back_open: (
      <ellipse cx="100" cy="95" rx="16" ry="10" fill={color} />
    ),
  };
  
  return mouthPaths[viseme] || mouthPaths.neutral;
};

// Emotion-based eye expressions
const EyeExpression: React.FC<{ 
  emotion: string; 
  frame: number; 
  isBlinking: boolean;
}> = ({ emotion, frame, isBlinking }) => {
  // Blink animation
  const eyeHeight = isBlinking ? 1 : 10;
  
  // Emotion-based eye adjustments
  const eyeConfigs: Record<string, { y: number; rx: number; browY: number; browAngle: number }> = {
    neutral: { y: 70, rx: 8, browY: 58, browAngle: 0 },
    happy: { y: 72, rx: 10, browY: 56, browAngle: -5 },
    thinking: { y: 68, rx: 7, browY: 55, browAngle: 10 },
    concerned: { y: 70, rx: 8, browY: 60, browAngle: 15 },
    excited: { y: 68, rx: 10, browY: 54, browAngle: -10 },
    surprised: { y: 66, rx: 12, browY: 52, browAngle: -15 },
  };
  
  const config = eyeConfigs[emotion] || eyeConfigs.neutral;
  
  // Subtle eye movement
  const lookX = Math.sin(frame * 0.03) * 2;
  const lookY = Math.cos(frame * 0.02) * 1;
  
  return (
    <g>
      {/* Left eyebrow */}
      <line 
        x1="72" y1={config.browY} 
        x2="88" y2={config.browY - 2}
        stroke="#5D4037"
        strokeWidth="3"
        strokeLinecap="round"
        transform={`rotate(${config.browAngle}, 80, ${config.browY})`}
      />
      {/* Right eyebrow */}
      <line 
        x1="112" y1={config.browY - 2} 
        x2="128" y2={config.browY}
        stroke="#5D4037"
        strokeWidth="3"
        strokeLinecap="round"
        transform={`rotate(${-config.browAngle}, 120, ${config.browY})`}
      />
      
      {/* Left eye */}
      <ellipse 
        cx={80 + lookX} 
        cy={config.y + lookY} 
        rx={config.rx} 
        ry={eyeHeight} 
        fill="white" 
      />
      <ellipse 
        cx={82 + lookX * 1.2} 
        cy={config.y + lookY} 
        rx="4" 
        ry={Math.min(4, eyeHeight * 0.4)} 
        fill="#2D3748" 
      />
      {!isBlinking && (
        <ellipse cx={83 + lookX * 1.2} cy={config.y - 2 + lookY} rx="1.5" ry="1.5" fill="white" />
      )}
      
      {/* Right eye */}
      <ellipse 
        cx={120 + lookX} 
        cy={config.y + lookY} 
        rx={config.rx} 
        ry={eyeHeight} 
        fill="white" 
      />
      <ellipse 
        cx={122 + lookX * 1.2} 
        cy={config.y + lookY} 
        rx="4" 
        ry={Math.min(4, eyeHeight * 0.4)} 
        fill="#2D3748" 
      />
      {!isBlinking && (
        <ellipse cx={123 + lookX * 1.2} cy={config.y - 2 + lookY} rx="1.5" ry="1.5" fill="white" />
      )}
    </g>
  );
};

// Gesture-based arm positions
const ArmGesture: React.FC<{
  gesture: string;
  frame: number;
  shirtColor: string;
  skinTone: string;
}> = ({ gesture, frame, shirtColor, skinTone }) => {
  const gestureConfigs: Record<string, { 
    leftArm: string; 
    rightArm: string;
    leftHand: { cx: number; cy: number };
    rightHand: { cx: number; cy: number };
    animate?: boolean;
  }> = {
    idle: {
      leftArm: 'M 70 160 Q 50 200 55 250',
      rightArm: 'M 130 160 Q 150 200 145 250',
      leftHand: { cx: 55, cy: 255 },
      rightHand: { cx: 145, cy: 255 },
    },
    pointing: {
      leftArm: 'M 70 160 Q 50 200 55 250',
      rightArm: 'M 130 160 Q 170 130 200 110',
      leftHand: { cx: 55, cy: 255 },
      rightHand: { cx: 205, cy: 105 },
      animate: true,
    },
    waving: {
      leftArm: 'M 70 160 Q 50 200 55 250',
      rightArm: 'M 130 160 Q 160 100 170 80',
      leftHand: { cx: 55, cy: 255 },
      rightHand: { cx: 175, cy: 75 },
      animate: true,
    },
    shrugging: {
      leftArm: 'M 70 160 Q 40 140 30 160',
      rightArm: 'M 130 160 Q 160 140 170 160',
      leftHand: { cx: 25, cy: 165 },
      rightHand: { cx: 175, cy: 165 },
    },
    explaining: {
      leftArm: 'M 70 160 Q 30 180 20 200',
      rightArm: 'M 130 160 Q 170 180 180 200',
      leftHand: { cx: 15, cy: 205 },
      rightHand: { cx: 185, cy: 205 },
      animate: true,
    },
    celebrating: {
      leftArm: 'M 70 160 Q 30 100 40 60',
      rightArm: 'M 130 160 Q 170 100 160 60',
      leftHand: { cx: 35, cy: 55 },
      rightHand: { cx: 165, cy: 55 },
      animate: true,
    },
  };
  
  const config = gestureConfigs[gesture] || gestureConfigs.idle;
  
  // Animation for specific gestures
  let rightArmOffset = 0;
  let waveRotation = 0;
  
  if (config.animate) {
    if (gesture === 'pointing') {
      rightArmOffset = Math.sin(frame * 0.1) * 3;
    } else if (gesture === 'waving') {
      waveRotation = Math.sin(frame * 0.3) * 20;
    } else if (gesture === 'explaining') {
      rightArmOffset = Math.sin(frame * 0.15) * 8;
    } else if (gesture === 'celebrating') {
      rightArmOffset = Math.abs(Math.sin(frame * 0.2)) * 10;
    }
  }
  
  return (
    <g>
      {/* Left arm */}
      <path
        d={config.leftArm}
        fill="none"
        stroke={shirtColor}
        strokeWidth="25"
        strokeLinecap="round"
      />
      <ellipse 
        cx={config.leftHand.cx} 
        cy={config.leftHand.cy} 
        rx="12" 
        ry="12" 
        fill={skinTone}
      />
      
      {/* Right arm with animation */}
      <g transform={gesture === 'waving' ? `rotate(${waveRotation}, 130, 160)` : ''}>
        <path
          d={config.rightArm}
          fill="none"
          stroke={shirtColor}
          strokeWidth="25"
          strokeLinecap="round"
          transform={`translate(0, ${rightArmOffset})`}
        />
        <ellipse 
          cx={config.rightHand.cx} 
          cy={config.rightHand.cy + rightArmOffset} 
          rx="12" 
          ry="12" 
          fill={skinTone}
        />
        
        {/* Pointing finger indicator */}
        {gesture === 'pointing' && (
          <line
            x1={config.rightHand.cx}
            y1={config.rightHand.cy + rightArmOffset}
            x2={config.rightHand.cx + 20}
            y2={config.rightHand.cy + rightArmOffset - 10}
            stroke={skinTone}
            strokeWidth="6"
            strokeLinecap="round"
          />
        )}
      </g>
    </g>
  );
};

export const RiveCharacter: React.FC<RiveCharacterProps> = ({
  phonemeTimestamps,
  emotion = 'neutral',
  gesture = 'idle',
  skinTone = '#FFDAB9',
  shirtColor = '#F5C76A',
  hairColor = '#5D4037',
  position = 'left',
  scale = 1,
  entryDelay = 0,
  riveUrl,
  stateMachineName = 'State Machine 1',
  // ✅ PHASE 5.1: Scene timing offset for correct lip-sync alignment
  sceneStartTimeSeconds = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // ✅ PHASE 5.1: Calculate GLOBAL time for lip-sync lookup
  // Local frame is relative to scene start, add sceneStartTimeSeconds for global time
  const localTimeSeconds = frame / fps;
  const globalTimeSeconds = sceneStartTimeSeconds + localTimeSeconds;
  
  // Get current viseme for lip sync using GLOBAL time
  const currentViseme = useMemo(
    () => getVisemeForTime(phonemeTimestamps, globalTimeSeconds),
    [phonemeTimestamps, globalTimeSeconds]
  );
  
  // 🎬 Get mouth index for Rive state machine (0-10 scale)
  const mouthIndex = useMemo(() => {
    const visemeToMouthIndex: Record<string, number> = {
      neutral: 0,
      wide: 1,
      medium: 2,
      round: 3,
      small_round: 4,
      closed: 5,
      teeth_lip: 6,
      teeth: 7,
      tongue_up: 8,
      back: 9,
      back_open: 10,
    };
    return visemeToMouthIndex[currentViseme] ?? 0;
  }, [currentViseme]);
  
  // Entry animation
  const entryProgress = spring({
    frame: frame - entryDelay,
    fps,
    config: { damping: 12, stiffness: 80 },
  });
  
  // Breathing animation
  const breathe = Math.sin(frame * 0.08) * 2;
  
  // Head tilt (subtle)
  const headTilt = Math.sin(frame * 0.05) * 2;
  
  // Blink animation (every ~3 seconds at 30fps)
  const blinkCycle = frame % 90;
  const isBlinking = blinkCycle < 3;
  
  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: '5%', right: 'auto' },
    right: { right: '5%', left: 'auto' },
    center: { left: '50%', transform: `translateX(-50%) scale(${scale})` },
  };
  
  const characterScale = position === 'center' ? scale : scale;
  
  // 🎬 NEW: Render Rive component if URL provided
  // Note: For now we use the SVG fallback since Rive community files
  // require proper state machine setup. The infrastructure is ready
  // for when users provide their own .riv files.
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '5%',
        ...positionStyles[position],
        transform: `
          translateY(${breathe}px) 
          scale(${0.3 + 0.7 * Math.max(0, entryProgress)})
          scale(${characterScale})
        `,
        opacity: Math.max(0, entryProgress),
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      {/* SVG Character with Lip-Sync (optimized for Remotion rendering) */}
      <svg 
        width="200" 
        height="350" 
        viewBox="0 0 200 350"
        style={{ filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.3))' }}
      >
        {/* Body */}
        <ellipse cx="100" cy="220" rx="50" ry="70" fill={shirtColor} />
        
        {/* Neck */}
        <rect x="90" y="120" width="20" height="30" fill={skinTone} />
        
        {/* Head with tilt */}
        <g transform={`rotate(${headTilt}, 100, 80)`}>
          {/* Head shape */}
          <ellipse cx="100" cy="70" rx="45" ry="50" fill={skinTone} />
          
          {/* Hair */}
          <ellipse cx="100" cy="40" rx="42" ry="25" fill={hairColor} />
          <ellipse cx="60" cy="55" rx="10" ry="20" fill={hairColor} />
          <ellipse cx="140" cy="55" rx="10" ry="20" fill={hairColor} />
          
          {/* Ears */}
          <ellipse cx="55" cy="75" rx="8" ry="12" fill={skinTone} />
          <ellipse cx="145" cy="75" rx="8" ry="12" fill={skinTone} />
          
          {/* Eyes with emotion */}
          <EyeExpression emotion={emotion} frame={frame} isBlinking={isBlinking} />
          
          {/* Nose */}
          <ellipse cx="100" cy="82" rx="5" ry="6" fill={skinTone} opacity="0.5" />
          
          {/* Mouth with lip sync */}
          <MouthShape viseme={currentViseme} />
        </g>
        
        {/* Arms with gestures */}
        <ArmGesture 
          gesture={gesture} 
          frame={frame} 
          shirtColor={shirtColor}
          skinTone={skinTone}
        />
        
        {/* Legs */}
        <rect x="75" y="280" width="20" height="60" rx="8" fill="#1E3A5F" />
        <rect x="105" y="280" width="20" height="60" rx="8" fill="#1E3A5F" />
        
        {/* Shoes */}
        <ellipse cx="85" cy="345" rx="15" ry="8" fill="#2D3748" />
        <ellipse cx="115" cy="345" rx="15" ry="8" fill="#2D3748" />
      </svg>
      
      {/* 🎬 Debug: Display current lip-sync state */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{ 
          position: 'absolute', 
          bottom: -30, 
          left: 0, 
          fontSize: 10, 
          color: '#F5C76A',
          background: 'rgba(0,0,0,0.8)',
          padding: '2px 6px',
          borderRadius: 4,
        }}>
          Mouth: {mouthIndex} | {currentViseme}
        </div>
      )}
    </div>
  );
};

export default RiveCharacter;
