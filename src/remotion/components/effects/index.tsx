/**
 * Scene Effects Library — Lambda-safe, frame-deterministic visual layers.
 * Replaces the deprecated Lottie-based animation system.
 *
 * All effects:
 * - Use only `useCurrentFrame()` + `interpolate()` (no Math.random, no setTimeout)
 * - Pure CSS / SVG (no external assets, no @remotion/lottie)
 * - Composable: layer multiple effects per scene
 */

import React from 'react';
import { GlowOrbs } from './GlowOrbs';
import { LightRays } from './LightRays';
import { ParticleField } from './ParticleField';
import { GradientPulse } from './GradientPulse';
import { EdgeGlow } from './EdgeGlow';
import { ChromaticAberration } from './ChromaticAberration';

export { GlowOrbs, LightRays, ParticleField, GradientPulse, EdgeGlow, ChromaticAberration };

export type SceneEffectId =
  | 'glow-orbs'
  | 'light-rays'
  | 'particle-field'
  | 'gradient-pulse'
  | 'edge-glow'
  | 'chromatic-aberration';

export interface SceneEffectConfig {
  id: SceneEffectId;
  /** Optional color override (HSL string preferred). */
  color?: string;
  /** 0–1 intensity scaler. */
  intensity?: number;
}

export const SCENE_EFFECT_LABELS: Record<SceneEffectId, string> = {
  'glow-orbs': 'Glow Orbs',
  'light-rays': 'Light Rays',
  'particle-field': 'Particle Field',
  'gradient-pulse': 'Gradient Pulse',
  'edge-glow': 'Edge Glow',
  'chromatic-aberration': 'Chromatic Aberration',
};

export const ALL_SCENE_EFFECTS: SceneEffectId[] = [
  'glow-orbs',
  'light-rays',
  'particle-field',
  'gradient-pulse',
  'edge-glow',
  'chromatic-aberration',
];

/**
 * Renders a single effect by id. Used by the scene renderer to layer
 * AI-selected (or user-overridden) effects above the clip / image.
 */
export const SceneEffectRenderer: React.FC<{ effect: SceneEffectConfig }> = ({ effect }) => {
  const { id, color, intensity } = effect;
  switch (id) {
    case 'glow-orbs':
      return <GlowOrbs color={color} intensity={intensity} />;
    case 'light-rays':
      return <LightRays color={color} intensity={intensity} />;
    case 'particle-field':
      return <ParticleField color={color} intensity={intensity} />;
    case 'gradient-pulse':
      return <GradientPulse colorA={color} intensity={intensity} />;
    case 'edge-glow':
      return <EdgeGlow color={color} intensity={intensity} />;
    case 'chromatic-aberration':
      return <ChromaticAberration intensity={intensity} />;
    default:
      return null;
  }
};

/**
 * Renders a stacked list of effects above a transparent layer.
 * Order matters — last in array = topmost.
 */
export const SceneEffectsLayer: React.FC<{ effects?: SceneEffectConfig[] }> = ({ effects }) => {
  if (!effects || effects.length === 0) return null;
  return (
    <>
      {effects.map((eff, i) => (
        <SceneEffectRenderer key={`${eff.id}-${i}`} effect={eff} />
      ))}
    </>
  );
};
