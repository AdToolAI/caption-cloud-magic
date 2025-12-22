import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useCurrentFrame, useVideoConfig, continueRender, delayRender } from 'remotion';
import { safeInterpolate as interpolate, safeDuration, safeSpring as spring } from '../utils/safeInterpolate';
import Rive, { Layout, Fit, Alignment, useRive, useStateMachineInput } from '@rive-app/react-canvas';

// Phoneme data from ElevenLabs
export interface PhonemeTimestamp {
  character: string;
  start_time: number;
  end_time: number;
}

export interface RiveCharacterRealProps {
  // Phoneme data for lip-sync
  phonemeTimestamps?: PhonemeTimestamp[];
  
  // Character emotion
  emotion?: 'neutral' | 'happy' | 'thinking' | 'concerned' | 'excited' | 'surprised';
  
  // Gesture animation
  gesture?: 'idle' | 'pointing' | 'waving' | 'shrugging' | 'explaining' | 'celebrating';
  
  // Rive file source (URL to .riv file)
  riveUrl?: string;
  
  // State machine name in the .riv file
  stateMachineName?: string;
  
  // Position & Style
  position?: 'left' | 'right' | 'center';
  scale?: number;
  
  // Entry delay in frames
  entryDelay?: number;
}

// Viseme mapping: Characters to mouth shape index (0-10 for standard lip-sync)
const CHAR_TO_MOUTH_INDEX: Record<string, number> = {
  // Silence = 0
  ' ': 0, '.': 0, ',': 0, '!': 0, '?': 0,
  
  // A, I = Wide open = 1
  'a': 1, 'A': 1, 'i': 1, 'I': 1, 'ä': 1, 'Ä': 1,
  
  // E = Medium = 2
  'e': 2, 'E': 2,
  
  // O = Round = 3
  'o': 3, 'O': 3, 'ö': 3, 'Ö': 3,
  
  // U = Small round = 4
  'u': 4, 'U': 4, 'ü': 4, 'Ü': 4,
  
  // M, B, P = Closed = 5
  'm': 5, 'M': 5, 'b': 5, 'B': 5, 'p': 5, 'P': 5,
  
  // F, V = Teeth on lip = 6
  'f': 6, 'F': 6, 'v': 6, 'V': 6, 'w': 6, 'W': 6,
  
  // TH, D, S = Teeth = 7
  't': 7, 'T': 7, 'd': 7, 'D': 7, 's': 7, 'S': 7, 'z': 7, 'Z': 7, 'ß': 7,
  
  // L, N = Tongue up = 8
  'l': 8, 'L': 8, 'n': 8, 'N': 8,
  
  // R = Back = 9
  'r': 9, 'R': 9,
  
  // K, G = Back open = 10
  'k': 10, 'K': 10, 'g': 10, 'G': 10,
};

// Get mouth index for current time
function getMouthIndexForTime(
  phonemes: PhonemeTimestamp[] | undefined,
  currentTimeSeconds: number
): number {
  if (!phonemes || phonemes.length === 0) return 0;
  
  const currentPhoneme = phonemes.find(
    p => currentTimeSeconds >= p.start_time && currentTimeSeconds <= p.end_time
  );
  
  if (!currentPhoneme) return 0;
  
  return CHAR_TO_MOUTH_INDEX[currentPhoneme.character] ?? 2;
}

// Emotion to state machine input mapping
const EMOTION_MAP: Record<string, number> = {
  neutral: 0,
  happy: 1,
  thinking: 2,
  concerned: 3,
  excited: 4,
  surprised: 5,
};

// Gesture to state machine input mapping
const GESTURE_MAP: Record<string, number> = {
  idle: 0,
  pointing: 1,
  waving: 2,
  shrugging: 3,
  explaining: 4,
  celebrating: 5,
};

// Free community Rive files that support state machine control
const FREE_RIVE_FILES = {
  // Simple character with basic expressions
  simple: 'https://cdn.rive.app/animations/vehicles.riv', // Example fallback
  
  // Use Rive's public demo files
  avatar: 'https://public.rive.app/community/runtime-files/2244-4043-avatar-demo.riv',
  
  // Alternative: Use inline data URI for a minimal character
  // (We'll create an SVG-based fallback below)
};

export const RiveCharacterReal: React.FC<RiveCharacterRealProps> = ({
  phonemeTimestamps,
  emotion = 'neutral',
  gesture = 'idle',
  riveUrl,
  stateMachineName = 'State Machine 1',
  position = 'left',
  scale = 1,
  entryDelay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeSeconds = frame / fps;
  
  // Calculate current mouth index for lip-sync
  const mouthIndex = useMemo(
    () => getMouthIndexForTime(phonemeTimestamps, currentTimeSeconds),
    [phonemeTimestamps, currentTimeSeconds]
  );
  
  // Use Rive hook
  const { rive, RiveComponent } = useRive({
    src: riveUrl || FREE_RIVE_FILES.simple,
    stateMachines: stateMachineName,
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
  });
  
  // Get state machine inputs
  const mouthInput = useStateMachineInput(rive, stateMachineName, 'mouth');
  const emotionInput = useStateMachineInput(rive, stateMachineName, 'emotion');
  const gestureInput = useStateMachineInput(rive, stateMachineName, 'gesture');
  
  // Update lip-sync input
  useEffect(() => {
    if (mouthInput && typeof mouthInput.value === 'number') {
      mouthInput.value = mouthIndex;
    }
  }, [mouthInput, mouthIndex]);
  
  // Update emotion input
  useEffect(() => {
    if (emotionInput && typeof emotionInput.value === 'number') {
      emotionInput.value = EMOTION_MAP[emotion] ?? 0;
    }
  }, [emotionInput, emotion]);
  
  // Update gesture input
  useEffect(() => {
    if (gestureInput && typeof gestureInput.value === 'number') {
      gestureInput.value = GESTURE_MAP[gesture] ?? 0;
    }
  }, [gestureInput, gesture]);
  
  // Entry animation
  const entryProgress = spring({
    frame: frame - entryDelay,
    fps,
    config: { damping: 12, stiffness: 80 },
  });
  
  // Breathing animation
  const breathe = Math.sin(frame * 0.08) * 2;
  
  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: '5%', right: 'auto' },
    right: { right: '5%', left: 'auto' },
    center: { left: '50%', transform: `translateX(-50%)` },
  };
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '5%',
        ...positionStyles[position],
        width: 200 * scale,
        height: 350 * scale,
        transform: `
          translateY(${breathe}px) 
          scale(${0.3 + 0.7 * Math.max(0, entryProgress)})
        `,
        opacity: Math.max(0, entryProgress),
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      <RiveComponent 
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
};

export default RiveCharacterReal;
