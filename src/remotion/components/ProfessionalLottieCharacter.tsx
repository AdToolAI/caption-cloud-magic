/**
 * 🚫 LOTTIE DEPRECATED — STUB COMPONENT
 * Ersetzt durch das neue Effekt-System (src/remotion/components/effects/).
 */

import React from 'react';

export interface PhonemeTimestamp {
  character: string;
  start_time: number;
  end_time: number;
}

export interface ProfessionalLottieCharacterProps {
  action?: string;
  position?: string;
  sceneType?: string;
  primaryColor?: string;
  skinTone?: string;
  shirtColor?: string;
  scale?: number;
  visible?: boolean;
  phonemeTimestamps?: PhonemeTimestamp[];
  playbackRate?: number;
  sceneStartTimeSeconds?: number;
  forceEmbeddedLottie?: boolean;
  brandColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  [key: string]: any;
}

export const ProfessionalLottieCharacter: React.FC<ProfessionalLottieCharacterProps> = () => null;
export default ProfessionalLottieCharacter;
