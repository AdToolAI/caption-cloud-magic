import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { ColorGradingPreset } from '@/types/video-composer';

interface ColorGradingProps {
  preset: ColorGradingPreset;
  children: React.ReactNode;
}

const GRADING_FILTERS: Record<ColorGradingPreset, string> = {
  'none': 'none',
  'cinematic-warm': 'saturate(1.15) contrast(1.1) sepia(0.15) brightness(1.02)',
  'cool-blue': 'saturate(1.1) contrast(1.05) hue-rotate(10deg) brightness(1.03)',
  'vintage-film': 'saturate(0.85) contrast(1.15) sepia(0.25) brightness(0.95)',
  'high-contrast': 'saturate(1.2) contrast(1.35) brightness(0.98)',
  'moody-dark': 'saturate(0.9) contrast(1.2) brightness(0.82) sepia(0.08)',
};

export const ColorGrading: React.FC<ColorGradingProps> = ({ preset, children }) => {
  const filter = GRADING_FILTERS[preset] || 'none';

  return (
    <AbsoluteFill style={{ filter }}>
      {children}
    </AbsoluteFill>
  );
};
